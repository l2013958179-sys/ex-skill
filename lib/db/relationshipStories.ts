import { isSupabaseSchemaMissingError } from "@/lib/supabase/client";

const UNKNOWN = "未知";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUnknownText(value: unknown, preserveBlank = false) {
  const text = normalizeText(value);
  if (preserveBlank) {
    return text;
  }

  return text || UNKNOWN;
}

function isPlainObject(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clampConfidence(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, numeric));
}

function clampInt(value: unknown, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, Math.round(numeric)));
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function normalizeSharedMemories(value: unknown, preserveBlank = false) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item: any) => ({
      title: normalizeUnknownText(item?.title, preserveBlank),
      summary: normalizeUnknownText(item?.summary, preserveBlank),
      emotion: normalizeUnknownText(item?.emotion, preserveBlank),
      confidence: clampConfidence(item?.confidence, 0.8),
    }))
    .filter(
      (item) =>
        item.title !== UNKNOWN ||
        item.summary !== UNKNOWN ||
        item.emotion !== UNKNOWN ||
        item.confidence !== 0.8,
    );
}

function normalizeTimeline(value: unknown, preserveBlank = false) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item: any) => ({
      event: normalizeUnknownText(item?.event, preserveBlank),
      confidence: clampConfidence(item?.confidence, 0.7),
    }))
    .filter((item) => item.event !== UNKNOWN || item.confidence !== 0.7);
}

function normalizeRoleplaySuggestions(value: unknown, preserveBlank = false) {
  const source = isPlainObject(value) ? (value as Record<string, unknown>) : {};

  return {
    addressing_style: normalizeUnknownText(source.addressing_style, preserveBlank),
    tone: normalizeUnknownText(source.tone, preserveBlank),
    initiative_level: normalizeUnknownText(source.initiative_level, preserveBlank),
    emotional_intensity: normalizeUnknownText(source.emotional_intensity, preserveBlank),
    special_traits: normalizeUnknownText(source.special_traits, preserveBlank),
  };
}

function formatList(values: string[]) {
  return values.length ? values.join(" / ") : UNKNOWN;
}

function formatSharedMemories(values: Array<Record<string, unknown>>) {
  if (!values.length) {
    return UNKNOWN;
  }

  return values
    .map((item) => {
      const title = normalizeUnknownText(item.title);
      const summary = normalizeUnknownText(item.summary);
      const emotion = normalizeUnknownText(item.emotion);
      const confidence = clampConfidence(item.confidence, 0.8);
      return `- ${title}：${summary}（情绪：${emotion}；置信度：${confidence}）`;
    })
    .join("\n");
}

function formatRoleplaySuggestions(value: Record<string, unknown>) {
  const normalized = normalizeRoleplaySuggestions(value);
  return [
    `称呼方式：${normalized.addressing_style}`,
    `语气：${normalized.tone}`,
    `主动程度：${normalized.initiative_level}`,
    `情感强度：${normalized.emotional_intensity}`,
    `特殊特征：${normalized.special_traits}`,
  ].join("；");
}

export function createEmptyRelationshipStoryDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: normalizeText(overrides.id),
    user_id: normalizeText(overrides.user_id),
    assistant_id: normalizeText(overrides.assistant_id),
    story_text: normalizeText(overrides.story_text),
    relationship_stage: normalizeText(overrides.relationship_stage),
    relationship_trend: normalizeText(overrides.relationship_trend),
    how_met: normalizeText(overrides.how_met),
    user_personality: normalizeText(overrides.user_personality),
    partner_personality: normalizeText(overrides.partner_personality),
    partner_role: normalizeText(overrides.partner_role),
    user_nicknames: normalizeStringArray(overrides.user_nicknames),
    partner_nicknames: normalizeStringArray(overrides.partner_nicknames),
    chat_style: normalizeText(overrides.chat_style),
    emotional_expression: normalizeText(overrides.emotional_expression),
    shared_memories: normalizeSharedMemories(overrides.shared_memories, true),
    timeline: normalizeTimeline(overrides.timeline, true),
    user_boundaries: normalizeText(overrides.user_boundaries),
    partner_boundaries: normalizeText(overrides.partner_boundaries),
    preferences: normalizeText(overrides.preferences),
    intimacy_score: clampInt(overrides.intimacy_score, 0),
    relationship_summary: normalizeText(overrides.relationship_summary),
    roleplay_suggestions: normalizeRoleplaySuggestions(overrides.roleplay_suggestions, true),
    raw_analysis: isPlainObject(overrides.raw_analysis) ? overrides.raw_analysis : {},
    created_at: normalizeText(overrides.created_at),
    updated_at: normalizeText(overrides.updated_at),
  };
}

