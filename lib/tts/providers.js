export const TTS_PROVIDERS = {
  browser: "browser",
  volcengine: "volcengine",
  iflytek: "iflytek",
  edge: "edge",
  aliyun: "aliyun",
};

export const TTS_PROVIDER_OPTIONS = [
  {
    id: TTS_PROVIDERS.browser,
    label: "浏览器语音",
    description: "默认使用 SpeechSynthesis API",
    status: "ready",
    routeKind: "client",
    supportsPreview: true,
    envKeys: [],
  },
  {
    id: TTS_PROVIDERS.volcengine,
    label: "火山引擎 TTS",
    description: "适合中文陪伴音色，已预留服务端模板",
    status: "template",
    routeKind: "server",
    supportsPreview: true,
    envKeys: [
      "VOLCENGINE_TTS_APP_ID",
      "VOLCENGINE_TTS_ACCESS_TOKEN",
      "VOLCENGINE_TTS_CLUSTER",
      "VOLCENGINE_TTS_VOICE_TYPE",
    ],
  },
  {
    id: TTS_PROVIDERS.iflytek,
    label: "讯飞 TTS",
    description: "支持中文场景，已预留服务端模板",
    status: "template",
    routeKind: "server",
    supportsPreview: true,
    envKeys: [
      "IFLYTEK_TTS_APP_ID",
      "IFLYTEK_TTS_API_KEY",
      "IFLYTEK_TTS_API_SECRET",
      "IFLYTEK_TTS_VOICE_NAME",
    ],
  },
  {
    id: TTS_PROVIDERS.edge,
    label: "Edge TTS",
    description: "方便快速验证多中文音色，已预留服务端模板",
    status: "template",
    routeKind: "server",
    supportsPreview: true,
    envKeys: ["EDGE_TTS_VOICE_NAME"],
  },
  {
    id: TTS_PROVIDERS.aliyun,
    label: "阿里云 TTS",
    description: "企业接入常见方案，已预留服务端模板",
    status: "template",
    routeKind: "server",
    supportsPreview: true,
    envKeys: [
      "ALIYUN_TTS_ACCESS_KEY_ID",
      "ALIYUN_TTS_ACCESS_KEY_SECRET",
      "ALIYUN_TTS_APP_KEY",
      "ALIYUN_TTS_VOICE",
    ],
  },
];

export function isBrowserTtsProvider(provider) {
  return provider === TTS_PROVIDERS.browser;
}

export function normalizeTtsProvider(provider) {
  if (typeof provider !== "string") {
    return TTS_PROVIDERS.browser;
  }

  const normalized = provider.trim().toLowerCase();
  return TTS_PROVIDER_OPTIONS.find((item) => item.id === normalized)?.id || TTS_PROVIDERS.browser;
}

export function getTtsProviderOption(provider) {
  return (
    TTS_PROVIDER_OPTIONS.find((item) => item.id === normalizeTtsProvider(provider)) ||
    TTS_PROVIDER_OPTIONS[0]
  );
}

export function getTtsProviderLabel(provider) {
  return getTtsProviderOption(provider).label;
}

export function getTtsProviderEnvKeys(provider) {
  return getTtsProviderOption(provider).envKeys || [];
}
