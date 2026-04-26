"use client";

import { ROLES, getRoleById, getSessionRoleSummary } from "@/lib/chat/roles";

function formatTime(value) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function SessionSidebar({
  sessions,
  activeSessionId,
  disabled,
  onCreate,
  onDelete,
  onSelect,
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div>
          <p className="eyebrow">朝花夕拾</p>
          <h1>AI 聊天站</h1>
        </div>
        <button type="button" className="primary-button" onClick={onCreate} disabled={disabled}>
          新建会话
        </button>
      </div>

      <div className="role-strip">
        {ROLES.map((role) => (
          <div key={role.id} className="role-pill">
            <strong>{role.label}</strong>
            <span>{role.shortDescription}</span>
          </div>
        ))}
      </div>

      <div className="session-list">
        {sessions.map((session) => {
          const role = getRoleById(session.roleId);
          const isActive = session.id === activeSessionId;
          const summary = getSessionRoleSummary(session);

          return (
            <article
              key={session.id}
              className={`session-card${isActive ? " active" : ""}`}
              onClick={() => onSelect(session.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(session.id);
                }
              }}
            >
              <div className="session-card-top">
                <span>{summary}</span>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(session.id);
                  }}
                  disabled={disabled}
                  aria-label="删除会话"
                >
                  删除
                </button>
              </div>
              <h2>{session.title || "新对话"}</h2>
              <p>
                {session.messages.at(-1)?.content ||
                  (role.id === "girlfriend" && session.userNickname
                    ? `称呼你为 ${session.userNickname} · ${role.description}`
                    : role.description)}
              </p>
              <time dateTime={session.updatedAt}>{formatTime(session.updatedAt)}</time>
            </article>
          );
        })}
      </div>
    </aside>
  );
}
