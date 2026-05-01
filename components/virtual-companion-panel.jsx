"use client";

import { useEffect, useRef, useState } from "react";

import GlassCard from "@/components/ui/GlassCard";
import GradientButton from "@/components/ui/GradientButton";
import {
  getAvailableVoices,
  getCompanionVoicePreset,
  isSpeechSynthesisSupported,
  primeSpeechSynthesis,
  resolveBrowserSpeechVoice,
  speakText,
  stopSpeechPlayback,
} from "@/lib/browser/speech";
import {
  createLive2dSpeechMotionController,
  ensureCubismCoreScript,
  getTapMotionGroup,
  getVirtualCompanionConfig,
  isIosTouchDevice,
  resetLive2dExpression,
  resolveLive2dExpression,
  toRendererPoint,
} from "@/lib/browser/virtual-companion";
import { getEmotionLabel, normalizeEmotion } from "@/lib/chat/emotion";
import { getCompanionProfile } from "@/lib/chat/roles";
import {
  DEFAULT_VIRTUAL_COMPANION_PREFS,
  getCompanionVoiceSettings,
  mergeVirtualCompanionPrefs,
  patchCompanionVoiceSettings,
} from "@/lib/storage/virtual-companion-prefs";
import { getTtsProviderLabel, TTS_PROVIDERS } from "@/lib/tts/providers";

function getSpeechMotionLabel(status) {
  if (status.mode === "full") {
    return "嘴型 + 呼吸";
  }

  if (status.mode === "mouth") {
    return "仅嘴型";
  }

  if (status.mode === "breath") {
    return "仅呼吸";
  }

  if (status.mode === "idle") {
    return "等待模型";
  }

  return "接口已预留";
}

function fitModelToCanvas(app, model, host) {
  const width = Math.max(host.clientWidth || 0, 280);
  const height = Math.max(host.clientHeight || 0, 360);
  const bounds = model.getLocalBounds();
  const offsetX = bounds.x || 0;
  const offsetY = bounds.y || 0;
  const safeWidth = Math.max(bounds.width || 0, 1);
  const safeHeight = Math.max(bounds.height || 0, 1);
  const scale = Math.min((width * 0.84) / safeWidth, (height * 0.94) / safeHeight) * 1.06;
  const bottomPadding = Math.max(10, height * 0.03);

  app.renderer.resize(width, height);
  model.scale.set(scale);
  model.x = width / 2 - (offsetX + safeWidth / 2) * scale;
  model.y = height - bottomPadding - (offsetY + safeHeight) * scale;
}

function applyEmotionToModel(model, emotion, expressionMap) {
  const normalizedEmotion = normalizeEmotion(emotion);
  const definitions =
    model?.internalModel?.motionManager?.expressionManager?.definitions || [];

  if (normalizedEmotion === "normal") {
    resetLive2dExpression(model);
    return true;
  }

  const expressionId = resolveLive2dExpression(definitions, normalizedEmotion, expressionMap);
  if (expressionId !== 0 && !expressionId) {
    resetLive2dExpression(model);
    return false;
  }

  try {
    model.expression(expressionId);
    return true;
  } catch (error) {
    console.error("切换 Live2D 表情失败:", error);
    resetLive2dExpression(model);
    return false;
  }
}

