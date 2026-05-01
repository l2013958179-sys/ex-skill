"use client";

import { useEffect, useState } from "react";

import GradientButton from "@/components/ui/GradientButton";
import TypingDots from "@/components/ui/TypingDots";
import CollapsiblePanel from "@/components/ui/CollapsiblePanel";
import { buildApiUrl } from "@/lib/browser/api-url";
import {
  createEmptyRelationshipStoryDraft,
  normalizeRelationshipStoryRecord,
} from "@/lib/db/relationshipStories";
import { isSupabaseSchemaMissingError, logSupabaseError } from "@/lib/supabase/client";

const ANALYSIS_LOADING_STEPS = [
  "正在理解你们的故事",
  "正在整理关系档案",
  "正在生成 AI 扮演建议",
];

function isSupabaseError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      ("code" in error || "details" in error || "hint" in error),
  );
}

function formatArray(values: string[] = []) {
  return values.length ? values.join("、") : "暂未整理";
}

function getRoleplaySummary(suggestions: Record<string, unknown> = {}) {
  return [
    suggestions.addressing_style,
    suggestions.tone,
    suggestions.initiative_level,
    suggestions.emotional_intensity,
    suggestions.special_traits,
  ]
    .filter(Boolean)
    .join(" · ");
}

async function readApiError(response: Response, fallback: string) {
  try {
    const payload = await response.json();

    if (payload?.code === "unauthorized") {
      return "请先登录后再保存和分析故事档案。";
    }

    if (payload?.code === "42P01") {
      return "relationship_stories 表还没创建，请先执行最新的 schema.sql。";
    }

    if (payload?.code === "42703" || payload?.code === "PGRST204" || payload?.code === "PGRST205") {
      return "Supabase 表结构还是旧版本，请先执行最新的 schema.sql。";
    }

    return payload?.error || fallback;
  } catch {
    return fallback;
  }
}

