export const MEMORY_TYPES = [
  "memory_summary",
  "preferred_names",
  "speaking_style",
  "frequent_topics",
  "emotion_tendency",
  "life_habits",
  "important_people_events",
  "likes_dislikes",
];

export const MEMORY_LABELS = {
  memory_summary: "记忆总结",
  preferred_names: "常用称呼",
  speaking_style: "说话风格",
  frequent_topics: "常聊话题",
  emotion_tendency: "情绪倾向",
  life_habits: "生活习惯",
  important_people_events: "重要人物 / 事件",
  likes_dislikes: "喜欢和不喜欢",
};

const MEMORY_ANALYSIS_KEY_MAP = {
  memory_summary: "summary",
  preferred_names: "preferred_names",
  speaking_style: "speaking_style",
  frequent_topics: "frequent_topics",
  emotion_tendency: "emotion_tendency",
  life_habits: "life_habits",
  important_people_events: "important_people_events",
  likes_dislikes: "likes_dislikes",
};

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `memory_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function normalizeMemoryText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeMemoryItem(item, fallbackType = "memory_summary") {
  const memoryType = MEMORY_TYPES.includes(item?.memoryType)
    ? item.memoryType
    : MEMORY_TYPES.includes(item?.memory_type)
      ? item.memory_type
      : fallbackType;

  return {
    id: typeof item?.id === "string" ? item.id : createId(),
    memoryType,
    content: normalizeMemoryText(item?.content),
    source: normalizeMemoryText(item?.source) || "manual",
    createdAt:
      typeof item?.createdAt === "string"
        ? item.createdAt
        : typeof item?.created_at === "string"
          ? item.created_at
          : new Date().toISOString(),
    updatedAt:
      typeof item?.updatedAt === "string"
        ? item.updatedAt
        : typeof item?.updated_at === "string"
          ? item.updated_at
          : new Date().toISOString(),
  };
}

export function normalizeMemoryItems(items) {
  const byType = new Map();

  for (const memoryType of MEMORY_TYPES) {
    const matched = Array.isArray(items)
      ? items.find(
          (item) =>
            item &&
            (item.memoryType === memoryType || item.memory_type === memoryType) &&
            normalizeMemoryText(item.content),
        )
      : null;

    if (matched) {
      byType.set(memoryType, normalizeMemoryItem(matched, memoryType));
    }
  }

  return MEMORY_TYPES.map((memoryType) => byType.get(memoryType)).filter(Boolean);
}

export function mergeMemoryItems(currentItems, incomingItems) {
  const currentMap = new Map(
    normalizeMemoryItems(currentItems).map((item) => [item.memoryType, item]),
  );

  for (const item of normalizeMemoryItems(incomingItems)) {
    currentMap.set(item.memoryType, item);
  }

  return MEMORY_TYPES.map((memoryType) => currentMap.get(memoryType)).filter(
    (item) => item && normalizeMemoryText(item.content),
  );
}

export function upsertMemoryItem(items, nextItem) {
  const normalized = normalizeMemoryItem(nextItem);
  const nextItems = normalizeMemoryItems(items).filter(
    (item) => item.memoryType !== normalized.memoryType,
  );

  if (!normalized.content) {
    return nextItems;
  }

  return normalizeMemoryItems([...nextItems, normalized]);
}

export function removeMemoryItem(items, memoryType) {
  return normalizeMemoryItems(items).filter((item) => item.memoryType !== memoryType);
}

export function buildMemoryItemsFromAnalysis(analysis, source = "wechat_import") {
  const now = new Date().toISOString();

  return MEMORY_TYPES.map((memoryType) => {
    const content = normalizeMemoryText(analysis?.[MEMORY_ANALYSIS_KEY_MAP[memoryType]]);
    if (!content) {
      return null;
    }

    return {
      id: createId(),
      memoryType,
      content,
      source,
      createdAt: now,
      updatedAt: now,
    };
  }).filter(Boolean);
}

export function buildMemorySummaryText(items) {
  const normalized = normalizeMemoryItems(items);
  if (!normalized.length) {
    return "";
  }

  return normalized
    .map((item) => `- ${MEMORY_LABELS[item.memoryType]}：${item.content}`)
    .join("\n");
}

export function getMemoryItemContent(items, memoryType) {
  return (
    normalizeMemoryItems(items).find((item) => item.memoryType === memoryType)?.content || ""
  );
}
