import { normalizeMemoryItems } from "@/lib/memory/profile";
import { readStorageValue, removeStorageValue, writeStorageValue } from "@/lib/browser/safe-storage";

const MEMORY_STORAGE_KEY = "chaohuaxishi-user-memories";

export function loadLocalMemoryItems() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawState = readStorageValue(MEMORY_STORAGE_KEY);
    if (!rawState) {
      return [];
    }

    return normalizeMemoryItems(JSON.parse(rawState));
  } catch (error) {
    console.error("读取本地记忆失败:", error);
    removeStorageValue(MEMORY_STORAGE_KEY);
    return [];
  }
}

export function saveLocalMemoryItems(items) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    writeStorageValue(MEMORY_STORAGE_KEY, JSON.stringify(normalizeMemoryItems(items)));
  } catch (error) {
    console.error("保存本地记忆失败:", error);
  }
}

export function clearLocalMemoryItems() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    removeStorageValue(MEMORY_STORAGE_KEY);
  } catch (error) {
    console.error("清空本地记忆失败:", error);
  }
}
