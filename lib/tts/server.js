import {
  TTS_PROVIDERS,
  TTS_PROVIDER_OPTIONS,
  getTtsProviderEnvKeys,
  getTtsProviderOption,
  normalizeTtsProvider,
} from "@/lib/tts/providers";

const DEFAULT_SAMPLE_TEXT =
  "今天辛苦了，我在。你可以慢慢说，我们一件一件来。";

export const TTS_SERVER_TEMPLATES = {
  [TTS_PROVIDERS.volcengine]: {
    adapterKey: "synthesizeWithVolcengine",
    requestShape: {
      voice: "BV001_streaming",
      format: "mp3",
      sampleRate: 24000,
      emotion: "calm",
    },
    nextSteps: [
      "在 lib/tts/server.js 的 synthesizeWithVolcengine 中填入真实 HTTP 请求。",
      "把供应商返回的二进制音频转成 Response，并附带正确的 Content-Type。",
      "根据角色分别映射小柠 / 阿辰的 voice、style 和 emotion 参数。",
    ],
  },
  [TTS_PROVIDERS.iflytek]: {
    adapterKey: "synthesizeWithIflytek",
    requestShape: {
      voice: "xiaoyan",
      format: "mp3",
      speed: 45,
      pitch: 50,
    },
    nextSteps: [
      "补齐鉴权签名与 websocket/http 请求。",
      "把 speed、pitch 映射到统一的 0-1 或 0-100 范围。",
      "接入后优先验证中文停顿与长句表现。",
    ],
  },
  [TTS_PROVIDERS.edge]: {
    adapterKey: "synthesizeWithEdge",
    requestShape: {
      voice: "zh-CN-XiaoxiaoNeural",
      format: "audio-24khz-48kbitrate-mono-mp3",
      style: "calm",
      rate: "+0%",
    },
    nextSteps: [
      "接入 Edge TTS 服务或你自己的代理层。",
      "把统一设置映射为 SSML 风格的 rate、pitch、style。",
      "如果后续要做更细的嘴型联动，可以在这里附带单词/音素时间戳。",
    ],
  },
  [TTS_PROVIDERS.aliyun]: {
    adapterKey: "synthesizeWithAliyun",
    requestShape: {
      voice: "xiaoyun",
      format: "mp3",
      sampleRate: 24000,
      speechRate: 0,
    },
    nextSteps: [
      "在服务端签名并调用阿里云 TTS。",
      "为陪伴场景补充 voice / volume / speechRate 默认值。",
      "确认失败时返回 JSON 错误，成功时返回音频流。",
    ],
  },
};

function isProviderConfigured(provider) {
  const envKeys = getTtsProviderEnvKeys(provider);
  if (!envKeys.length) {
    return true;
  }

  return envKeys.every((key) => Boolean(process.env[key]));
}

function buildProviderCatalogItem(provider) {
  const option = getTtsProviderOption(provider);
  const template = TTS_SERVER_TEMPLATES[provider];

  return {
    id: option.id,
    label: option.label,
    description: option.description,
    status: option.status,
    routeKind: option.routeKind,
    envKeys: option.envKeys,
    configured: isProviderConfigured(provider),
    adapterKey: template?.adapterKey || "",
    requestShape: template?.requestShape || {},
    nextSteps: template?.nextSteps || [],
  };
}

export function getTtsProviderCatalog() {
  return TTS_PROVIDER_OPTIONS.map((option) => buildProviderCatalogItem(option.id));
}

export function sanitizeTtsText(value) {
  return typeof value === "string" ? value.trim().slice(0, 1200) : "";
}

export function validateTtsTemplatePayload(payload = {}) {
  const provider = normalizeTtsProvider(payload.provider);
  const text = sanitizeTtsText(payload.text);

  if (!text) {
    return {
      ok: false,
      status: 400,
      error: "text 不能为空",
      code: "invalid_text",
    };
  }

  if (provider === TTS_PROVIDERS.browser) {
    return {
      ok: false,
      status: 400,
      error: "browser provider 应在前端直接调用，不走服务端 TTS 模板接口。",
      code: "browser_provider_not_supported",
    };
  }

  return {
    ok: true,
    provider,
    text,
    voice: typeof payload.voice === "string" ? payload.voice.trim() : "",
    format: typeof payload.format === "string" ? payload.format.trim() : "mp3",
    emotion: typeof payload.emotion === "string" ? payload.emotion.trim() : "normal",
    companionType: typeof payload.companionType === "string" ? payload.companionType.trim() : "",
    metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
  };
}

export function buildTtsTemplateResponse(payload) {
  const provider = normalizeTtsProvider(payload.provider);
  const option = getTtsProviderOption(provider);
  const template = TTS_SERVER_TEMPLATES[provider];

  return {
    status: "template_ready",
    provider,
    providerLabel: option.label,
    configured: isProviderConfigured(provider),
    endpoint: "/api/tts",
    adapterKey: template?.adapterKey || "",
    requiredEnv: getTtsProviderEnvKeys(provider),
    requestContract: {
      method: "POST",
      contentType: "application/json",
      body: {
        provider,
        text: payload.text || DEFAULT_SAMPLE_TEXT,
        voice: payload.voice || template?.requestShape?.voice || "",
        format: payload.format || template?.requestShape?.format || "mp3",
        emotion: payload.emotion || "normal",
        companionType: payload.companionType || "girlfriend",
        metadata: payload.metadata || {
          sessionId: "demo-session",
          messageId: "assistant-message-id",
        },
      },
    },
    responseContract: {
      success: "返回音频流，例如 audio/mpeg、audio/wav 或 audio/ogg。",
      error: "返回 JSON，包含 error 与 code 字段。",
      recommendedHeaders: ["Content-Type", "Cache-Control", "X-TTS-Provider", "X-TTS-Voice"],
    },
    nextSteps: template?.nextSteps || [],
  };
}

export async function synthesizeSpeechTemplate(payload) {
  const validated = validateTtsTemplatePayload(payload);
  if (!validated.ok) {
    return validated;
  }

  return {
    ok: false,
    status: 501,
    code: "tts_provider_not_implemented",
    error: "当前第三方 TTS provider 还未接入真实请求，已返回模板说明。",
    template: buildTtsTemplateResponse(validated),
  };
}
