"use client";

import { useEffect, useRef, useState } from "react";

import GlassCard from "@/components/ui/GlassCard";
import GradientButton from "@/components/ui/GradientButton";
import { buildApiUrl } from "@/lib/browser/api-url";

const RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
];

function appendRecognizedText(currentValue, recognizedText) {
  const base = currentValue || "";
  const text = (recognizedText || "").trim();
  if (!base.trim()) {
    return text;
  }

  const needsSpace = !/[\s，。！？；：,.!?;:]$/.test(base);
  return `${base}${needsSpace ? " " : ""}${text}`;
}

function getRecorderOptions() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return {};
  }

  const mimeType = RECORDER_MIME_TYPES.find((candidate) =>
    MediaRecorder.isTypeSupported(candidate),
  );

  return mimeType ? { mimeType } : {};
}

export default function MessageInput({
  value,
  placeholder,
  disabled,
  canRetry,
  canRegenerate,
  isStreaming,
  imagePreview,
  companionName = "TA",
  theme = "default",
  onChange,
  onPickImage,
  onRemoveImage,
  onClear,
  onStop,
  onSubmit,
  onRegenerate,
  onRetry,
  onSpeechText,
  onSpeechError,
}) {
  const textareaRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const resolvedCompanionType = companionName === "阿辰" ? "boyfriend" : "girlfriend";

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, 220);
    textarea.style.height = `${nextHeight}px`;
  }, [value]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) {
      return undefined;
    }

    const updateViewportOffset = () => {
      try {
        const gap = Math.max(
          0,
          window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop,
        );
        document.documentElement.style.setProperty("--viewport-bottom-gap", `${gap}px`);
      } catch (error) {
        console.warn("更新移动端视口偏移失败:", error);
      }
    };

    updateViewportOffset();
    window.visualViewport.addEventListener?.("resize", updateViewportOffset);
    window.visualViewport.addEventListener?.("scroll", updateViewportOffset);

    return () => {
      window.visualViewport.removeEventListener?.("resize", updateViewportOffset);
      window.visualViewport.removeEventListener?.("scroll", updateViewportOffset);
      document.documentElement.style.setProperty("--viewport-bottom-gap", "0px");
    };
  }, []);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      recorderRef.current = null;
      chunksRef.current = [];
      streamRef.current?.getTracks?.().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  function stopMediaStream() {
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function uploadRecording(blob) {
    if (!blob.size) {
      onSpeechError?.("没有录到声音，请再试一次。");
      return;
    }

    setIsTranscribing(true);

    try {
      const formData = new FormData();
      const extension = blob.type.includes("mp4") ? "mp4" : "webm";
      formData.append("file", blob, `voice-input-${Date.now()}.${extension}`);

      const response = await fetch(buildApiUrl("/api/speech-to-text"), {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = "语音识别失败，请重试。";
        try {
          const payload = await response.json();
          errorMessage = payload?.error || errorMessage;
        } catch {
          // Keep the friendly default when the server returns non-JSON.
        }
        throw new Error(errorMessage);
      }

      const payload = await response.json();
      const text = typeof payload?.text === "string" ? payload.text.trim() : "";
      if (!text) {
        onSpeechError?.("没有识别到有效内容，请再试一次。");
        return;
      }

      const nextValue = appendRecognizedText(value, text);
      onChange(nextValue);
      onSpeechText?.(text);
    } catch (speechError) {
      console.error("语音识别失败:", speechError);
      onSpeechError?.(speechError?.message || "语音识别失败，请重试。");
    } finally {
      setIsTranscribing(false);
    }
  }

  async function startRecording() {
    if (disabled || isTranscribing || isRecording) {
      return;
    }

    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      onSpeechError?.("当前浏览器不支持录音，请换用 Chrome 或 Safari 最新版本。");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, getRecorderOptions());
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("录音设备出错:", event);
        onSpeechError?.("语音识别失败，请重试。");
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || stream.getAudioTracks()[0]?.contentHint || "audio/webm";
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        recorderRef.current = null;
        chunksRef.current = [];
        stopMediaStream();
        setIsRecording(false);
        void uploadRecording(audioBlob);
      };

      recorder.start();
      setIsRecording(true);
      onSpeechError?.("");
    } catch (recordError) {
      console.error("打开麦克风失败:", recordError);
      stopMediaStream();
      setIsRecording(false);

      const denied =
        recordError?.name === "NotAllowedError" ||
        recordError?.name === "PermissionDeniedError";
      onSpeechError?.(
        denied
          ? "请允许麦克风权限后再使用语音输入。"
          : "语音识别失败，请重试。",
      );
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }

    recorder.stop();
  }

  function handleVoiceClick() {
    if (isRecording) {
      stopRecording();
      return;
    }

    void startRecording();
  }

  return (
    <GlassCard
      className="composer-panel"
      theme={theme}
      data-companion={resolvedCompanionType}
    >
      <div className="composer-shell">
        <textarea
          ref={textareaRef}
          name="chat-message"
          className="composer-textarea"
          value={value}
          rows={1}
          placeholder={placeholder || "输入你的问题，回车发送，Shift + Enter 换行；也可以发图片"}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />

        <div className="composer-inline-tools">
          <GradientButton
            variant="secondary"
            size="sm"
            round
            className={`icon-button composer-circle-button voice-record-button${
              isRecording ? " is-recording" : ""
            }${isTranscribing ? " is-transcribing" : ""}`}
            disabled={(disabled && !isRecording) || isTranscribing}
            theme={theme}
            title={isRecording ? "正在听，点击停止录音" : "语音输入"}
            aria-label={isRecording ? "停止录音" : "开始语音输入"}
            aria-pressed={isRecording}
            onClick={handleVoiceClick}
          >
            {isTranscribing ? "…" : isRecording ? "听" : "🎙"}
          </GradientButton>

          <label
            className={`ui-button icon-button file-button composer-circle-button${disabled ? " is-disabled" : ""}`}
            data-variant="secondary"
            data-size="sm"
            data-round="true"
            data-theme={theme}
            title="上传图片"
          >
            🖼
            <input
              name="chat-image"
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

          <GradientButton
            className="composer-send-button composer-circle-button"
            round
            theme={theme}
            onClick={isStreaming ? onStop : onSubmit}
            disabled={disabled && !isStreaming}
            aria-label={isStreaming ? "停止生成" : "发送消息"}
          >
            {isStreaming ? "■" : "➤"}
          </GradientButton>
        </div>
      </div>

      {imagePreview ? (
        <div className="composer-image-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagePreview.dataUrl} alt={imagePreview.name || "待发送图片"} />
          <div>
            <strong>{imagePreview.name || "待发送图片"}</strong>
            <span>发送时会交给服务端图片理解接口处理。</span>
          </div>
          <GradientButton
            variant="ghost"
            size="sm"
            onClick={onRemoveImage}
            disabled={disabled}
            theme={theme}
          >
            移除
          </GradientButton>
        </div>
      ) : null}

      <div className="composer-footer romance-composer-footer">
        <p>
          {isStreaming
            ? `${companionName} 正在认真听你说，你可以随时停止生成。`
            : "Enter 发送，Shift + Enter 换行，支持图片理解、重新生成和陪伴式对话。"}          </p>

        <div className="composer-actions composer-quick-actions">
          <GradientButton
            variant="secondary"
            size="sm"
            onClick={handleVoiceClick}
            disabled={(disabled && !isRecording) || isTranscribing}
            theme={theme}
            className={`voice-record-pill${isRecording ? " is-recording" : ""}`}
          >
            {isTranscribing ? "识别中..." : isRecording ? "🎙 正在听" : "🎙 语音输入"}
          </GradientButton>
          <label
            className={`ui-button file-button${disabled ? " is-disabled" : ""}`}
            data-variant="secondary"
            data-size="sm"
            data-theme={theme}
            title="图片识别"
          >
            🖼 图片识别
            <input
              name="chat-image-secondary"
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
          <GradientButton
            variant="secondary"
            size="sm"
            onClick={onClear}
            disabled={disabled}
            theme={theme}
          >
            🗑 清空聊天
          </GradientButton>
          {canRetry ? (
            <GradientButton
              variant="secondary"
              size="sm"
              onClick={onRetry}
              disabled={disabled}
              theme={theme}
            >
              ↺ 重新发送
            </GradientButton>
          ) : null}
          {canRegenerate ? (
            <GradientButton
              variant="secondary"
              size="sm"
              onClick={onRegenerate}
              disabled={disabled}
              theme={theme}
            >
              ↻ 重新生成
            </GradientButton>
          ) : null}
          {isStreaming ? (
            <GradientButton
              variant="danger"
              size="sm"
              onClick={onStop}
              theme={theme}
            >
              ■ 停止生成
            </GradientButton>
          ) : null}
        </div>
      </div>
    </GlassCard>
  );
}