export default function VirtualCompanionPanel({
  sessionId,
  companionType,
  latestAssistantMessage,
  voicePreferences = DEFAULT_VIRTUAL_COMPANION_PREFS,
  onVoicePreferencesChange,
  theme = "romance",
}) {
  const companion = getCompanionProfile(companionType);
  const canvasHostRef = useRef(null);
  const appRef = useRef(null);
  const modelRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const speechMotionControllerRef = useRef(null);
  const lastSpokenMessageIdRef = useRef(latestAssistantMessage?.id || "");
  const lastSessionIdRef = useRef(sessionId || "");

  const [modelStatus, setModelStatus] = useState("idle");
  const [modelError, setModelError] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [voiceNotice, setVoiceNotice] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechChecked, setSpeechChecked] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [expressionFallback, setExpressionFallback] = useState(false);
  const [playbackState, setPlaybackState] = useState("idle");
  const [speechMotionStatus, setSpeechMotionStatus] = useState({
    mode: "idle",
    hasLipSync: false,
    hasBreathSync: false,
  });

  const activeEmotion = normalizeEmotion(latestAssistantMessage?.emotion);
  const live2dConfig = getVirtualCompanionConfig(companionType);
  const resolvedVoicePreferences = mergeVirtualCompanionPrefs(voicePreferences);
  const voiceEnabled = resolvedVoicePreferences.voiceEnabled;
  const voiceProvider = resolvedVoicePreferences.voiceProvider;
  const voiceSettings = getCompanionVoiceSettings(resolvedVoicePreferences, companion.id);
  const voicePreset = getCompanionVoicePreset(companion.id);
  const isIos = isIosTouchDevice();
  const speechPauseLabel = voiceSettings.pauseProfile?.label || "自然陪伴停顿";
  const voiceStatusLabel = !voiceEnabled
    ? "已关闭"
    : playbackState === "speaking"
      ? "正在播放语音"
      : "已开启";

  function commitVoicePreferences(recipe) {
    if (typeof onVoicePreferencesChange !== "function") {
      return;
    }

    onVoicePreferencesChange((current) => {
      const merged = mergeVirtualCompanionPrefs(current);
      const next = typeof recipe === "function" ? recipe(merged) : { ...merged, ...recipe };
      return mergeVirtualCompanionPrefs(next);
    });
  }

  function updateVoiceSetting(field, value) {
    commitVoicePreferences((current) =>
      patchCompanionVoiceSettings(current, companion.id, { [field]: Number(value) }),
    );
  }

  function renderPlaceholderCard(status) {
    const isError = status === "error";
    const statusTitle = isError ? "Live2D 模型暂未就绪" : live2dConfig.placeholder.title;
    const statusDescription = isError
      ? "已自动切到原创占位卡片，聊天、语音、情绪识别和记忆系统都不会受影响。"
      : live2dConfig.placeholder.description;

    return (
      <div className={`virtual-companion-placeholder companion-${companion.id}`}>
        <div className="virtual-placeholder-aura" aria-hidden="true" />
        <div className="virtual-placeholder-illustration" aria-hidden="true">
          <div className="virtual-placeholder-star" />
          <div className="virtual-placeholder-blade" />
          <div className="virtual-placeholder-portrait">
            <div className="virtual-placeholder-hair" />
            <div className="virtual-placeholder-face">
              <span className="virtual-placeholder-eyes" />
            </div>
            <div className="virtual-placeholder-shoulders" />
            <span className="virtual-placeholder-emblem">{live2dConfig.placeholder.avatar}</span>
          </div>
        </div>
        <div className="virtual-placeholder-copy">
          <span className="virtual-placeholder-badge">{live2dConfig.placeholder.badge}</span>
          <strong>{statusTitle}</strong>
          <p>{statusDescription}</p>
          <small className="virtual-placeholder-path">模型路径：{live2dConfig.modelUrl}</small>
        </div>
      </div>
    );
  }

  useEffect(() => {
    const supported = isSpeechSynthesisSupported();
    setSpeechSupported(supported);
    setSpeechChecked(true);
    setVoiceReady(Boolean(supported && getAvailableVoices().length));

    if (!supported || typeof window === "undefined") {
      return undefined;
    }

    const syncVoices = () => {
      setVoiceReady(Boolean(getAvailableVoices().length));
    };

    syncVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", syncVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", syncVoices);
    };
  }, []);

  useEffect(() => {
    if (!speechChecked || speechSupported || !voiceEnabled) {
      return;
    }

    if (typeof onVoicePreferencesChange === "function") {
      onVoicePreferencesChange((current) =>
        mergeVirtualCompanionPrefs({
          ...mergeVirtualCompanionPrefs(current),
          voiceEnabled: false,
        }),
      );
    }
    setPlaybackState("idle");
    setVoiceError("当前浏览器不支持 SpeechSynthesis，已自动关闭语音。");
  }, [onVoicePreferencesChange, speechChecked, speechSupported, voiceEnabled]);

  useEffect(() => {
    if (voiceEnabled) {
      return undefined;
    }

    stopSpeechPlayback();
    speechMotionControllerRef.current?.stopSpeaking();
    setPlaybackState("idle");
    return undefined;
  }, [voiceEnabled]);

  useEffect(() => {
    if (!speechSupported) {
      return;
    }

    if (voiceProvider !== TTS_PROVIDERS.browser) {
      setVoiceNotice("当前 TTS 引擎扩展接口已预留，等待接入后即可启用。");
      return;
    }

    const resolvedVoice = resolveBrowserSpeechVoice({
      voices: getAvailableVoices(),
      genderHint: voiceSettings.genderHint,
      preferredVoiceName: voiceSettings.preferredVoiceName,
    });

    if (resolvedVoice.warning) {
      setVoiceNotice(resolvedVoice.warning);
      return;
    }

    if (voiceNotice === "当前设备未找到理想中文音色，已使用默认语音") {
      setVoiceNotice("");
    }
  }, [
    speechSupported,
    voiceNotice,
    voiceProvider,
    voiceSettings.genderHint,
    voiceSettings.preferredVoiceName,
    voiceReady,
  ]);

  useEffect(() => {
    let disposed = false;
    const host = canvasHostRef.current;
    let touchEndHandler = null;
    let resizeHandler = null;

    if (!host) {
      return undefined;
    }

    if (!live2dConfig.modelUrl) {
      setModelStatus("empty");
      setModelError("");
      return undefined;
    }

    async function setupModel() {
      setModelStatus("loading");
      setModelError("");
      setExpressionFallback(false);

      try {
        if (live2dConfig.modelUrl.startsWith("/")) {
          const probeResponse = await fetch(live2dConfig.modelUrl, {
            method: "HEAD",
            cache: "no-store",
          });

          if (!probeResponse.ok) {
            setModelStatus("empty");
            setModelError("未检测到当前角色的本地 Live2D 模型文件。");
            return;
          }
        }

        await ensureCubismCoreScript(live2dConfig.coreUrl);
        const PIXI = await import("pixi.js");
        const { Live2DModel } = await import("pixi-live2d-display/cubism4");

        if (disposed || !canvasHostRef.current) {
          return;
        }

        window.PIXI = PIXI;

        const app = new PIXI.Application({
          width: Math.max(host.clientWidth || 0, 280),
          height: Math.max(host.clientHeight || 0, 320),
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
        });

        while (host.firstChild) {
          host.removeChild(host.firstChild);
        }
        host.appendChild(app.view);

        app.view.className = "virtual-companion-canvas";
        app.view.style.touchAction = "manipulation";
        app.view.style.webkitTapHighlightColor = "transparent";

        const model = await Live2DModel.from(live2dConfig.modelUrl);
        if (disposed) {
          app.destroy(true, { children: true });
          return;
        }

        model.interactive = true;
        model.buttonMode = true;
        app.stage.addChild(model);
        fitModelToCanvas(app, model, host);

        const tapMotionGroup = getTapMotionGroup(model, live2dConfig.tapMotionGroup);
        model.on("hit", () => {
          if (!tapMotionGroup) {
            return;
          }

          try {
            model.motion(tapMotionGroup);
          } catch (error) {
            console.error("播放 Live2D 动作失败:", error);
          }
        });

        if (isIosTouchDevice()) {
          touchEndHandler = (event) => {
            const touch = event.changedTouches?.[0];
            if (!touch) {
              return;
            }

            event.preventDefault();
            const point = toRendererPoint(touch.clientX, touch.clientY, app.view, app.renderer);
            model.tap(point.x, point.y);
          };

          app.view.addEventListener("touchend", touchEndHandler, { passive: false });
        }

        resizeHandler = () => {
          if (!canvasHostRef.current) {
            return;
          }

          fitModelToCanvas(app, model, canvasHostRef.current);
        };

        if (typeof ResizeObserver === "function") {
          const resizeObserver = new ResizeObserver(resizeHandler);
          resizeObserver.observe(host);
          resizeObserverRef.current = resizeObserver;
        } else {
          window.addEventListener("resize", resizeHandler);
        }

        appRef.current = app;
        modelRef.current = model;
        setModelStatus("ready");
      } catch (error) {
        console.error("加载 Live2D 模型失败:", error);
        setModelStatus("error");
        setModelError(error?.message || "Live2D 模型加载失败，请检查模型地址或网络。");
      }
    }

    setupModel();

    return () => {
      disposed = true;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (resizeHandler) {
        window.removeEventListener("resize", resizeHandler);
      }

      const app = appRef.current;
      if (app?.view && touchEndHandler) {
        app.view.removeEventListener("touchend", touchEndHandler);
      }

      modelRef.current = null;
      appRef.current = null;
      speechMotionControllerRef.current?.destroy();
      speechMotionControllerRef.current = null;
      app?.destroy(true, { children: true });
    };
  }, [
    live2dConfig.coreUrl,
    live2dConfig.expressionMap,
    live2dConfig.modelUrl,
    live2dConfig.tapMotionGroup,
  ]);

  useEffect(() => {
    if (modelStatus !== "ready" || !modelRef.current) {
      return;
    }

    const matchedExpression = applyEmotionToModel(
      modelRef.current,
      activeEmotion,
      live2dConfig.expressionMap,
    );
    setExpressionFallback(!matchedExpression && activeEmotion !== "normal");
  }, [activeEmotion, live2dConfig.expressionMap, modelStatus]);

  useEffect(() => {
    speechMotionControllerRef.current?.destroy();
    speechMotionControllerRef.current = null;

    if (modelStatus !== "ready" || !modelRef.current) {
      setSpeechMotionStatus({
        mode: modelStatus === "ready" ? "none" : "idle",
        hasLipSync: false,
        hasBreathSync: false,
      });
      return undefined;
    }

    const controller = createLive2dSpeechMotionController(
      modelRef.current,
      live2dConfig.speechMotion,
    );
    speechMotionControllerRef.current = controller;
    setSpeechMotionStatus(controller.capabilities);

    return () => {
      controller.destroy();
      if (speechMotionControllerRef.current === controller) {
        speechMotionControllerRef.current = null;
      }
    };
  }, [live2dConfig.speechMotion, modelStatus]);

  function markSpeechUnlocked() {
    commitVoicePreferences((current) => ({
      ...current,
      speechUnlocked: true,
    }));
  }

  function playSpeech(content, source = "manual") {
    const result = speakText(content, {
      provider: voiceProvider,
      companionType: companion.id,
      ...voiceSettings,
      onStart: () => {
        setPlaybackState("speaking");
        setVoiceError("");
        speechMotionControllerRef.current?.startSpeaking({ intensity: 0.76 });
      },
      onSegmentStart: (event) => {
        speechMotionControllerRef.current?.updateSpeaking({
          ...event,
          intensity: 0.72,
        });
      },
      onBoundary: (event) => {
        speechMotionControllerRef.current?.updateSpeaking(event);
      },
      onSegmentEnd: () => {
        speechMotionControllerRef.current?.stopSpeaking();
      },
      onEnd: () => {
        speechMotionControllerRef.current?.stopSpeaking();
        setPlaybackState("idle");
      },
      onError: (event) => {
        const errorName = String(event?.error || "").toLowerCase();
        speechMotionControllerRef.current?.stopSpeaking();
        setPlaybackState("idle");
        if (errorName.includes("not-allowed") || (source === "auto" && isIos)) {
          setVoiceError("浏览器阻止了自动朗读，可先点一次“重播语音”或重新打开语音。");
          return;
        }

        setVoiceError("语音播放失败，请稍后重试。");
      },
    });

    if (!result.started) {
      speechMotionControllerRef.current?.stopSpeaking();
      setPlaybackState("idle");
      if (result.warning) {
        setVoiceNotice(result.warning);
      }

      if (result.error === "unsupported") {
        setVoiceError("当前浏览器不支持 SpeechSynthesis，已自动关闭语音。");
      } else if (result.error === "provider_not_ready") {
        setVoiceError("当前 TTS 引擎尚未接入，暂时无法播放语音。");
      } else {
        setVoiceError("当前回复没有可朗读的文本内容。");
      }
      return false;
    }

    setVoiceNotice(result.warning || "");
    return true;
  }

  useEffect(() => {
    if (!speechSupported || !voiceEnabled || !latestAssistantMessage?.id || !latestAssistantMessage?.content) {
      return;
    }

    if (lastSessionIdRef.current !== sessionId) {
      lastSessionIdRef.current = sessionId;
      lastSpokenMessageIdRef.current = latestAssistantMessage.id;
      return;
    }

    if (lastSpokenMessageIdRef.current === latestAssistantMessage.id) {
      return;
    }

    if (voiceProvider !== TTS_PROVIDERS.browser) {
      setVoiceError("当前 TTS 引擎尚未接入，暂时无法自动播放语音。");
      lastSpokenMessageIdRef.current = latestAssistantMessage.id;
      return;
    }

    if (isIos && !resolvedVoicePreferences.speechUnlocked) {
      setVoiceError("iPhone Safari 首次需要点一次“开启语音”或“重播语音”后，后续才可自动朗读。");
      lastSpokenMessageIdRef.current = latestAssistantMessage.id;
      return;
    }

    lastSpokenMessageIdRef.current = latestAssistantMessage.id;
    const result = speakText(latestAssistantMessage.content, {
      provider: voiceProvider,
      companionType: companion.id,
      ...voiceSettings,
      onStart: () => {
        setPlaybackState("speaking");
        setVoiceError("");
        speechMotionControllerRef.current?.startSpeaking({ intensity: 0.76 });
      },
      onSegmentStart: (event) => {
        speechMotionControllerRef.current?.updateSpeaking({
          ...event,
          intensity: 0.72,
        });
      },
      onBoundary: (event) => {
        speechMotionControllerRef.current?.updateSpeaking(event);
      },
      onSegmentEnd: () => {
        speechMotionControllerRef.current?.stopSpeaking();
      },
      onEnd: () => {
        speechMotionControllerRef.current?.stopSpeaking();
        setPlaybackState("idle");
      },
      onError: (event) => {
        const errorName = String(event?.error || "").toLowerCase();
        speechMotionControllerRef.current?.stopSpeaking();
        setPlaybackState("idle");
        if (errorName.includes("not-allowed") || isIos) {
          setVoiceError("浏览器阻止了自动朗读，可先点一次“重播语音”或重新打开语音。");
          return;
        }

        setVoiceError("语音播放失败，请稍后重试。");
      },
    });

    if (!result.started) {
      speechMotionControllerRef.current?.stopSpeaking();
      setPlaybackState("idle");
      if (result.warning) {
        setVoiceNotice(result.warning);
      }

      if (result.error === "unsupported") {
        setVoiceError("当前浏览器不支持 SpeechSynthesis，已自动关闭语音。");
      } else if (result.error === "provider_not_ready") {
        setVoiceError("当前 TTS 引擎尚未接入，暂时无法播放语音。");
      } else {
        setVoiceError("当前回复没有可朗读的文本内容。");
      }
      return;
    }

    setVoiceNotice(result.warning || "");
  }, [
    companion.id,
    isIos,
    latestAssistantMessage?.content,
    latestAssistantMessage?.id,
    resolvedVoicePreferences.speechUnlocked,
    sessionId,
    speechSupported,
    voiceEnabled,
    voiceProvider,
    voiceSettings,
  ]);

  function handleReplayVoice() {
    if (!latestAssistantMessage?.content) {
      setVoiceError("当前还没有可重播的 AI 回复。");
      return;
    }

    if (!speechSupported) {
      setVoiceError("当前浏览器不支持 SpeechSynthesis 语音朗读。");
      return;
    }

    if (primeSpeechSynthesis({ lang: "zh-CN" })) {
      markSpeechUnlocked();
    }

    playSpeech(latestAssistantMessage.content, "manual");
  }

  function handleToggleVoice() {
    const nextEnabled = !voiceEnabled;

    if (!nextEnabled) {
      stopSpeechPlayback();
      speechMotionControllerRef.current?.stopSpeaking();
      setPlaybackState("idle");
      setVoiceError("");
    } else {
      const primed = primeSpeechSynthesis({ lang: "zh-CN" });
      if (primed) {
        markSpeechUnlocked();
      } else if (isIos) {
        setVoiceError("iPhone Safari 可能需要你先点一次“重播语音”来激活播放权限。");
      }
    }

    commitVoicePreferences((current) => ({
      ...current,
      voiceEnabled: nextEnabled,
    }));
  }

  return (
    <GlassCard
      className="virtual-companion-panel"
      theme={theme}
      data-companion={companion.id}
    >
      <div className="virtual-companion-head">
        <div>
          <p className="eyebrow">虚拟角色</p>
          <h3>{companion.name} 的原创 Live2D 形象</h3>
        </div>

        <div className="virtual-companion-status">
          <span className="virtual-status-chip">情绪：{getEmotionLabel(activeEmotion)}</span>
          <span className="virtual-status-chip">语音：{voiceStatusLabel}</span>
          <span className="virtual-status-chip">引擎：{getTtsProviderLabel(voiceProvider)}</span>
          <span className="virtual-status-chip">联动：{getSpeechMotionLabel(speechMotionStatus)}</span>
        </div>
      </div>

      <div className="virtual-companion-stage">
        <div className="virtual-companion-canvas-shell">
          <div ref={canvasHostRef} className="virtual-companion-canvas-host" />

          {modelStatus === "loading" ? (
            <div className="virtual-companion-overlay">
              <strong>正在加载 {companion.name} 的 Live2D 模型…</strong>
              <span>首次进入会拉取模型资源，移动端可能会稍慢一点。</span>
            </div>
          ) : null}

          {modelStatus === "error" ? (
            <div className="virtual-companion-overlay is-placeholder error">
              {renderPlaceholderCard("error")}
              <span>{modelError}</span>
            </div>
          ) : null}

          {modelStatus === "empty" ? (
            <div className="virtual-companion-overlay is-placeholder">
              {renderPlaceholderCard("empty")}
              <span>把模型文件放进对应角色目录后，刷新页面就会自动加载。</span>
            </div>
          ) : null}
        </div>

        <div className="virtual-companion-toolbar">
          <GradientButton type="button" onClick={handleToggleVoice} theme={theme}>
            {voiceEnabled ? "关闭语音" : "开启语音"}
          </GradientButton>

          <GradientButton
            type="button"
            variant="ghost"
            onClick={handleReplayVoice}
            disabled={!latestAssistantMessage?.content}
            theme={theme}
          >
            重播语音
          </GradientButton>
        </div>

        <div className="virtual-voice-settings">
          <div className="virtual-voice-settings-head">
            <div>
              <strong>语音设置</strong>
              <span>
                {companion.name} 默认使用 {voicePreset.styleLabel}
                {voiceProvider === TTS_PROVIDERS.browser
                  ? `，当前由浏览器 SpeechSynthesis 驱动，并套用“${speechPauseLabel}”。`
                  : `，当前已切到 ${getTtsProviderLabel(voiceProvider)} 模板通道。`}
              </span>
            </div>
          </div>

          <div className="virtual-voice-settings-actions">
            <span className="virtual-inline-chip">停顿策略：{speechPauseLabel}</span>
            <a className="virtual-inline-link" href="/tts-workbench">
              打开第三方 TTS 接入骨架页
            </a>
          </div>

          <div className="virtual-voice-settings-grid">
            <label className="field-group virtual-slider-group">
              <span>语速</span>
              <div className="virtual-slider-row">
                <input
                  type="range"
                  min="0.6"
                  max="1.3"
                  step="0.05"
                  value={voiceSettings.rate}
                  onChange={(event) => updateVoiceSetting("rate", event.target.value)}
                  disabled={!speechSupported}
                />
                <strong>{voiceSettings.rate.toFixed(2)}</strong>
              </div>
            </label>

            <label className="field-group virtual-slider-group">
              <span>音调</span>
              <div className="virtual-slider-row">
                <input
                  type="range"
                  min="0.5"
                  max="1.6"
                  step="0.05"
                  value={voiceSettings.pitch}
                  onChange={(event) => updateVoiceSetting("pitch", event.target.value)}
                  disabled={!speechSupported}
                />
                <strong>{voiceSettings.pitch.toFixed(2)}</strong>
              </div>
            </label>

            <label className="field-group virtual-slider-group">
              <span>音量</span>
              <div className="virtual-slider-row">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={voiceSettings.volume}
                  onChange={(event) => updateVoiceSetting("volume", event.target.value)}
                  disabled={!speechSupported}
                />
                <strong>{voiceSettings.volume.toFixed(2)}</strong>
              </div>
            </label>
          </div>
        </div>

        <div className="virtual-companion-note">
          <span>
            {modelStatus === "ready"
              ? "轻触角色可触发模型点击区域动作，iPhone Safari 会自动启用触摸兜底。"
              : "模型未就绪时，聊天功能仍会保持原样继续工作。"}
          </span>
          {modelStatus === "ready" && speechMotionStatus.mode === "none" ? (
            <span>当前模型暂未暴露嘴型或呼吸参数，语音联动接口已预留，后续补齐参数后会自动接上。</span>
          ) : null}
          {modelStatus === "ready" && speechMotionStatus.mode === "mouth" ? (
            <span>当前已接上嘴型联动，呼吸参数还未暴露；后续换更完整的模型时会自动升级。</span>
          ) : null}
          {modelStatus === "ready" && speechMotionStatus.mode === "breath" ? (
            <span>当前已接上呼吸联动，嘴型参数还未暴露；后续补齐口型参数即可继续细化。</span>
          ) : null}
          {modelStatus === "ready" && speechMotionStatus.mode === "full" ? (
            <span>当前模型已接上嘴型与呼吸联动，后面切第三方 TTS 时也能继续复用这层接口。</span>
          ) : null}
          {expressionFallback ? (
            <span>当前模型没有完全匹配的表情，已自动回退到默认表情。</span>
          ) : null}
          {!speechSupported ? (
            <span>当前浏览器不支持 SpeechSynthesis，语音朗读会自动停用。</span>
          ) : null}
          {speechSupported && !voiceReady ? (
            <span>系统语音还在准备中，首次进入 Safari 可能会延迟几秒。</span>
          ) : null}
          {voiceNotice ? <span>{voiceNotice}</span> : null}
          {voiceError ? <span>{voiceError}</span> : null}
        </div>
      </div>
    </GlassCard>
  );
}
