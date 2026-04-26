import { buildSystemPrompt } from "@/lib/chat/roles";
import {
  createTextStream,
  requestAiChatCompletion,
  safeJsonParse,
  getVisionModel,
} from "@/lib/server/ai-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string",
    )
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
}

function readApiErrorText(rawText) {
  const parsed = safeJsonParse(rawText);
  return parsed?.error?.message || parsed?.message || "AI 服务暂时不可用，请稍后重试。";
}

function isSupportedImageDataUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  const matched = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  return Boolean(matched?.[1] && SUPPORTED_IMAGE_TYPES.includes(matched[1]));
}

export async function POST(request) {
  const visionModel = getVisionModel();
  if (!visionModel) {
    return Response.json(
      {
        error: "当前模型暂不支持图片理解，请先配置支持视觉能力的 AI_VISION_MODEL。",
        code: "vision_not_supported",
      },
      { status: 400 },
    );
  }

  try {
    const body = await request.json();
    const messages = normalizeMessages(body?.messages);
    const imageDataUrl = body?.image?.dataUrl;
    const userText =
      typeof body?.userText === "string" && body.userText.trim()
        ? body.userText.trim()
        : "请看看这张图片，然后自然地和我聊聊。";

    if (!messages.length) {
      return Response.json(
        { error: "消息内容不能为空", code: "invalid_messages" },
        { status: 400 },
      );
    }

    if (!isSupportedImageDataUrl(imageDataUrl)) {
      return Response.json(
        { error: "仅支持 jpg / png / webp 图片", code: "invalid_image" },
        { status: 400 },
      );
    }

    const systemPrompt = buildSystemPrompt({
      roleId: body?.roleId,
      userNickname: body?.userNickname,
      girlfriendStyleId: body?.girlfriendStyleId,
      customPersona: body?.customPersona,
      memorySummary: body?.memorySummary,
    });

    const latestUserIndex = [...messages]
      .reverse()
      .findIndex((message) => message.role === "user");
    const resolvedLatestIndex =
      latestUserIndex === -1 ? -1 : messages.length - latestUserIndex - 1;

    const multimodalMessages = messages.map((message, index) => {
      if (index !== resolvedLatestIndex) {
        return message;
      }

      return {
        role: "user",
        content: [
          {
            type: "text",
            text: userText,
          },
          {
            type: "image_url",
            image_url: {
              url: imageDataUrl,
            },
          },
        ],
      };
    });

    const upstreamResponse = await requestAiChatCompletion({
      stream: true,
      temperature: 0.7,
      model: visionModel,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        ...multimodalMessages,
      ],
    });

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      const rawText = await upstreamResponse.text();
      console.error("AI 图片接口调用失败:", upstreamResponse.status, rawText);

      return Response.json(
        {
          error: readApiErrorText(rawText),
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

    console.error("Serverless /api/image-chat 出错:", error);
    return Response.json(
      {
        error: "图片请求失败，请稍后重试。",
        code: "server_error",
      },
      { status: 500 },
    );
  }
}
