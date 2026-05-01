import GlassCard from "@/components/ui/GlassCard";
import GradientButton from "@/components/ui/GradientButton";

export default function AssistantHeader({
  activeRole,
  activeSession,
  welcomeDescription,
  isStreaming,
  onOpenSidebar,
  user,
  supabaseEnabled,
  authLoading,
  onOpenAuth,
  onLogout,
  rolePresence,
  roleBanner,
  syncNotice,
  isCloudMode,
  activeCompanion,
  theme = "default",
}) {
  const isRomance = theme === "romance";
  const headerTitle = isRomance
    ? `${activeCompanion?.name || "AI伴侣"} 陪伴中`
    : activeSession?.messages?.length
      ? activeSession.title
      : activeRole.label;
  const headerSubtitle = isRomance
    ? activeCompanion?.id === "boyfriend"
      ? "冷静可靠的守护感，已经在这里等你开口"
      : "温柔坚定的陪伴感，会把今天慢慢接住"
    : isStreaming
      ? "AI 正在回复中..."
      : welcomeDescription || "已就绪，可直接开始聊天";

  return (
    <div className="assistant-header-stack">
      <header className="chat-header">
        <div className="chat-header-copy">
          <GradientButton
            variant="ghost"
            className="mobile-menu-button"
            onClick={onOpenSidebar}
            theme={theme}
          >
            打开导航
          </GradientButton>
          <p className="eyebrow">{isRomance ? "高级陪伴模式" : "多助手模式"}</p>
          <h2>{headerTitle}</h2>
          <span className="header-tip">{headerSubtitle}</span>
        </div>

        <GlassCard
          className="presence-status-bar romance-header-card"
          theme={theme}
          compact
          data-companion={activeCompanion?.id || "girlfriend"}
        >
          <div className="presence-status-main">
            <div className="presence-dot" />
            <span>{user ? "云端已连接" : supabaseEnabled ? "游客模式" : "本地模式"}</span>
            <span>当前角色：{rolePresence?.title || activeRole.label}</span>
            <span>状态：{rolePresence?.status || "在线"}</span>
          </div>
          {user ? (
            <GradientButton variant="ghost" size="sm" onClick={onLogout} disabled={authLoading} theme={theme}>
              退出
            </GradientButton>
          ) : (
            <GradientButton size="sm" onClick={onOpenAuth} disabled={!supabaseEnabled} theme={theme}>
              登录
            </GradientButton>
          )}
        </GlassCard>
      </header>

      <GlassCard
        className={`role-banner ${theme === "romance" ? "role-banner-romance" : "role-banner-default"} romance-hero-banner`}
        theme={theme}
        data-companion={activeCompanion?.id || "girlfriend"}
      >
        <div className="role-banner-decoration" aria-hidden="true" />
        <strong>{roleBanner?.title}</strong>
        <p>{roleBanner?.description}</p>
        <span className="role-banner-tag">{isCloudMode ? "陪伴同步中" : "本地陪伴模式"}</span>
      </GlassCard>

      {syncNotice ? (
        <GlassCard className="info-banner" theme={theme} compact>
          <strong>{isCloudMode ? "云端模式" : "游客模式"}</strong>
          <span>{syncNotice}</span>
        </GlassCard>
      ) : null}
    </div>
  );
}
