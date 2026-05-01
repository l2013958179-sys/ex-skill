const DEFAULT_CUBISM_CORE_URL =
  process.env.NEXT_PUBLIC_LIVE2D_CORE_URL ||
  "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js";

const DEFAULT_EXPRESSION_MAP = {
  happy: process.env.NEXT_PUBLIC_LIVE2D_EXPRESSION_HAPPY || "f05",
  sad: process.env.NEXT_PUBLIC_LIVE2D_EXPRESSION_SAD || "f03",
  normal: process.env.NEXT_PUBLIC_LIVE2D_EXPRESSION_NORMAL || "default",
};

const DEFAULT_SPEECH_MOTION = {
  mouthParamCandidates: ["ParamMouthOpenY", "PARAM_MOUTH_OPEN_Y", "MouthOpenY"],
  breathParamCandidates: ["ParamBreath", "PARAM_BREATH", "Breath"],
  mouthIdle: 0.04,
  mouthAmplitude: 0.7,
  breathBase: 0.18,
  breathAmplitude: 0.12,
  breathSpeed: 0.0018,
  speakingSpeed: 0.019,
};

export const LIVE2D_MODEL_LIBRARY = {
  girlfriend: {
    id: "girlfriend",
    name: "小柠",
    title: "温柔剑士系 AI 女友",
    subtitle: "暖光、治愈、坚定，像会陪你一起穿过风雨的人。",
    modelUrl:
      process.env.NEXT_PUBLIC_LIVE2D_GIRLFRIEND_MODEL_URL ||
      process.env.NEXT_PUBLIC_LIVE2D_MODEL_URL ||
      "/live2d/girlfriend/model3.json",
    modelDirectory: "/public/live2d/girlfriend/",
    coreUrl: DEFAULT_CUBISM_CORE_URL,
    expressionMap: DEFAULT_EXPRESSION_MAP,
    tapMotionGroup: process.env.NEXT_PUBLIC_LIVE2D_TAP_MOTION || "",
    speechMotion: {
      ...DEFAULT_SPEECH_MOTION,
      mouthAmplitude: 0.74,
      breathBase: 0.22,
      breathAmplitude: 0.14,
      breathSpeed: 0.002,
      speakingSpeed: 0.022,
    },
    placeholder: {
      avatar: "柠",
      badge: "Warm Blade",
      title: "小柠的 Live2D 形象待装配",
      description: "现在会先显示原创占位卡片，聊天、记忆、语音和情绪联动都会继续正常工作。",
    },
  },
  boyfriend: {
    id: "boyfriend",
    name: "阿辰",
    title: "黑衣剑士系 AI 男友",
    subtitle: "冷静、可靠、守护感在线，像会稳稳挡在你身前的人。",
    modelUrl:
      process.env.NEXT_PUBLIC_LIVE2D_BOYFRIEND_MODEL_URL || "/live2d/boyfriend/model3.json",
    modelDirectory: "/public/live2d/boyfriend/",
    coreUrl: DEFAULT_CUBISM_CORE_URL,
    expressionMap: DEFAULT_EXPRESSION_MAP,
    tapMotionGroup: process.env.NEXT_PUBLIC_LIVE2D_TAP_MOTION || "",
    speechMotion: {
      ...DEFAULT_SPEECH_MOTION,
      mouthAmplitude: 0.64,
      breathBase: 0.16,
      breathAmplitude: 0.1,
      breathSpeed: 0.00155,
      speakingSpeed: 0.017,
    },
    placeholder: {
      avatar: "辰",
      badge: "Night Guard",
      title: "阿辰的 Live2D 形象待装配",
      description: "当前会优先使用原创占位卡片，页面不会中断，后续只需替换模型文件即可。",
    },
  },
};

export function getLive2dModelConfig(companionType = "girlfriend") {
  return LIVE2D_MODEL_LIBRARY[companionType] || LIVE2D_MODEL_LIBRARY.girlfriend;
}
