import { parseEmotion } from "@/lib/chat/emotion";
import { normalizeCompanionType } from "@/lib/chat/roles";
import { getLive2dModelConfig } from "@/src/config/live2dModels";

let cubismCorePromise = null;

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numeric));
}

function getExpressionDefinitionName(definition) {
  return String(definition?.name || definition?.Name || definition?.file || definition?.File || "").trim();
}

function findMatchingExpression(definitions, candidates) {
  const normalizedCandidates = candidates.map((candidate) => String(candidate).toLowerCase());
  const exactMatch = definitions.find((definition) =>
    normalizedCandidates.includes(getExpressionDefinitionName(definition).toLowerCase()),
  );

  if (exactMatch) {
    return getExpressionDefinitionName(exactMatch);
  }

  const fuzzyMatch = definitions.find((definition) =>
    normalizedCandidates.some((candidate) =>
      getExpressionDefinitionName(definition).toLowerCase().includes(candidate),
    ),
  );

  return fuzzyMatch ? getExpressionDefinitionName(fuzzyMatch) : "";
}

function hasNamedExpression(definitions, value) {
  return definitions.some(
    (definition, index) =>
      getExpressionDefinitionName(definition).toLowerCase() === String(value).toLowerCase() ||
      String(index) === String(value),
  );
}

export function getVirtualCompanionConfig(companionType) {
  const resolvedType = normalizeCompanionType(companionType);
  return getLive2dModelConfig(resolvedType);
}

export function isIosTouchDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function ensureCubismCoreScript(url) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("当前环境不支持加载 Live2D 运行时。"));
  }

  if (window.Live2DCubismCore) {
    return Promise.resolve();
  }

  if (cubismCorePromise) {
    return cubismCorePromise;
  }

  cubismCorePromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-live2d-core="true"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Live2D Core 脚本加载失败，请检查网络或 NEXT_PUBLIC_LIVE2D_CORE_URL。")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.dataset.live2dCore = "true";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Live2D Core 脚本加载失败，请检查网络或 NEXT_PUBLIC_LIVE2D_CORE_URL。"));
    document.head.appendChild(script);
  }).catch((error) => {
    cubismCorePromise = null;
    throw error;
  });

  return cubismCorePromise;
}

export function resetLive2dExpression(model) {
  model?.internalModel?.motionManager?.expressionManager?.resetExpression?.();
}

export function resolveLive2dExpression(definitions, emotion, expressionMap = {}) {
  const parsedEmotion = parseEmotion(emotion);
  if (!parsedEmotion || parsedEmotion === "normal") {
    return "";
  }

  const preferred = expressionMap[parsedEmotion];
  if (preferred && preferred !== "default" && hasNamedExpression(definitions, preferred)) {
    return /^\d+$/.test(String(preferred)) ? Number(preferred) : preferred;
  }

  if (parsedEmotion === "happy") {
    return findMatchingExpression(definitions, ["happy", "smile", "laugh", "f05", "f04", "f01"]);
  }

  return findMatchingExpression(definitions, ["sad", "cry", "upset", "f03", "f02", "f08"]);
}

export function getLive2dMotionGroups(model) {
  const groups = model?.internalModel?.motionManager?.definitions;
  return groups ? Object.keys(groups).filter(Boolean) : [];
}

export function getTapMotionGroup(model, preferredGroup = "") {
  const groups = getLive2dMotionGroups(model);
  if (!groups.length) {
    return "";
  }

  if (preferredGroup && groups.includes(preferredGroup)) {
    return preferredGroup;
  }

  return (
    groups.find((group) => /tap|touch|flick/i.test(group)) ||
    groups.find((group) => !/idle/i.test(group)) ||
    ""
  );
}

export function toRendererPoint(clientX, clientY, canvas, renderer) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = renderer.width / rect.width;
  const scaleY = renderer.height / rect.height;

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function getCoreModel(model) {
  return model?.internalModel?.coreModel || null;
}

function getParameterIndex(coreModel, parameterId) {
  if (!coreModel || !parameterId) {
    return -1;
  }

  try {
    if (typeof coreModel.getParameterIndex === "function") {
      return coreModel.getParameterIndex(parameterId);
    }
  } catch {
    return -1;
  }

  const ids = coreModel._parameterIds || coreModel.parameters?.ids;
  if (Array.isArray(ids)) {
    return ids.findIndex((id) => String(id) === String(parameterId));
  }

  return -1;
}

function resolveLive2dParameterId(model, candidates = []) {
  const coreModel = getCoreModel(model);
  if (!coreModel) {
    return "";
  }

  for (const candidate of candidates) {
    if (getParameterIndex(coreModel, candidate) >= 0) {
      return candidate;
    }
  }

  return "";
}

