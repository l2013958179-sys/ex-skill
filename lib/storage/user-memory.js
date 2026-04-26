import { normalizeMemoryItems } from "@/lib/memory/profile";

const MEMORY_STORAGE_KEY = "chaohuaxishi-user-memories";

export function loadLocalMemoryItems() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawState = window.localStorage.getItem(MEMORY_STORAGE_KEY);
    if (!rawState) {
      return [];
    }

    return normalizeMemoryItems(JSON.parse(rawState));
  } catch (error) {
    console.error("读取本地记忆失败:", error);
    return [];
  }
}

export function saveLocalMemoryItems(items) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(normalizeMemoryItems(items)));
  } catch (error) {
    console.error("保存本地记忆失败:", error);
  }
}

export function clearLocalMemoryItems() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(MEMORY_STORAGE_KEY);
  } catch (error) {
    console.error("清空本地记忆失败:", error);
  }
}
