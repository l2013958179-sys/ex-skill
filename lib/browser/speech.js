import { normalizeCompanionType } from "@/lib/chat/roles";
import { TTS_PROVIDERS, isBrowserTtsProvider } from "@/lib/tts/providers";

function isBrowser() {
  return typeof window !== "undefined";
}

const FEMALE_VOICE_PATTERNS =
  /xiaoxiao|xiaoyi|xiaohan|xiaomeng|tingting|huihui|female|woman|girl|siri|mei|sweet/i;
const MALE_VOICE_PATTERNS =
  /yunjian|yunxi|yunyang|xiaogang|male|man|boy|guy|gang|jian|chen/i;

const DEFAULT_PAUSE_PROFILE = {
  label: "自然陪伴停顿",
  leadInPauseMs: 60,
  clausePauseMs: 180,
  sentencePauseMs: 340,
  tailPauseMs: 120,
  segmentLimit: 28,
  starterPhrases: [],
};

let activeSpeechSession = null;

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numeric));
}

function getPauseProfile(companionType, overrides = {}) {
  const preset = COMPANION_VOICE_PRESETS[normalizeCompanionType(companionType)] || DEFAULT_PAUSE_PROFILE;
  return {
    ...DEFAULT_PAUSE_PROFILE,
    ...preset.pauseProfile,
    ...(overrides.pauseProfile || {}),
    starterPhrases:
      Array.isArray(overrides.pauseProfile?.starterPhrases) &&
      overrides.pauseProfile.starterPhrases.length
        ? overrides.pauseProfile.starterPhrases
        : preset.pauseProfile?.starterPhrases || DEFAULT_PAUSE_PROFILE.starterPhrases,
  };
}

export const COMPANION_VOICE_PRESETS = {
  girlfriend: {
    rate: 0.9,
    pitch: 1.25,
    volume: 1,
    genderHint: "female",
    styleLabel: "中文甜妹音",
    pauseProfile: {
      label: "小柠的温柔停顿",
      leadInPauseMs: 90,
      clausePauseMs: 220,
      sentencePauseMs: 430,
      tailPauseMs: 180,
      segmentLimit: 24,
      starterPhrases: ["嗯", "好呀", "辛苦啦", "抱抱你", "别担心", "我在呢", "慢慢说"],
    },
  },
  boyfriend: {
    rate: 0.95,
    pitch: 0.85,
    volume: 1,
    genderHint: "male",
    styleLabel: "中文温柔男声",
    pauseProfile: {
      label: "阿辰的沉稳停顿",
      leadInPauseMs: 40,
      clausePauseMs: 170,
      sentencePauseMs: 360,
      tailPauseMs: 140,
      segmentLimit: 30,
      starterPhrases: ["嗯", "先别急", "我在", "慢慢来", "别怕", "辛苦了", "说给我听"],
    },
  },
};