function setLive2dParameterValue(model, parameterId, value) {
  if (!model || !parameterId) {
    return false;
  }

  const clampedValue = clampNumber(value, -1, 1.5, 0);

  try {
    if (typeof model.internalModel?.addParameterValueById === "function") {
      model.internalModel.addParameterValueById(parameterId, clampedValue, 1);
      return true;
    }
  } catch {}

  try {
    if (typeof model.internalModel?.coreModel?.setParameterValueById === "function") {
      model.internalModel.coreModel.setParameterValueById(parameterId, clampedValue);
      return true;
    }
  } catch {}

  return false;
}

export function createLive2dSpeechMotionController(model, speechMotion = {}) {
  if (typeof window === "undefined" || !model) {
    return {
      capabilities: {
        mode: "none",
        hasLipSync: false,
        hasBreathSync: false,
        mouthParamId: "",
        breathParamId: "",
      },
      startSpeaking() {},
      updateSpeaking() {},
      stopSpeaking() {},
      destroy() {},
    };
  }

  const mouthParamId = resolveLive2dParameterId(
    model,
    speechMotion.mouthParamCandidates || [],
  );
  const breathParamId = resolveLive2dParameterId(
    model,
    speechMotion.breathParamCandidates || [],
  );
  const hasLipSync = Boolean(mouthParamId);
  const hasBreathSync = Boolean(breathParamId);

  const state = {
    disposed: false,
    rafId: 0,
    speaking: false,
    intensity: 0.66,
    lastBoundaryAt: 0,
  };

  function writeFrame(now) {
    if (state.disposed) {
      return;
    }

    const mouthIdle = clampNumber(speechMotion.mouthIdle, 0, 1, 0.04);
    const mouthAmplitude = clampNumber(speechMotion.mouthAmplitude, 0, 1.2, 0.72);
    const breathBase = clampNumber(speechMotion.breathBase, -1, 1, 0.18);
    const breathAmplitude = clampNumber(speechMotion.breathAmplitude, 0, 1, 0.12);
    const breathSpeed = clampNumber(speechMotion.breathSpeed, 0.0005, 0.01, 0.0018);
    const speakingSpeed = clampNumber(speechMotion.speakingSpeed, 0.004, 0.05, 0.019);
    const freshness = state.speaking
      ? Math.max(0.2, 1 - (now - state.lastBoundaryAt) / 260)
      : 0;

    if (hasBreathSync) {
      const breathingValue =
        breathBase +
        Math.sin(now * breathSpeed) * breathAmplitude * (state.speaking ? 1.18 : 0.88);
      setLive2dParameterValue(model, breathParamId, breathingValue);
    }

    if (hasLipSync) {
      const speakingWave = Math.abs(Math.sin(now * speakingSpeed));
      const mouthValue = state.speaking
        ? mouthIdle + speakingWave * mouthAmplitude * Math.max(state.intensity, freshness)
        : mouthIdle * 0.35;
      setLive2dParameterValue(model, mouthParamId, mouthValue);
    }

    state.rafId = window.requestAnimationFrame(writeFrame);
  }

  state.rafId = window.requestAnimationFrame(writeFrame);

  return {
    capabilities: {
      mode: hasLipSync && hasBreathSync ? "full" : hasLipSync ? "mouth" : hasBreathSync ? "breath" : "none",
      hasLipSync,
      hasBreathSync,
      mouthParamId,
      breathParamId,
    },
    startSpeaking(meta = {}) {
      state.speaking = true;
      state.lastBoundaryAt = performance.now();
      state.intensity = clampNumber(meta.intensity, 0.2, 1, 0.72);
    },
    updateSpeaking(meta = {}) {
      state.speaking = true;
      state.lastBoundaryAt = performance.now();
      state.intensity = clampNumber(
        meta.intensity ??
          0.46 +
            Math.min(
              0.42,
              Number(meta.charIndex || 0) / Math.max(6, Number(meta.segmentText?.length || 0)),
            ),
        0.2,
        1,
        0.72,
      );
    },
    stopSpeaking() {
      state.speaking = false;
      state.intensity = 0.32;
      if (hasLipSync) {
        setLive2dParameterValue(model, mouthParamId, 0.02);
      }
    },
    destroy() {
      state.disposed = true;
      window.cancelAnimationFrame(state.rafId);
      if (hasLipSync) {
        setLive2dParameterValue(model, mouthParamId, 0.02);
      }
    },
  };
}