export function normalizeRelationshipStoryAnalysis(
  source: Record<string, unknown> = {},
  options: Record<string, unknown> = {},
) {
  const preserveBlank = Boolean(options.preserveBlank);
  const assistantId = normalizeText(options.assistantId ?? source.assistant_id);
  const storyText = normalizeText(options.storyText ?? source.story_text);

  return {
    assistant_id: assistantId,
    story_text: storyText,
    relationship_stage: normalizeUnknownText(source.relationship_stage, preserveBlank),
    relationship_trend: normalizeUnknownText(source.relationship_trend, preserveBlank),
    how_met: normalizeUnknownText(source.how_met, preserveBlank),
    user_personality: normalizeUnknownText(source.user_personality, preserveBlank),
    partner_personality: normalizeUnknownText(source.partner_personality, preserveBlank),
    partner_role: normalizeUnknownText(source.partner_role, preserveBlank),
    user_nicknames: normalizeStringArray(source.user_nicknames),
    partner_nicknames: normalizeStringArray(source.partner_nicknames),
    chat_style: normalizeUnknownText(source.chat_style, preserveBlank),
    emotional_expression: normalizeUnknownText(source.emotional_expression, preserveBlank),
    shared_memories: normalizeSharedMemories(source.shared_memories, preserveBlank),
    timeline: normalizeTimeline(source.timeline, preserveBlank),
    user_boundaries: normalizeUnknownText(source.user_boundaries, preserveBlank),
    partner_boundaries: normalizeUnknownText(source.partner_boundaries, preserveBlank),
    preferences: normalizeUnknownText(source.preferences, preserveBlank),
    intimacy_score: clampInt(source.intimacy_score, 0),
    relationship_summary: normalizeUnknownText(source.relationship_summary, preserveBlank),
    roleplay_suggestions: normalizeRoleplaySuggestions(source.roleplay_suggestions, preserveBlank),
    raw_analysis:
      isPlainObject(source.raw_analysis) && Object.keys(source.raw_analysis).length
        ? source.raw_analysis
        : isPlainObject(source)
          ? source
          : {},
  };
}

export function normalizeRelationshipStoryRecord(source: Record<string, unknown> | null) {
  if (!source) {
    return null;
  }

  const normalized = normalizeRelationshipStoryAnalysis(source, {
    assistantId: source.assistant_id,
    storyText: source.story_text,
  });

  return {
    id: normalizeText(source.id),
    user_id: normalizeText(source.user_id),
    created_at: normalizeText(source.created_at),
    updated_at: normalizeText(source.updated_at),
    ...normalized,
  };
}

export function buildRelationshipStoryPrompt(story: Record<string, unknown> | null) {
  const normalized = normalizeRelationshipStoryRecord(story);
  if (!normalized) {
    return "";
  }

  return [
    "【我们的故事】",
    `关系阶段：${normalized.relationship_stage}`,
    `关系趋势：${normalized.relationship_trend}`,
    `相识方式：${normalized.how_met}`,
    `关系摘要：${normalized.relationship_summary}`,
    `用户性格：${normalized.user_personality}`,
    `对方性格：${normalized.partner_personality}`,
    `常用称呼：${formatList(normalized.user_nicknames)} / ${formatList(normalized.partner_nicknames)}`,
    `聊天风格：${normalized.chat_style}`,
    `情感表达：${normalized.emotional_expression}`,
    `重要回忆：${formatSharedMemories(normalized.shared_memories)}`,
    `相处边界：${normalized.user_boundaries} / ${normalized.partner_boundaries}`,
    `偏好：${normalized.preferences}`,
    `AI 扮演建议：${formatRoleplaySuggestions(normalized.roleplay_suggestions)}`,
  ].join("\n");
}

export async function loadRelationshipStory(supabase: any, userId: string, assistantId: string) {
  if (!supabase || !userId || !assistantId) {
    return null;
  }

  const { data, error } = await supabase
    .from("relationship_stories")
    .select("*")
    .eq("user_id", userId)
    .eq("assistant_id", assistantId)
    .maybeSingle();

  if (error) {
    if (isSupabaseSchemaMissingError(error)) {
      return null;
    }

    throw error;
  }

  return normalizeRelationshipStoryRecord(data || null);
}

export async function upsertRelationshipStory(
  supabase: any,
  userId: string,
  assistantId: string,
  payload: Record<string, unknown>,
) {
  const normalized = normalizeRelationshipStoryAnalysis(payload, {
    assistantId,
    storyText: payload.story_text,
  });

  const row = {
    user_id: userId,
    assistant_id: assistantId,
    story_text: normalized.story_text,
    relationship_stage: normalized.relationship_stage,
    relationship_trend: normalized.relationship_trend,
    how_met: normalized.how_met,
    user_personality: normalized.user_personality,
    partner_personality: normalized.partner_personality,
    partner_role: normalized.partner_role,
    user_nicknames: normalized.user_nicknames,
    partner_nicknames: normalized.partner_nicknames,
    chat_style: normalized.chat_style,
    emotional_expression: normalized.emotional_expression,
    shared_memories: normalized.shared_memories,
    timeline: normalized.timeline,
    user_boundaries: normalized.user_boundaries,
    partner_boundaries: normalized.partner_boundaries,
    preferences: normalized.preferences,
    intimacy_score: normalized.intimacy_score,
    relationship_summary: normalized.relationship_summary,
    roleplay_suggestions: normalized.roleplay_suggestions,
    raw_analysis:
      isPlainObject(payload.raw_analysis) && Object.keys(payload.raw_analysis).length
        ? payload.raw_analysis
        : normalized.raw_analysis,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("relationship_stories")
    .upsert(row, {
      onConflict: "user_id,assistant_id",
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return normalizeRelationshipStoryRecord(data);
}

export async function deleteRelationshipStory(supabase: any, userId: string, assistantId: string) {
  const { error } = await supabase
    .from("relationship_stories")
    .delete()
    .eq("user_id", userId)
    .eq("assistant_id", assistantId);

  if (error) {
    throw error;
  }
}
