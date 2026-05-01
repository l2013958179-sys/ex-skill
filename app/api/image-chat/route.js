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
  getVisionModel,
} from "@/lib/server/ai-client";
import { getCurrentTimeInfo } from "@/lib/server/time-info";
import { getOptionalAuthenticatedServerUser } from "@/lib/supabase/server";

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

function normalizeUpstreamError(response, rawText) {
  const parsed = safeJsonParse(rawText);
  const rawMessage = parsed?.error?.message || parsed?.message || "";
  const status = response.status || 500;
  const normalized = rawMessage.toLowerCase();

  if (status === 429 || normalized.includes("rate limit") || normalized.includes("requests-per-minute")) {
    return {
      error: "AI 图片理解请求过于频繁，已被上游限流。请等待 30-60 秒后点“重新发送”。",
      code: "upstream_rate_limited",
      status,
    };
  }

  if (status === 503 && normalized.includes("no available channel")) {
    return {
      error: "当前视觉模型通道暂不可用，请检查服务商后台是否已为 AI_VISION_MODEL 开通可用通道。",
      code: "upstream_model_unavailable",
      status,
    };
  }

  if (status === 503 || normalized.includes("temporarily unavailable")) {
    return {
      error: "AI 图片理解服务临时不可用，我已经自动重试过。请稍等片刻后点“重新发送”。",
      code: "upstream_unavailable",
      status,
    };
  }

  if (status === 401 || status === 403) {
    return {
      error:
        rawMessage ||
        "AI 上游服务拒绝访问，请检查线上 AI_BASE_URL、AI_API_KEY、AI_VISION_MODEL 或上游域名访问权限。",
      code: "upstream_forbidden",
      status,
    };
  }

  return {
    error: readApiErrorText(rawText),
    code: "upstream_error",
    status,
  };
}

function isSupportedImageDataUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  const matched = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  return Boolean(matched?.[1] && SUPPORTED_IMAGE_TYPES.includes(matched[1]));
}

function isRemoteImageUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function readUpstreamEmotion(response) {
  return normalizeEmotion(
    response.headers.get("X-Emotion") ||
      response.headers.get("x-emotion") ||
      response.headers.get("emotion"),
  );
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
    const timeInfo = getCurrentTimeInfo();
    const companionType = normalizeCompanionType(body?.companionType);
    const companion = getCompanionProfile(companionType);
    const imageDataUrl = body?.image?.dataUrl;
    const remoteImageUrl = body?.image?.url;
    const resolvedImageUrl = isSupportedImageDataUrl(imageDataUrl)
      ? imageDataUrl
      : isRemoteImageUrl(remoteImageUrl)
        ? remoteImageUrl
        : "";
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

    if (!resolvedImageUrl) {
      return Response.json(
        { error: "仅支持 jpg / png / webp 图片", code: "invalid_image" },
        { status: 400 },
      );
    }

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
              url: resolvedImageUrl,
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
      console.error("AI 图片接口返回 HTML，疑似 AI_BASE_URL 配置到了控制台页面:", upstreamContentType);
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
