import {
  buildSystemPrompt,
  getCompanionProfile,
  isRelationshipAssistantId,
  normalizeCompanionType,
} from "@/lib/chat/roles";
import { normalizeEmotion } from "@/lib/chat/emotion";
import { loadRelationshipStory } from "@/lib/db/relationshipStories";
import {
  createTextStream,
  requestAiChatCompletion,
  safeJsonParse,
} from "@/lib/server/ai-client";
import { getCurrentTimeInfo } from "@/lib/server/time-info";
import { getOptionalAuthenticatedServerUser } from "@/lib/supabase/server";

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

function readUpstreamEmotion(response) {
  return normalizeEmotion(
    response.headers.get("X-Emotion") ||
      response.headers.get("x-emotion") ||
      response.headers.get("emotion"),
  );
}

function normalizeUpstreamError(response, rawText) {
  const parsed = safeJsonParse(rawText);
  const rawMessage = parsed?.error?.message || parsed?.message || "";
  const status = response.status || 500;
  const normalized = rawMessage.toLowerCase();

  if (status === 429 || normalized.includes("rate limit") || normalized.includes("requests-per-minute")) {
    return {
      error: "AI 服务请求过于频繁，已被上游限流。请等待 30-60 秒后点“重新发送”。",
      code: "upstream_rate_limited",
      status,
    };
  }

  if (status === 503 && normalized.includes("no available channel")) {
    return {
      error: "当前 AI 模型通道暂不可用，请检查服务商后台是否已为 gpt-5.4 开通可用通道。",
      code: "upstream_model_unavailable",
      status,
    };
  }

  if (status === 503 || normalized.includes("temporarily unavailable")) {
    return {
      error: "AI 服务商临时不可用，我已经自动重试过。请稍等片刻后点“重新发送”。",
      code: "upstream_unavailable",
      status,
    };
  }

  if (status === 401 || status === 403) {
    return {
      error:
        rawMessage ||
        "AI 上游服务拒绝访问，请检查线上 AI_BASE_URL、AI_API_KEY、AI_MODEL 或上游域名访问权限。",
      code: "upstream_forbidden",
      status,
    };
  }

  return {
    error: rawMessage || "AI 服务暂时不可用，请稍后重试。",
    code: "upstream_error",
    status,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const messages = normalizeMessages(body?.messages);
    const timeInfo = getCurrentTimeInfo();
    const companionType = normalizeCompanionType(body?.companionType);
    const companion = getCompanionProfile(companionType);
    let relationshipStory = null;

    if (isRelationshipAssistantId(body?.assistantId || body?.roleId)) {
      try {
        const { supabase, user } = await getOptionalAuthenticatedServerUser(request);
        if (supabase && user) {
          relationshipStory = await loadRelationshipStory(
            supabase,
            user.id,
            body?.assistantId || body?.roleId,
          );
        }
      } catch (relationshipError) {
        console.error("读取 relationship story 失败:", relationshipError);
      }
    }

    const systemPrompt = buildSystemPrompt({
      assistantId: body?.assistantId,
      roleId: body?.roleId,
      companionType,
      userNickname: body?.userNickname,
      girlfriendStyleId: body?.girlfriendStyleId,
      customPersona: body?.customPersona,
      memorySummary: body?.memorySummary,
      relationshipStory,
      timeInfo,
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

      const upstreamError = normalizeUpstreamError(upstreamResponse, rawText);

      return Response.json(
        {
          error: upstreamError.error,
          code: upstreamError.code,
          upstreamStatus: upstreamError.status,
        },
        { status: upstreamError.status },
      );
    }

    const upstreamContentType = upstreamResponse.headers.get("Content-Type") || "";
    if (/text\/html/i.test(upstreamContentType)) {
      console.error("AI 接口返回 HTML，疑似 AI_BASE_URL 配置到了控制台页面:", upstreamContentType);
      return Response.json(
        {
          error: "AI_BASE_URL 返回了网页 HTML，不是 OpenAI 兼容模型接口。请填写接口根路径，而不是控制台页面地址。",
          code: "invalid_ai_base_url",
          upstreamContentType,
        },
        { status: 502 },
      );
    }

    return new Response(createTextStream(upstreamResponse.body), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Companion-Type": companionType,
        "X-Companion-Name": encodeURIComponent(companion.name),
        "X-Emotion": readUpstreamEmotion(upstreamResponse),
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
