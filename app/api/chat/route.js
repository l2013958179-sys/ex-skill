import { buildSystemPrompt } from "@/lib/chat/roles";
import {
  createTextStream,
  requestAiChatCompletion,
  safeJsonParse,
} from "@/lib/server/ai-client";

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim(),
    )
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
}

export async function POST(request) {
  try {
    const body = await request.json();
    const messages = normalizeMessages(body?.messages);
    const systemPrompt = buildSystemPrompt({
      roleId: body?.roleId,
      userNickname: body?.userNickname,
      girlfriendStyleId: body?.girlfriendStyleId,
      customPersona: body?.customPersona,
      memorySummary: body?.memorySummary,
    });

    if (!messages.length) {
      return Response.json(
        { error: "消息内容不能为空", code: "invalid_messages" },
        { status: 400 },
      );
    }

    const upstreamResponse = await requestAiChatCompletion({
      stream: true,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        ...messages,
      ],
    });

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      const rawText = await upstreamResponse.text();
      console.error("AI 接口调用失败:", upstreamResponse.status, rawText);

      const parsed = safeJsonParse(rawText);
      const upstreamMessage =
        parsed?.error?.message ||
        parsed?.message ||
        "AI 服务暂时不可用，请稍后重试。";

      return Response.json(
        {
          error: upstreamMessage,
          code: "upstream_error",
        },
        { status: upstreamResponse.status || 500 },
      );
    }

    return new Response(createTextStream(upstreamResponse.body), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    if (error?.code === "missing_api_key") {
      return Response.json(
        { error: "API Key 未配置", code: "missing_api_key" },
        { status: 500 },
      );
    }

    console.error("Serverless /api/chat 出错:", error);
    return Response.json(
      {
        error: "请求失败，请稍后重试。",
        code: "server_error",
      },
      { status: 500 },
    );
  }
}
