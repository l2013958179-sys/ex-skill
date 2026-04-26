"use client";

import { useEffect, useRef } from "react";

export default function MessageInput({
  value,
  disabled,
  canRetry,
  imagePreview,
  onChange,
  onPickImage,
  onRemoveImage,
  onSubmit,
  onRetry,
}) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, 220);
    textarea.style.height = `${nextHeight}px`;
  }, [value]);

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="composer-panel">
      <textarea
        ref={textareaRef}
        className="composer-textarea"
        value={value}
        rows={1}
        placeholder="输入你的问题，回车发送，Shift + Enter 换行；也可以发图片"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />

      {imagePreview ? (
        <div className="composer-image-preview">
          <img src={imagePreview.dataUrl} alt={imagePreview.name || "待发送图片"} />
          <div>
            <strong>{imagePreview.name || "待发送图片"}</strong>
            <span>发送时会交给服务端图片理解接口处理。</span>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={onRemoveImage}
            disabled={disabled}
          >
            移除
          </button>
        </div>
      ) : null}

      <div className="composer-footer">
        <p>模型调用发生在服务端接口，不会在前端暴露 API Key。</p>
        <div className="composer-actions">
          <label className={`secondary-button file-button${disabled ? " is-disabled" : ""}`}>
            上传图片
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onPickImage(file);
                }
                event.target.value = "";
              }}
              disabled={disabled}
            />
          </label>
          {canRetry ? (
            <button
              type="button"
              className="secondary-button"
              onClick={onRetry}
              disabled={disabled}
            >
              重新发送上一条
            </button>
          ) : null}
          <button type="button" className="primary-button" onClick={onSubmit} disabled={disabled}>
            {disabled ? "正在生成..." : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}
