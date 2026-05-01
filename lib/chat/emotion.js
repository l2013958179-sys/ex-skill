export const COMPANION_EMOTIONS = ["happy", "sad", "normal"];

export function parseEmotion(value) {
  return COMPANION_EMOTIONS.includes(value) ? value : "";
}

export function normalizeEmotion(value) {
  return parseEmotion(value) || "normal";
}

export function resolveEmotion(...values) {
  let fallback = "";

  for (const value of values) {
    const parsed = parseEmotion(value);
    if (!parsed) {
      continue;
    }

    if (parsed !== "normal") {
      return parsed;
    }

    fallback = "normal";
  }

  return fallback || "normal";
}

export function getEmotionLabel(emotion) {
  switch (normalizeEmotion(emotion)) {
    case "happy":
      return "开心";
    case "sad":
      return "失落";
    default:
      return "平静";
  }
}

export function inferEmotionFromText(value) {
  const text = typeof value === "string" ? value.toLowerCase() : "";
  if (!text) {
    return "normal";
  }

  if (/(开心|高兴|笑|甜|喜欢|爱你|抱抱|亲亲|嘿嘿|哈哈|太好啦|真棒|安心)/.test(text)) {
    return "happy";
  }

  if (/(难过|委屈|伤心|心疼|失落|哭|抱歉|对不起|遗憾|沮丧|别怕|辛苦了)/.test(text)) {
    return "sad";
  }

  return "normal";
}
