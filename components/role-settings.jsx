"use client";

import { useState } from "react";

import GlassCard from "@/components/ui/GlassCard";
import {
  COMPANION_TYPES,
  GIRLFRIEND_STYLES,
  ROLES,
  getCompanionProfile,
  isRelationshipAssistantId,
} from "@/lib/chat/roles";

const PERSONALITY_CARD_META = {
  gentle: {
    icon: "♡",
    description: "温柔体贴，陪伴感强",
  },
  playful: {
    icon: "✦",
    description: "可爱、爱撒娇、轻松活泼",
  },
  cool: {
    icon: "◆",
    description: "冷静成熟，带一点距离感",
  },
  study: {
    icon: "✎",
    description: "督促学习，有点严格",
  },
  comfort: {
    icon: "☾",
    description: "共情能力强，擅长安慰",
  },
};

const COMPANION_VOICE_SUMMARY = {
  girlfriend: "温柔甜美女声",
  boyfriend: "低沉温柔男声",
};

export default function RoleSettings({
  roleId,
  companionType,
  userNickname,
  girlfriendStyleId,
  customPersona,
  disabled,
  onRoleChange,
  onCompanionTypeChange,
  onNicknameChange,
  onStyleChange,
  onPersonaChange,
}) {
  const isRelationshipMode = isRelationshipAssistantId(roleId);
  const theme = isRelationshipMode ? "romance" : "default";
  const companion = getCompanionProfile(companionType);
  const [relationshipSettingsOpen, setRelationshipSettingsOpen] = useState(false);
  const [generalSettingsOpen, setGeneralSettingsOpen] = useState(false);

  if (isRelationshipMode) {
    return (
      <GlassCard
        className="settings-card role-settings-card"
        theme={theme}
        data-companion={companion.id}
      >
        <div className="role-settings-compact-head">
          <div className="role-settings-current">
            <span className={`companion-type-avatar ${companion.id}`} aria-hidden="true">
              {companion.id === "boyfriend" ? "✦" : "♡"}
            </span>
            <div>
              <p className="eyebrow">当前 AI伴侣</p>
              <h3>{companion.name} · {companion.label}</h3>
              <span>{companion.styleLabel}</span>
            </div>
          </div>
          <button
            type="button"
            className="role-settings-toggle"
            onClick={() => setRelationshipSettingsOpen((current) => !current)}
            disabled={disabled}
            aria-expanded={relationshipSettingsOpen}
          >
            {relationshipSettingsOpen ? "收起设置" : "切换角色"}
          </button>
        </div>

        {relationshipSettingsOpen ? (
          <div className="role-settings-expanded">
            <div className="companion-type-switch" role="radiogroup" aria-label="选择 AI伴侣角色">
              {COMPANION_TYPES.map((item) => {
                const isActive = companion.id === item.id;
                const avatarSymbol = item.id === "boyfriend" ? "✦" : "♡";

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`companion-type-card${isActive ? " active" : ""}`}
                    onClick={() => onCompanionTypeChange(item.id)}
                    disabled={disabled}
                    role="radio"
                    aria-checked={isActive}
                  >
                    <span className={`companion-type-avatar ${item.id}`} aria-hidden="true">
                      {avatarSymbol}
                    </span>
                    <div className="companion-type-copy">
                      <strong>{item.label} · {item.name}</strong>
                      <span>{item.styleLabel}</span>
                      <small>{item.shortDescription}</small>
                    </div>
                    <span className={`companion-type-check${isActive ? " active" : ""}`} aria-hidden="true">
                      {isActive ? "✓" : ""}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="role-settings-note">
              切换后会保留历史记录，但新的回复会按当前身份、氛围和守护感继续陪你聊天。
            </p>

            <section className="companion-voice-summary" aria-label="AI伴侣语音设置">
              <div>
                <strong>语音设置</strong>
                <span>播放 AI 回复时会自动使用当前角色对应的 ElevenLabs 声音。</span>
              </div>
              <div className="companion-voice-chip-row">
                {COMPANION_TYPES.map((item) => (
                  <span
                    key={item.id}
                    className={`companion-voice-chip${companion.id === item.id ? " active" : ""}`}
                  >
                    {item.label}声音：{COMPANION_VOICE_SUMMARY[item.id]}
                  </span>
                ))}
              </div>
            </section>

            <div className="settings-grid relationship-settings-grid">
              <label className="field-group">
                <span>聊天模式</span>
                <select
                  name="relationship-role"
                  value={roleId}
                  onChange={(event) => onRoleChange(event.target.value)}
                  disabled={disabled}
                >
                  {ROLES.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-group">
                <span>专属昵称</span>
                <input
                  name="relationship-user-nickname"
                  type="text"
                  value={userNickname}
                  onChange={(event) => onNicknameChange(event.target.value)}
                  disabled={disabled}
                  placeholder="例如：阿宇、小朋友、宝宝"
                />
              </label>

              <section className="personality-style-section relationship-grid-full">
                <div className="personality-style-head">
                  <span>陪伴风格</span>
                  <small>选择后会影响 {companion.name} 后续回复的语气和陪伴节奏</small>
                </div>

                <div className="personality-card-grid" role="radiogroup" aria-label="选择 AI 性格">
                  {GIRLFRIEND_STYLES.map((style) => {
                    const isActive = girlfriendStyleId === style.id;
                    const meta = PERSONALITY_CARD_META[style.id] || {
                      icon: "✧",
                      description: style.shortDescription,
                    };

                    return (
                      <button
                        key={style.id}
                        type="button"
                        className={`personality-card${isActive ? " active" : ""}`}
                        data-style={style.id}
                        onClick={() => onStyleChange(style.id)}
                        disabled={disabled}
                        role="radio"
                        aria-checked={isActive}
                      >
                        <span className="personality-card-icon" aria-hidden="true">
                          {meta.icon}
                        </span>
                        <span className="personality-card-copy">
                          <strong>{style.label}</strong>
                          <small>{meta.description}</small>
                        </span>
                        <span className="personality-card-check" aria-hidden="true">
                          {isActive ? "✓" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <label className="field-group relationship-grid-full">
                <span>自定义恋爱人设</span>
                <textarea
                  name="relationship-custom-persona"
                  rows={4}
                  value={customPersona}
                  onChange={(event) => onPersonaChange(event.target.value)}
                  disabled={disabled}
                  placeholder={`例如：${companion.name} 会在我低落时先安静陪着我，聊天像原创剑士伴侣，不提任何动漫角色来源。`}
                />
              </label>
            </div>
          </div>
        ) : null}
      </GlassCard>
    );
  }

  return (
    <GlassCard className="settings-card role-settings-card" theme={theme}>
      <div className="role-settings-compact-head">
        <div className="role-settings-current">
          <span className="companion-type-avatar general" aria-hidden="true">
            ✦
          </span>
          <div>
            <p className="eyebrow">角色与人设</p>
            <h3>{ROLES.find((role) => role.id === roleId)?.label || "通用助手"}</h3>
            <span>{customPersona ? "已设置额外偏好" : "默认对话偏好"}</span>
          </div>
        </div>
        <button
          type="button"
          className="role-settings-toggle"
          onClick={() => setGeneralSettingsOpen((current) => !current)}
          disabled={disabled}
          aria-expanded={generalSettingsOpen}
        >
          {generalSettingsOpen ? "收起设置" : "调整设置"}
        </button>
      </div>

      {generalSettingsOpen ? (
        <div className="role-settings-expanded">
          <div className="settings-grid">
            <label className="field-group">
              <span>当前角色</span>
              <select
                name="chat-role"
                value={roleId}
                onChange={(event) => onRoleChange(event.target.value)}
                disabled={disabled}
              >
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
                name="user-nickname"
                type="text"
                value={userNickname}
                onChange={(event) => onNicknameChange(event.target.value)}
                disabled={disabled}
                placeholder="例如：小宇、张三"
              />
            </label>
          </div>

          <label className="field-group">
            <span>额外对话偏好</span>
            <textarea
              name="custom-persona"
              rows={3}
              value={customPersona}
              onChange={(event) => onPersonaChange(event.target.value)}
              disabled={disabled}
              placeholder="例如：回答尽量简洁，先给结论，再给步骤。"
            />
          </label>
        </div>
      ) : null}
    </GlassCard>
  );
}