export function isSpeechSynthesisSupported() {
  return (
    isBrowser() &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

function disposeSpeechSession(session) {
  if (!session) {
    return;
  }

  session.cancelled = true;

  if (session.timerId) {
    window.clearTimeout(session.timerId);
    session.timerId = 0;
  }

  session.utterances.forEach((utterance) => {
    utterance.onstart = null;
    utterance.onend = null;
    utterance.onerror = null;
    utterance.onboundary = null;
  });
}

export function stopSpeechPlayback() {
  if (activeSpeechSession) {
    disposeSpeechSession(activeSpeechSession);
    activeSpeechSession = null;
  }

  if (!isSpeechSynthesisSupported()) {
    return;
  }

  window.speechSynthesis.cancel();
}

export function stripMarkdownForSpeech(value) {
  const text = typeof value === "string" ? value : "";

  return text
    .replace(/```[\s\S]*?```/g, " 代码片段 ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^>\s*/gm, "")
    .replace(/[#*_~]/g, " ")
    .replace(/\n{2,}/g, "。")
    .replace(/\n/g, "，")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSpeechText(value) {
  return stripMarkdownForSpeech(value)
    .replace(/\.\.\.+/g, "……")
    .replace(/([。！？!?]){2,}/g, "$1")
    .replace(/([，、；：,:]){2,}/g, "$1")
    .replace(/\s*([，。！？；：、])/g, "$1")
    .replace(/([，。！？；：、])(?=[^\s])/g, "$1 ")
    .trim();
}

export function getAvailableVoices() {
  if (!isSpeechSynthesisSupported()) {
    return [];
  }

  return window.speechSynthesis.getVoices();
}

export function getCompanionVoicePreset(companionType) {
  return COMPANION_VOICE_PRESETS[normalizeCompanionType(companionType)];
}

export function buildCompanionVoiceSettings(companionType, overrides = {}) {
  const preset = getCompanionVoicePreset(companionType);
  return {
    rate: Number(overrides?.rate ?? preset.rate),
    pitch: Number(overrides?.pitch ?? preset.pitch),
    volume: Number(overrides?.volume ?? preset.volume),
    genderHint: overrides?.genderHint || preset.genderHint,
    preferredVoiceName: overrides?.preferredVoiceName || "",
    pauseProfile: getPauseProfile(companionType, overrides),
  };
}

function scoreVoice(voice, options = {}) {
  const lang = String(voice?.lang || "").toLowerCase();
  const name = String(voice?.name || "").toLowerCase();
  const genderHint = options.genderHint || "";
  let score = 0;

  if (lang.startsWith("zh-cn")) {
    score += 5;
  } else if (lang.startsWith("zh")) {
    score += 4;
  }

  if (voice?.default) {
    score += 2;
  }

  if (genderHint === "female" && FEMALE_VOICE_PATTERNS.test(name)) {
    score += 4;
  }

  if (genderHint === "male" && MALE_VOICE_PATTERNS.test(name)) {
    score += 4;
  }

  if (!genderHint && (FEMALE_VOICE_PATTERNS.test(name) || MALE_VOICE_PATTERNS.test(name))) {
    score += 1;
  }

  return score;
}

export function getPreferredVoice(voices = [], options = {}) {
  return (
    [...voices].sort((left, right) => scoreVoice(right, options) - scoreVoice(left, options))[0] ||
    null
  );
}

function hasIdealVoice(voice, options = {}) {
  const name = String(voice?.name || "");
  if (options.genderHint === "female") {
    return FEMALE_VOICE_PATTERNS.test(name);
  }
  if (options.genderHint === "male") {
    return MALE_VOICE_PATTERNS.test(name);
  }
  return false;
}

export function resolveBrowserSpeechVoice(options = {}) {
  const voices = Array.isArray(options.voices) ? options.voices : getAvailableVoices();
  const preferredVoiceName = String(options.preferredVoiceName || "").trim();
  const chineseVoices = voices.filter((voice) => String(voice?.lang || "").toLowerCase().startsWith("zh"));
  const exactVoice = preferredVoiceName
    ? voices.find((voice) => voice.name === preferredVoiceName)
    : null;
  const rankedVoice = exactVoice || getPreferredVoice(chineseVoices.length ? chineseVoices : voices, options);
  const idealVoiceFound = Boolean(rankedVoice && hasIdealVoice(rankedVoice, options));
  const usedFallbackVoice = Boolean(rankedVoice) && !idealVoiceFound;

  return {
    voice: rankedVoice || null,
    hasChineseVoice: Boolean(chineseVoices.length),
    idealVoiceFound,
    usedFallbackVoice,
    warning: usedFallbackVoice ? "当前设备未找到理想中文音色，已使用默认语音" : "",
  };
}

export function primeSpeechSynthesis(options = {}) {
  if (!isSpeechSynthesisSupported()) {
    return false;
  }

  try {
    const utterance = new window.SpeechSynthesisUtterance(options.text || " ");
    utterance.volume = 0;
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.lang = options.lang || "zh-CN";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    window.speechSynthesis.cancel();
    return true;
  } catch (error) {
    console.warn("预热 SpeechSynthesis 失败:", error);
    return false;
  }
}

function resolveLeadPhrase(text, pauseProfile) {
  if (!Array.isArray(pauseProfile.starterPhrases) || !pauseProfile.starterPhrases.length) {
    return null;
  }

  const sortedPhrases = [...pauseProfile.starterPhrases].sort((left, right) => right.length - left.length);
  const matchedPhrase = sortedPhrases.find((phrase) => text.startsWith(phrase));
  if (!matchedPhrase) {
    return null;
  }

  const remainder = text.slice(matchedPhrase.length).trim();
  if (!remainder || remainder.length < 4) {
    return null;
  }

  return {
    lead: `${matchedPhrase}${/[，。！？；：、]$/.test(matchedPhrase) ? "" : "，"}`,
    remainder,
  };
}

function splitLongSegment(text, limit) {
  const segments = [];
  let remaining = text.trim();

  while (remaining.length > limit) {
    const chunk = remaining.slice(0, limit + 1);
    const splitIndex = Math.max(
      chunk.lastIndexOf("，"),
      chunk.lastIndexOf("、"),
      chunk.lastIndexOf(" "),
    );

    if (splitIndex < Math.floor(limit / 2)) {
      segments.push(remaining.slice(0, limit));
      remaining = remaining.slice(limit).trim();
      continue;
    }

    segments.push(remaining.slice(0, splitIndex + 1).trim());
    remaining = remaining.slice(splitIndex + 1).trim();
  }

  if (remaining) {
    segments.push(remaining);
  }

  return segments.filter(Boolean);
}

function getSegmentPause(text, pauseProfile) {
  const trimmed = text.trim();

  if (/[。！？!?…]$/.test(trimmed)) {
    return pauseProfile.sentencePauseMs;
  }

  if (/[；;：:]$/.test(trimmed)) {
    return Math.round((pauseProfile.clausePauseMs + pauseProfile.sentencePauseMs) / 2);
  }

  if (/[，,、]$/.test(trimmed)) {
    return pauseProfile.clausePauseMs;
  }

  return pauseProfile.tailPauseMs;
}

export function buildSpeechSegments(text, options = {}) {
  const companionType = normalizeCompanionType(options.companionType);
  const pauseProfile = getPauseProfile(companionType, options);
  const normalized = normalizeSpeechText(text);

  if (!normalized) {
    return [];
  }

  const sentenceLikeSegments = normalized.match(/[^。！？!?；;…]+[。！？!?；;…]*/g) || [normalized];
  const plannedSegments = [];

  sentenceLikeSegments.forEach((sentenceLike) => {
    const clauses = sentenceLike.match(/[^，,、：:]+[，,、：:]*/g) || [sentenceLike];

    clauses.forEach((clause) => {
      const trimmedClause = clause.trim();
      if (!trimmedClause) {
        return;
      }

      const leadParts = resolveLeadPhrase(trimmedClause, pauseProfile);
      const pieces = leadParts
        ? [leadParts.lead, ...splitLongSegment(leadParts.remainder, pauseProfile.segmentLimit)]
        : splitLongSegment(trimmedClause, pauseProfile.segmentLimit);

      pieces.forEach((piece, index) => {
        const trimmedPiece = piece.trim();
        if (!trimmedPiece) {
          return;
        }

        plannedSegments.push({
          text: trimmedPiece,
          pauseMs:
            getSegmentPause(trimmedPiece, pauseProfile) +
            (index === 0 && plannedSegments.length === 0 ? pauseProfile.leadInPauseMs : 0),
        });
      });
    });
  });

  return plannedSegments;
}

function buildSpeechEvent(session, index, boundaryEvent = null) {
  const segment = session.segments[index];
  return {
    companionType: session.companionType,
    segmentIndex: index,
    segmentCount: session.segments.length,
    segmentText: segment?.text || "",
    segmentPauseMs: segment?.pauseMs || 0,
    charIndex: Number(boundaryEvent?.charIndex || 0),
    elapsedMs: Number(boundaryEvent?.elapsedTime || 0),
  };
}

function queueNextSpeechSegment(session, nextIndex) {
  if (session.cancelled || activeSpeechSession !== session) {
    return;
  }

  if (nextIndex >= session.utterances.length) {
    activeSpeechSession = null;
    session.options.onEnd?.(buildSpeechEvent(session, session.utterances.length - 1));
    return;
  }

  const pauseMs = session.segments[Math.max(0, nextIndex - 1)]?.pauseMs || 0;
  session.timerId = window.setTimeout(() => {
    if (session.cancelled || activeSpeechSession !== session) {
      return;
    }

    try {
      window.speechSynthesis.speak(session.utterances[nextIndex]);
    } catch (error) {
      console.error("SpeechSynthesis 分段播放失败:", error);
      activeSpeechSession = null;
      session.options.onError?.({
        error: "playback_failed",
        cause: error,
      });
    }
  }, pauseMs);
}

function createSpeechUtterance(session, segment, index, voiceSettings, resolvedVoice, options) {
  const utterance = new window.SpeechSynthesisUtterance(segment.text);

  utterance.lang = options.lang || resolvedVoice.voice?.lang || "zh-CN";
  utterance.pitch = clampNumber(voiceSettings.pitch, 0, 2, 1);
  utterance.rate = clampNumber(voiceSettings.rate, 0.1, 10, 1);
  utterance.volume = clampNumber(voiceSettings.volume, 0, 1, 1);

  if (resolvedVoice.voice) {
    utterance.voice = resolvedVoice.voice;
  }

  utterance.onstart = () => {
    if (session.cancelled || activeSpeechSession !== session) {
      return;
    }

    if (index === 0) {
      session.options.onStart?.(buildSpeechEvent(session, index));
    }

    session.options.onSegmentStart?.(buildSpeechEvent(session, index));
  };

  utterance.onboundary = (event) => {
    if (session.cancelled || activeSpeechSession !== session) {
      return;
    }

    const speechEvent = buildSpeechEvent(session, index, event);
    session.options.onBoundary?.(speechEvent);
  };

  utterance.onerror = (event) => {
    if (session.cancelled || activeSpeechSession !== session) {
      return;
    }

    activeSpeechSession = null;
    session.options.onError?.(event);
  };

  utterance.onend = () => {
    if (session.cancelled || activeSpeechSession !== session) {
      return;
    }

    session.options.onSegmentEnd?.(buildSpeechEvent(session, index));
    queueNextSpeechSegment(session, index + 1);
  };

  return utterance;
}

export function speakText(text, options = {}) {
  const provider = options.provider || TTS_PROVIDERS.browser;
  if (!isBrowserTtsProvider(provider)) {
    return {
      started: false,
      error: "provider_not_ready",
      warning: "当前 TTS 引擎尚未接入，已保留扩展接口。",
    };
  }

  if (!isSpeechSynthesisSupported()) {
    return {
      started: false,
      error: "unsupported",
      warning: "",
    };
  }

  const companionType = normalizeCompanionType(options.companionType);
  const voiceSettings = buildCompanionVoiceSettings(companionType, options);
  const segments = buildSpeechSegments(text, {
    companionType,
    pauseProfile: voiceSettings.pauseProfile,
  });

  if (!segments.length) {
    return {
      started: false,
      error: "empty_text",
      warning: "",
    };
  }

  const resolvedVoice = resolveBrowserSpeechVoice({
    voices: getAvailableVoices(),
    genderHint: voiceSettings.genderHint,
    preferredVoiceName: voiceSettings.preferredVoiceName,
  });

  stopSpeechPlayback();

  const session = {
    cancelled: false,
    timerId: 0,
    companionType,
    options,
    segments,
    utterances: [],
  };

  session.utterances = segments.map((segment, index) =>
    createSpeechUtterance(session, segment, index, voiceSettings, resolvedVoice, options),
  );
  activeSpeechSession = session;

  try {
    window.speechSynthesis.speak(session.utterances[0]);
    return {
      started: true,
      error: "",
      warning: resolvedVoice.warning,
      usedFallbackVoice: resolvedVoice.usedFallbackVoice,
      voiceName: resolvedVoice.voice?.name || "",
      segments,
      pauseProfileLabel: voiceSettings.pauseProfile.label,
    };
  } catch (error) {
    console.error("SpeechSynthesis 播放失败:", error);
    activeSpeechSession = null;
    return {
      started: false,
      error: "playback_failed",
      warning: resolvedVoice.warning,
    };
  }
}
