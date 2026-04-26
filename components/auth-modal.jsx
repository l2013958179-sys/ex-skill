"use client";

import { useEffect, useState } from "react";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function AuthModal({ isOpen, initialMode = "login", loading, error, onClose, onSubmit }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const [localSuccess, setLocalSuccess] = useState("");

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (!isOpen) {
      setEmail("");
      setPassword("");
      setLocalError("");
      setLocalSuccess("");
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLocalError("");
    setLocalSuccess("");

    if (!isValidEmail(email.trim())) {
      setLocalError("请输入有效的邮箱地址。");
      return;
    }

    if (password.trim().length < 6) {
      setLocalError("密码至少需要 6 位。");
      return;
    }

    const result = await onSubmit({
      mode,
      email: email.trim(),
      password: password.trim(),
    });

    if (result?.successMessage) {
      setLocalSuccess(result.successMessage);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="auth-modal" onClick={(event) => event.stopPropagation()}>
        <div className="auth-modal-head">
          <div>
            <p className="eyebrow">账号</p>
            <h3>{mode === "login" ? "登录账号" : "注册账号"}</h3>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="auth-switcher">
          <button
            type="button"
            className={`auth-tab${mode === "login" ? " active" : ""}`}
            onClick={() => setMode("login")}
          >
            登录
          </button>
          <button
            type="button"
            className={`auth-tab${mode === "register" ? " active" : ""}`}
            onClick={() => setMode("register")}
          >
            注册
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field-group">
            <span>邮箱</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <label className="field-group">
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 6 位密码"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>

          <p className="auth-hint">
            {mode === "login"
              ? "登录后会自动同步游客聊天记录到云端。"
              : "注册成功后，如果开启了邮箱确认，请先去邮箱完成验证。"}
          </p>

          {localSuccess ? <p className="auth-success">{localSuccess}</p> : null}
          {localError ? <p className="auth-error">{localError}</p> : null}
          {error ? <p className="auth-error">{error}</p> : null}

          <button type="submit" className="primary-button auth-submit" disabled={loading}>
            {loading ? "处理中..." : mode === "login" ? "登录" : "注册"}
          </button>
        </form>
      </div>
    </div>
  );
}
