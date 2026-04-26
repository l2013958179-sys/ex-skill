"use client";

import { MEMORY_LABELS, MEMORY_TYPES, buildMemorySummaryText } from "@/lib/memory/profile";

export default function MemoryManager({
  items,
  disabled,
  loading,
  storageMode,
  notice,
  onImport,
  onChange,
  onDelete,
  onClear,
}) {
  const summaryText = buildMemorySummaryText(items);

  return (
    <section className="settings-card memory-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">记忆管理</p>
          <h3>让 AI女友更懂你，但只记住提炼后的重点</h3>
        </div>
        <span className="settings-tip">
          {storageMode === "cloud" ? "当前记忆会同步到 Supabase" : "当前记忆保存在本地浏览器"}
        </span>
      </div>

      <div className="memory-warning">
        <strong>隐私提醒</strong>
        <p>聊天记录可能包含隐私，请确认你有权上传，并建议先删除敏感内容。</p>
      </div>

      <div className="memory-toolbar">
        <label className={`primary-button file-button${disabled ? " is-disabled" : ""}`}>
          导入微信聊天记录
          <input
            type="file"
            accept=".txt,.json,.csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onImport(file);
              }
              event.target.value = "";
            }}
            disabled={disabled || loading}
          />
        </label>

        <button
          type="button"
          className="secondary-button"
          onClick={onClear}
          disabled={disabled || loading || !items.length}
        >
          删除全部记忆
        </button>
      </div>

      {notice ? <p className="memory-notice">{notice}</p> : null}

      {summaryText ? (
        <div className="memory-summary-panel">
          <strong>AI 当前记住了这些重点</strong>
          <pre>{summaryText}</pre>
        </div>
      ) : (
        <div className="memory-empty">
          <strong>还没有导入记忆</strong>
          <p>你可以导入微信聊天记录，或者直接手动填写下面的记忆字段。</p>
        </div>
      )}

      <div className="memory-grid">
        {MEMORY_TYPES.map((memoryType) => {
          const matched = items.find((item) => item.memoryType === memoryType);

          return (
            <article key={memoryType} className="memory-item-card">
              <div className="memory-item-head">
                <strong>{MEMORY_LABELS[memoryType]}</strong>
                {matched?.content ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => onDelete(memoryType)}
                    disabled={disabled || loading}
                  >
                    删除
                  </button>
                ) : null}
              </div>

              <textarea
                rows={memoryType === "memory_summary" ? 4 : 3}
                value={matched?.content || ""}
                placeholder={`可以手动编辑 ${MEMORY_LABELS[memoryType]}`}
                onChange={(event) => onChange(memoryType, event.target.value)}
                disabled={disabled || loading}
              />
              <small>
                {matched?.source
                  ? `来源：${matched.source === "wechat_import" ? "微信聊天记录导入" : "手动编辑"}`
                  : "为空时不会写入记忆层"}
              </small>
            </article>
          );
        })}
      </div>
    </section>
  );
}
