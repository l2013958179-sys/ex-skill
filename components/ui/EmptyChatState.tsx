import GlassCard from "@/components/ui/GlassCard";

function cn(...values) {
  return values.filter(Boolean).join(" ");
}

export default function EmptyChatState({
  roleLabel,
  welcomeTitle,
  welcomeDescription,
  user,
  prompts,
  onPickPrompt,
  theme = "default",
}) {
  return (
    <section className={cn("empty-state", theme === "romance" && "is-romance")}>
      <GlassCard className="empty-state-hero" theme={theme}>
        <div className="empty-state-badge-row">
          <span className="eyebrow">{roleLabel}</span>
          <span className="empty-state-badge">{user ? "云端同步已开启" : "本地会话模式"}</span>
        </div>
        <h3>{welcomeTitle}</h3>
        <p>
          {user
            ? `当前已登录，${roleLabel} 的会话记录会同步到云端，你可以在其他设备继续聊。`
            : `当前为游客模式，${roleLabel} 的会话记录会保存在本地浏览器，登录后可继续同步。`}
        </p>
        <p>{welcomeDescription}</p>
      </GlassCard>

      <div className="starter-grid">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="starter-card"
            data-theme={theme}
            onClick={() => onPickPrompt(prompt)}
          >
            <span className="starter-card-mark" aria-hidden="true" />
            <strong>{prompt}</strong>
            <small>点击填入输入框</small>
          </button>
        ))}
      </div>
    </section>
  );
}
