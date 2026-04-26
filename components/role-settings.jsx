"use client";

import { GIRLFRIEND_STYLES, ROLES } from "@/lib/chat/roles";

export default function RoleSettings({
  roleId,
  userNickname,
  girlfriendStyleId,
  customPersona,
  disabled,
  onRoleChange,
  onNicknameChange,
  onStyleChange,
  onPersonaChange,
}) {
  const isGirlfriendMode = roleId === "girlfriend";

  return (
    <section className="settings-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">角色与人设</p>
          <h3>把这场聊天调成你想要的样子</h3>
        </div>
        <span className="settings-tip">
          {disabled ? "生成中会暂时锁定设置" : "会话级设置会随当前存储模式一起保存"}
        </span>
      </div>

      <div className="settings-grid">
        <label className="field-group">
          <span>当前角色</span>
          <select value={roleId} onChange={(event) => onRoleChange(event.target.value)} disabled={disabled}>
            {ROLES.map((role) => (
              <option key={role.id} value={role.id}>
                {role.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field-group">
          <span>你的昵称</span>
          <input
            type="text"
            value={userNickname}
            onChange={(event) => onNicknameChange(event.target.value)}
            disabled={disabled}
            placeholder="例如：阿宇、小朋友、宝宝"
          />
        </label>
      </div>

      {isGirlfriendMode ? (
        <label className="field-group">
          <span>AI女友性格</span>
          <select
            value={girlfriendStyleId}
            onChange={(event) => onStyleChange(event.target.value)}
            disabled={disabled}
          >
            {GIRLFRIEND_STYLES.map((style) => (
              <option key={style.id} value={style.id}>
                {style.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="field-group">
        <span>{isGirlfriendMode ? "自定义女友人设" : "额外对话偏好"}</span>
        <textarea
          rows={isGirlfriendMode ? 4 : 3}
          value={customPersona}
          onChange={(event) => onPersonaChange(event.target.value)}
          disabled={disabled}
          placeholder={
            isGirlfriendMode
              ? "例如：比我大两岁，喜欢叫我阿宇，晚上会提醒我早点睡，偶尔会吃醋。"
              : "例如：回答尽量简洁，先给结论，再给步骤。"
          }
        />
      </label>
    </section>
  );
}