export default function RelationshipStoryPanel({
  assistantId,
  user,
  supabase,
  disabled,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [story, setStory] = useState(() =>
    createEmptyRelationshipStoryDraft({
      assistant_id: assistantId,
    }),
  );
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);

  useEffect(() => {
    if (!analyzing) {
      setLoadingStepIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setLoadingStepIndex((current) => (current + 1) % ANALYSIS_LOADING_STEPS.length);
    }, 1200);

    return () => window.clearInterval(timer);
  }, [analyzing]);

  useEffect(() => {
    let disposed = false;

    async function loadStory() {
      setError("");
      setNotice("");

      if (!assistantId) {
        setStory(createEmptyRelationshipStoryDraft());
        return;
      }

      if (!supabase || !user) {
        setStory(
          createEmptyRelationshipStoryDraft({
            assistant_id: assistantId,
          }),
        );
        return;
      }

      setLoading(true);

      try {
        const { data, error: requestError } = await supabase
          .from("relationship_stories")
          .select("*")
          .eq("user_id", user.id)
          .eq("assistant_id", assistantId)
          .maybeSingle();

        if (requestError) {
          throw requestError;
        }

        if (disposed) {
          return;
        }

        if (data) {
          setStory(normalizeRelationshipStoryRecord(data));
          setNotice("已加载你们当前保存的关系档案。");
        } else {
          setStory(
            createEmptyRelationshipStoryDraft({
              assistant_id: assistantId,
            }),
          );
          setNotice("还没有保存过故事档案，可以先写故事再分析。");
        }
      } catch (loadError: any) {
        if (disposed) {
          return;
        }

        if (isSupabaseSchemaMissingError(loadError)) {
          setStory(
            createEmptyRelationshipStoryDraft({
              assistant_id: assistantId,
            }),
          );
          setError("relationship_stories 表还没创建，请先执行最新的 schema.sql。");
          return;
        }

        if (isSupabaseError(loadError)) {
          logSupabaseError("读取 relationship story 失败:", loadError);
        } else {
          console.error("读取 relationship story 失败:", loadError?.message || loadError);
        }

        setError(
          loadError?.code === "42P01"
            ? "relationship_stories 表还没创建，请先执行最新的 schema.sql。"
            : "读取故事档案失败，请稍后重试。",
        );
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }

    void loadStory();

    return () => {
      disposed = true;
    };
  }, [assistantId, supabase, user]);

  function patchStory(patch) {
    setStory((current) => ({
      ...current,
      ...patch,
      assistant_id: assistantId,
    }));
  }

  async function getAuthHeaders() {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (!supabase) {
      return headers;
    }

    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    return headers;
  }

  async function callStoryApi(path: string, payload: Record<string, unknown>, fallback: string) {
    const response = await fetch(buildApiUrl(path), {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await readApiError(response, fallback));
    }

    return response.json();
  }

  async function handleAnalyze() {
    const storyText = story.story_text?.trim();
    if (!storyText) {
      setError("请先写下你们的故事，再开始分析。");
      return;
    }

    setAnalyzing(true);
    setError("");
    setNotice("");

    try {
      const payload = await callStoryApi(
        "/api/relationship-story/analyze",
        {
          assistant_id: assistantId,
          story_text: storyText,
        },
        "故事分析失败，请稍后重试。",
      );

      setStory(
        normalizeRelationshipStoryRecord({
          ...story,
          ...payload.analysis,
          assistant_id: assistantId,
          story_text: storyText,
        }),
      );
      setNotice("故事分析完成，你可以继续手动微调每个字段。");
      setIsExpanded(true);
    } catch (analyzeError: any) {
      console.error("分析 relationship story 失败:", analyzeError);
      setError(analyzeError?.message || "故事分析失败，请稍后重试。");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    const storyText = story.story_text?.trim();
    if (!storyText) {
      setError("请先填写故事内容。");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload = await callStoryApi(
        "/api/relationship-story/save",
        {
          assistant_id: assistantId,
          story_text: storyText,
          analysis: {
            ...story,
          },
        },
        "保存故事档案失败，请稍后重试。",
      );

      setStory(normalizeRelationshipStoryRecord(payload.story));
      setNotice("关系档案已保存，后续聊天会自动参考这份故事设定。");
    } catch (saveError: any) {
      console.error("保存 relationship story 失败:", saveError);
      setError(saveError?.message || "保存故事档案失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!story.id && !story.story_text) {
      return;
    }

    const firstConfirm = window.confirm("确定要删除当前的关系档案吗？");
    if (!firstConfirm) {
      return;
    }

    const secondConfirm = window.confirm("删除后将无法恢复，确认继续删除吗？");
    if (!secondConfirm) {
      return;
    }

    setDeleting(true);
    setError("");

    try {
      await callStoryApi(
        "/api/relationship-story/delete",
        {
          assistant_id: assistantId,
        },
        "删除故事档案失败，请稍后重试。",
      );

      setStory(
        createEmptyRelationshipStoryDraft({
          assistant_id: assistantId,
        }),
      );
      setNotice("关系档案已删除。");
    } catch (deleteError: any) {
      console.error("删除 relationship story 失败:", deleteError);
      setError(deleteError?.message || "删除故事档案失败，请稍后重试。");
    } finally {
      setDeleting(false);
    }
  }

  function handleArrayTextChange(field, value) {
    patchStory({
      [field]: value
        .split(/[\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
    });
  }

  function handleSharedMemoryChange(index, field, value) {
    const nextItems = [...(story.shared_memories || [])];
    const currentItem = nextItems[index] || {
      title: "",
      summary: "",
      emotion: "",
      confidence: 0.8,
    };
    nextItems[index] = {
      ...currentItem,
      [field]: field === "confidence" ? Number(value) : value,
    };
    patchStory({ shared_memories: nextItems });
  }

  function handleTimelineChange(index, field, value) {
    const nextItems = [...(story.timeline || [])];
    const currentItem = nextItems[index] || {
      event: "",
      confidence: 0.7,
    };
    nextItems[index] = {
      ...currentItem,
      [field]: field === "confidence" ? Number(value) : value,
    };
    patchStory({ timeline: nextItems });
  }

  function removeSharedMemory(index) {
    patchStory({
      shared_memories: (story.shared_memories || []).filter((_, itemIndex) => itemIndex !== index),
    });
  }

  function removeTimelineItem(index) {
    patchStory({
      timeline: (story.timeline || []).filter((_, itemIndex) => itemIndex !== index),
    });
  }

  return (
    <CollapsiblePanel
      eyebrow="我们的故事"
      title="把你们的故事整理成长期可用的关系档案"
      description="写下怎么相遇、彼此性格、重要回忆和相处方式，AI 会自动提炼成更稳定的陪伴设定。"
      meta={user ? "保存后会跟随当前恋爱助手一起同步到云端" : "登录后才能分析、保存并在聊天中生效"}
      icon="♡"
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded((current) => !current)}
      className="relationship-card"
      theme="romance"
    >
      <div className="story-diary-card">
        <label className="field-group">
          <span>故事原文</span>
          <textarea
            className="relationship-story-input story-diary-textarea"
            rows={7}
            value={story.story_text || ""}
            onChange={(event) => patchStory({ story_text: event.target.value })}
            disabled={disabled || loading || analyzing || saving || deleting}
            placeholder="慢慢写下你们是怎么认识的、对方是什么样的人、你喜欢怎样被称呼、你们的默契与边界，还有那些值得被记住的小瞬间……"
          />
        </label>

        <div className="relationship-toolbar">
          <GradientButton
            onClick={handleAnalyze}
            disabled={disabled || loading || analyzing || saving || deleting}
            theme="romance"
          >
            自动分析故事
          </GradientButton>

          <GradientButton
            variant="secondary"
            onClick={handleSave}
            disabled={disabled || loading || analyzing || saving || deleting || !story.story_text?.trim()}
            theme="romance"
          >
            保存档案
          </GradientButton>

          <GradientButton
            variant="secondary"
            onClick={handleAnalyze}
            disabled={disabled || loading || analyzing || saving || deleting || !story.story_text?.trim()}
            theme="romance"
          >
            重新分析
          </GradientButton>

          <GradientButton
            variant="danger"
            onClick={handleDelete}
            disabled={disabled || loading || analyzing || saving || deleting || (!story.id && !story.story_text)}
            theme="romance"
          >
            删除档案
          </GradientButton>
        </div>
      </div>

      {loading ? (
        <div className="memory-empty">
          <strong>正在读取关系档案</strong>
          <p>请稍等，正在加载你和当前助手的故事设定。</p>
        </div>
      ) : null}

      {analyzing ? (
        <div className="relationship-loading-card">
          <TypingDots theme="romance" />
          <div>
            <strong>{ANALYSIS_LOADING_STEPS[loadingStepIndex]}</strong>
            <p>请稍等，AI 会尽量保留你原本描述里的情绪与细节。</p>
          </div>
        </div>
      ) : null}

      {notice ? <p className="memory-notice">{notice}</p> : null}
      {error ? <p className="relationship-error-text">{error}</p> : null}

      <div className="relationship-summary-grid">
        <article className="relationship-summary-card">
          <span>关系阶段</span>
          <strong>{story.relationship_stage || "待分析"}</strong>
          <p>{story.relationship_trend || "趋势会在分析后显示在这里。"}</p>
        </article>
        <article className="relationship-summary-card">
          <span>关系摘要</span>
          <strong>{story.relationship_summary || "还没有摘要"}</strong>
          <p>{story.how_met || "相识方式会在这里提炼。"}</p>
        </article>
        <article className="relationship-summary-card">
          <span>常用称呼</span>
          <strong>{formatArray(story.user_nicknames)}</strong>
          <p>{formatArray(story.partner_nicknames)}</p>
        </article>
        <article className="relationship-summary-card">
          <span>相处边界</span>
          <strong>{story.user_boundaries || "待补充"}</strong>
          <p>{story.partner_boundaries || "待补充"}</p>
        </article>
        <article className="relationship-summary-card relationship-summary-card-wide">
          <span>AI 扮演建议</span>
          <strong>{getRoleplaySummary(story.roleplay_suggestions) || "分析后会自动整理"}</strong>
          <p>{story.chat_style || "聊天风格和情感表达会在这里归纳。"}</p>
        </article>
      </div>

      <div className="relationship-grid">
        <label className="field-group">
          <span>关系阶段</span>
          <input
            type="text"
            value={story.relationship_stage || ""}
            onChange={(event) => patchStory({ relationship_stage: event.target.value })}
            disabled={disabled || loading || analyzing || saving || deleting}
          />
        </label>

        <label className="field-group">
          <span>关系趋势</span>
          <input
            type="text"
            value={story.relationship_trend || ""}
            onChange={(event) => patchStory({ relationship_trend: event.target.value })}
            disabled={disabled || loading || analyzing || saving || deleting}
          />
        </label>

        <label className="field-group">
          <span>相识方式</span>
          <textarea
            rows={3}
            value={story.how_met || ""}
            onChange={(event) => patchStory({ how_met: event.target.value })}
            disabled={disabled || loading || analyzing || saving || deleting}
          />
        </label>

        <label className="field-group">
          <span>对方角色定位</span>
          <textarea
            rows={3}
            value={story.partner_role || ""}
            onChange={(event) => patchStory({ partner_role: event.target.value })}
            disabled={disabled || loading || analyzing || saving || deleting}
          />
        </label>

        <label className="field-group">
          <span>用户性格</span>
          <textarea
            rows={3}
            value={story.user_personality || ""}
            onChange={(event) => patchStory({ user_personality: event.target.value })}
            disabled={disabled || loading || analyzing || saving || deleting}
          />
        </label>

        <label className="field-group">
          <span>对方性格</span>
          <textarea
            rows={3}
            value={story.partner_personality || ""}
            onChange={(event) => patchStory({ partner_personality: event.target.value })}
            disabled={disabled || loading || analyzing || saving || deleting}
          />
        </label>

        <label className="field-group">
          <span>常用称呼（用户）</span>
          <input
            type="text"
            value={(story.user_nicknames || []).join("、")}
            onChange={(event) => handleArrayTextChange("user_nicknames", event.target.value)}
            disabled={disabled || loading || analyzing || saving || deleting}
            placeholder="多个称呼可用顿号、逗号或换行分隔"
          />
        </label>

        <label className="field-group">
          <span>常用称呼（对方）</span>
          <input
            type="text"
            value={(story.partner_nicknames || []).join("、")}
            onChange={(event) => handleArrayTextChange("partner_nicknames", event.target.value)}
            disabled={disabled || loading || analyzing || saving || deleting}
            placeholder="多个称呼可用顿号、逗号或换行分隔"
          />
        </label>

        <label className="field-group">
          <span>聊天风格</span>
          <textarea
            rows={3}
            value={story.chat_style || ""}
            onChange={(event) => patchStory({ chat_style: event.target.value })}
            disabled={disabled || loading || analyzing || saving || deleting}
          />
        </label>

        <label className="field-group">
          <span>情感表达</span>
          <textarea
            rows={3}
            value={story.emotional_expression || ""}
            onChange={(event) => patchStory({ emotional_expression: event.target.value })}
            disabled={disabled || loading || analyzing || saving || deleting}
          />
        </label>

        <label className="field-group">
          <span>用户边界</span>
          <textarea
            rows={3}
            value={story.user_boundaries || ""}
            onChange={(event) => patchStory({ user_boundaries: event.target.value })}
            disabled={disabled || loading || analyzing || saving || deleting}
          />
        </label>

        <label className="field-group">
          <span>对方边界</span>
          <textarea
            rows={3}
            value={story.partner_boundaries || ""}
            onChange={(event) => patchStory({ partner_boundaries: event.target.value })}
            disabled={disabled || loading || analyzing || saving || deleting}
          />
        </label>

        <label className="field-group">
          <span>偏好</span>
          <textarea
            rows={3}
            value={story.preferences || ""}
            onChange={(event) => patchStory({ preferences: event.target.value })}
            disabled={disabled || loading || analyzing || saving || deleting}
          />
        </label>

        <label className="field-group">
          <span>亲密度分数</span>
          <input
            type="number"
            min="0"
            max="100"
            value={story.intimacy_score ?? 0}
            onChange={(event) => patchStory({ intimacy_score: Number(event.target.value) || 0 })}
            disabled={disabled || loading || analyzing || saving || deleting}
          />
        </label>
      </div>

      <label className="field-group">
        <span>关系摘要</span>
        <textarea
          rows={4}
          value={story.relationship_summary || ""}
          onChange={(event) => patchStory({ relationship_summary: event.target.value })}
          disabled={disabled || loading || analyzing || saving || deleting}
        />
      </label>

      <section className="relationship-section-card">
        <div className="relationship-section-head">
          <div>
            <strong>重要回忆</strong>
            <p>这里会整理出值得长期参考的共同回忆，也可以像卡片一样继续补充细节。</p>
          </div>
          <GradientButton
            variant="ghost"
            size="sm"
            onClick={() =>
              patchStory({
                shared_memories: [
                  ...(story.shared_memories || []),
                  {
                    title: "",
                    summary: "",
                    emotion: "",
                    confidence: 0.8,
                  },
                ],
              })
            }
            disabled={disabled || loading || analyzing || saving || deleting}
            theme="romance"
          >
            新增回忆
          </GradientButton>
        </div>

        {(story.shared_memories || []).length ? (
          <div className="relationship-list relationship-memory-list">
            {(story.shared_memories || []).map((item, index) => (
              <article key={`memory_${index}`} className="relationship-item-card">
                <div className="memory-item-head">
                  <strong>回忆 {index + 1}</strong>
                  <GradientButton
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSharedMemory(index)}
                    disabled={disabled || loading || analyzing || saving || deleting}
                    theme="romance"
                  >
                    删除
                  </GradientButton>
                </div>

                <div className="relationship-tag-row">
                  {item.title ? <span className="relationship-tag">{item.title}</span> : null}
                  {item.emotion ? <span className="relationship-tag soft">{item.emotion}</span> : null}
                  <span className="relationship-tag subtle">置信度 {item.confidence ?? 0.8}</span>
                </div>

                <div className="relationship-grid">
                  <label className="field-group">
                    <span>标题</span>
                    <input
                      type="text"
                      value={item.title || ""}
                      onChange={(event) => handleSharedMemoryChange(index, "title", event.target.value)}
                      disabled={disabled || loading || analyzing || saving || deleting}
                    />
                  </label>

                  <label className="field-group">
                    <span>情绪</span>
                    <input
                      type="text"
                      value={item.emotion || ""}
                      onChange={(event) => handleSharedMemoryChange(index, "emotion", event.target.value)}
                      disabled={disabled || loading || analyzing || saving || deleting}
                    />
                  </label>

                  <label className="field-group relationship-grid-full">
                    <span>摘要</span>
                    <textarea
                      rows={3}
                      value={item.summary || ""}
                      onChange={(event) => handleSharedMemoryChange(index, "summary", event.target.value)}
                      disabled={disabled || loading || analyzing || saving || deleting}
                    />
                  </label>

                  <label className="field-group">
                    <span>置信度</span>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={item.confidence ?? 0.8}
                      onChange={(event) =>
                        handleSharedMemoryChange(index, "confidence", event.target.value)
                      }
                      disabled={disabled || loading || analyzing || saving || deleting}
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="memory-empty">
            <strong>还没有提炼出重要回忆</strong>
            <p>分析后会自动生成，也可以手动补充。</p>
          </div>
        )}
      </section>

      <section className="relationship-section-card">
        <div className="relationship-section-head">
          <div>
            <strong>关系时间线</strong>
            <p>只保留故事中明确出现的重要节点，不会凭空补时间。</p>
          </div>
          <GradientButton
            variant="ghost"
            size="sm"
            onClick={() =>
              patchStory({
                timeline: [
                  ...(story.timeline || []),
                  {
                    event: "",
                    confidence: 0.7,
                  },
                ],
              })
            }
            disabled={disabled || loading || analyzing || saving || deleting}
            theme="romance"
          >
            新增节点
          </GradientButton>
        </div>

        {(story.timeline || []).length ? (
          <div className="relationship-list relationship-timeline-list">
            {(story.timeline || []).map((item, index) => (
              <article key={`timeline_${index}`} className="relationship-item-card timeline-item-card">
                <div className="memory-item-head">
                  <strong>节点 {index + 1}</strong>
                  <GradientButton
                    variant="ghost"
                    size="sm"
                    onClick={() => removeTimelineItem(index)}
                    disabled={disabled || loading || analyzing || saving || deleting}
                    theme="romance"
                  >
                    删除
                  </GradientButton>
                </div>

                <div className="relationship-timeline-marker" aria-hidden="true" />

                <div className="relationship-grid">
                  <label className="field-group relationship-grid-full">
                    <span>事件</span>
                    <textarea
                      rows={3}
                      value={item.event || ""}
                      onChange={(event) => handleTimelineChange(index, "event", event.target.value)}
                      disabled={disabled || loading || analyzing || saving || deleting}
                    />
                  </label>

                  <label className="field-group">
                    <span>置信度</span>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={item.confidence ?? 0.7}
                      onChange={(event) => handleTimelineChange(index, "confidence", event.target.value)}
                      disabled={disabled || loading || analyzing || saving || deleting}
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="memory-empty">
            <strong>还没有时间线节点</strong>
            <p>如果故事里提到了重要变化，可以在这里手动补充。</p>
          </div>
        )}
      </section>

      <section className="relationship-section-card">
        <div className="relationship-section-head">
          <div>
            <strong>AI 扮演建议</strong>
            <p>这些字段会直接帮助 AI 更自然地代入你们的关系设定。</p>
          </div>
        </div>

        <div className="relationship-grid">
          <label className="field-group">
            <span>称呼方式</span>
            <input
              type="text"
              value={story.roleplay_suggestions?.addressing_style || ""}
              onChange={(event) =>
                patchStory({
                  roleplay_suggestions: {
                    ...story.roleplay_suggestions,
                    addressing_style: event.target.value,
                  },
                })
              }
              disabled={disabled || loading || analyzing || saving || deleting}
            />
          </label>

          <label className="field-group">
            <span>语气</span>
            <input
              type="text"
              value={story.roleplay_suggestions?.tone || ""}
              onChange={(event) =>
                patchStory({
                  roleplay_suggestions: {
                    ...story.roleplay_suggestions,
                    tone: event.target.value,
                  },
                })
              }
              disabled={disabled || loading || analyzing || saving || deleting}
            />
          </label>

          <label className="field-group">
            <span>主动程度</span>
            <input
              type="text"
              value={story.roleplay_suggestions?.initiative_level || ""}
              onChange={(event) =>
                patchStory({
                  roleplay_suggestions: {
                    ...story.roleplay_suggestions,
                    initiative_level: event.target.value,
                  },
                })
              }
              disabled={disabled || loading || analyzing || saving || deleting}
            />
          </label>

          <label className="field-group">
            <span>情感强度</span>
            <input
              type="text"
              value={story.roleplay_suggestions?.emotional_intensity || ""}
              onChange={(event) =>
                patchStory({
                  roleplay_suggestions: {
                    ...story.roleplay_suggestions,
                    emotional_intensity: event.target.value,
                  },
                })
              }
              disabled={disabled || loading || analyzing || saving || deleting}
            />
          </label>

          <label className="field-group relationship-grid-full">
            <span>特殊特征</span>
            <textarea
              rows={3}
              value={story.roleplay_suggestions?.special_traits || ""}
              onChange={(event) =>
                patchStory({
                  roleplay_suggestions: {
                    ...story.roleplay_suggestions,
                    special_traits: event.target.value,
                  },
                })
              }
              disabled={disabled || loading || analyzing || saving || deleting}
            />
          </label>
        </div>
      </section>
    </CollapsiblePanel>
  );
}
