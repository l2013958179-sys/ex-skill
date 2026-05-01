"use client";

import GlassCard from "@/components/ui/GlassCard";
import GradientButton from "@/components/ui/GradientButton";
import { ROLES, getRoleById, getSessionRoleSummary, isRelationshipAssistantId } from "@/lib/chat/roles";

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
  assistants,
  activeAssistantId,
  sessions,
  activeSessionId,
  disabled,
  mobileOpen,
  navigationItems = [],
  activeNavigationKey = "chat",
  user,
  supabaseEnabled,
  userDisplayName,
  activeCompanion,
  intimacyScore = 0,
  onNavigate,
  onAuthAction,
  onLogout,
  onClose,
  onSelectAssistant,
  onCreate,
  onDelete,
  onSelect,
}) {
  const theme = isRelationshipAssistantId(activeAssistantId) ? "romance" : "default";
  const isRelationshipMode = theme === "romance";
  const progressValue = Math.max(0, Math.min(100, Number(intimacyScore) || 0));
  const companionHeadline =
    activeCompanion?.id === "boyfriend"
      ? "冷静守护、稳稳陪你"
      : "暖光陪伴、温柔靠近";

  return (
    <>
      <button
        type="button"
        className={`sidebar-backdrop${mobileOpen ? " visible" : ""}`}
        onClick={onClose}
        aria-label="关闭会话侧栏"
      />

      <aside
        className={`sidebar${mobileOpen ? " mobile-open" : ""}`}
        data-theme={theme}
        data-companion={activeCompanion?.id || "girlfriend"}
      >
        <div className="sidebar-head">
          <div>
            <p className="eyebrow">{isRelationshipMode ? companionHeadline : "多助手空间"}</p>
            <h1>{isRelationshipMode ? "AI伴侣" : "朝花夕拾"}</h1>
            <span className="sidebar-subtitle">
              {isRelationshipMode
                ? `${activeCompanion?.name || "TA"} 会把陪伴、记忆和关系感慢慢沉淀下来。`
                : "不同助手独立会话，聊天记录会按角色分别管理。"}
            </span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navigationItems.map((item) => {
            const isActive = activeNavigationKey === item.id;
            const isLogout = item.id === "logout";

            return (
              <button
                key={item.id}
                type="button"
                className={`sidebar-nav-item${isActive ? " active" : ""}${isLogout ? " is-logout" : ""}`}
                onClick={() => onNavigate?.(item.id)}
                disabled={disabled && !isLogout}
              >
                <span className="sidebar-nav-icon" aria-hidden="true">{item.icon}</span>
                <span className="sidebar-nav-copy">
                  <strong>{item.label}</strong>
                  {item.description ? <small>{item.description}</small> : null}
                </span>
              </button>
            );
          })}
        </nav>

        <GlassCard className="assistant-switcher sidebar-subcard" theme={theme}>
          <div className="assistant-switcher-head">
            <strong>{isRelationshipMode ? "聊天模式" : "助手切换"}</strong>
            <span>{isRelationshipMode ? "恋爱模式也保留全部其他助手" : "当前仅显示该助手下的会话"}</span>
          </div>

          <div className="role-strip">
            {(assistants || ROLES).map((role) => (
              <button
                key={role.id}
                type="button"
                className={`role-pill role-pill-button${activeAssistantId === role.id ? " active" : ""}`}
                onClick={() => onSelectAssistant(role.id)}
                disabled={disabled}
              >
                <strong>{role.label}</strong>
                <span>{role.shortDescription}</span>
              </button>
            ))}
          </div>
        </GlassCard>

        <div className="sidebar-session-shell">
          <div className="sidebar-session-head">
            <div>
              <strong>聊天记录</strong>
              <span>切换角色不会清空历史聊天</span>
            </div>
            <GradientButton onClick={onCreate} disabled={disabled} theme={theme}>
              新建会话
            </GradientButton>
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
                  data-theme={theme}
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
                    <GradientButton
                      variant="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(session.id);
                      }}
                      disabled={disabled}
                      theme={theme}
                      aria-label="删除会话"
                    >
                      删除
                    </GradientButton>
                  </div>
                  <h2>{session.title || "新对话"}</h2>
                  <p>
                    {session.messages?.[session.messages.length - 1]?.content ||
                      (role.id === "girlfriend" && session.userNickname
                        ? `会优先叫你 ${session.userNickname}，并延续当前陪伴氛围。`
                        : role.description)}
                  </p>
                  <time dateTime={session.updatedAt}>{formatTime(session.updatedAt)}</time>
                </article>
              );
            })}
          </div>
        </div>

        <GlassCard className="sidebar-user-card" theme={theme}>
          <div className="sidebar-user-head">
            <div className="sidebar-user-avatar" aria-hidden="true">
              {activeCompanion?.id === "boyfriend" ? "✦" : "♡"}
            </div>
            <div>
              <strong>{userDisplayName || "晚风与你"}</strong>
              <span>{user ? user.email : "游客模式"}</span>
            </div>
          </div>

          <div className="sidebar-user-meta">
            <span>Lv.6</span>
            <span>{supabaseEnabled ? (user ? "云端已连接" : "登录后可同步") : "本地模式"}</span>
          </div>

          <div className="sidebar-progress-track" aria-hidden="true">
            <div className="sidebar-progress-bar" style={{ width: `${progressValue}%` }} />
          </div>
          <p className="sidebar-progress-copy">亲密度 {progressValue}/100</p>

          <GradientButton
            variant="secondary"
            onClick={user ? onLogout : onAuthAction}
            disabled={disabled}
            theme={theme}
          >
            {user ? "退出登录" : "登录 / 注册"}
          </GradientButton>
        </GlassCard>
      </aside>
    </>
  );
}
