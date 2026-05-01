import { readStorageValue, removeStorageValue, writeStorageValue } from "@/lib/browser/safe-storage";
import { buildCompanionVoiceSettings } from "@/lib/browser/speech";
import { normalizeCompanionType } from "@/lib/chat/roles";
import { TTS_PROVIDERS } from "@/lib/tts/providers";

const STORAGE_KEY = "chaohuaxishi-virtual-companion-prefs";

function createDefaultCompanionVoices() {
  return {
    girlfriend: buildCompanionVoiceSettings("girlfriend"),
    boyfriend: buildCompanionVoiceSettings("boyfriend"),
  };
}

export const DEFAULT_VIRTUAL_COMPANION_PREFS = {
  voiceEnabled: true,
  voiceProvider: TTS_PROVIDERS.browser,
  speechUnlocked: false,
  companionVoices: createDefaultCompanionVoices(),
};

export function mergeVirtualCompanionPrefs(preferences = {}) {
  const defaultVoices = createDefaultCompanionVoices();
  const nextCompanionVoices = preferences?.companionVoices || {};

  return {
    voiceEnabled: preferences?.voiceEnabled !== false,
    voiceProvider:
      typeof preferences?.voiceProvider === "string" && preferences.voiceProvider.trim()
        ? preferences.voiceProvider
        : TTS_PROVIDERS.browser,
    speechUnlocked: preferences?.speechUnlocked === true,
    companionVoices: {
      ...defaultVoices,
      girlfriend: buildCompanionVoiceSettings("girlfriend", nextCompanionVoices.girlfriend),
      boyfriend: buildCompanionVoiceSettings("boyfriend", nextCompanionVoices.boyfriend),
    },
  };
}

export function getCompanionVoiceSettings(preferences, companionType) {
  const resolvedType = normalizeCompanionType(companionType);
  const merged = mergeVirtualCompanionPrefs(preferences);
  return merged.companionVoices[resolvedType];
}

export function patchCompanionVoiceSettings(preferences, companionType, patch = {}) {
  const resolvedType = normalizeCompanionType(companionType);
  const merged = mergeVirtualCompanionPrefs(preferences);
  return {
    ...merged,
    companionVoices: {
      ...merged.companionVoices,
      [resolvedType]: buildCompanionVoiceSettings(resolvedType, {
        ...merged.companionVoices[resolvedType],
        ...patch,
      }),
    },
  };
}

export function loadVirtualCompanionPrefs() {
  if (typeof window === "undefined") {
    return DEFAULT_VIRTUAL_COMPANION_PREFS;
  }

  try {
    const rawValue = readStorageValue(STORAGE_KEY);
    if (!rawValue) {
      return DEFAULT_VIRTUAL_COMPANION_PREFS;
    }

    const parsed = JSON.parse(rawValue);
    return mergeVirtualCompanionPrefs(parsed);
  } catch (error) {
    console.error("读取虚拟角色偏好失败:", error);
    removeStorageValue(STORAGE_KEY);
    return DEFAULT_VIRTUAL_COMPANION_PREFS;
  }
}

export function saveVirtualCompanionPrefs(preferences) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    writeStorageValue(
      STORAGE_KEY,
      JSON.stringify(mergeVirtualCompanionPrefs(preferences)),
    );
  } catch (error) {
    console.error("保存虚拟角色偏好失败:", error);
  }
}
