import { createClient } from "@supabase/supabase-js";
import { readStorageValue, removeStorageValue, writeStorageValue } from "@/lib/browser/safe-storage";

let browserClient = null;

function normalizeSupabaseUrl(url) {
  if (typeof url !== "string") {
    return "";
  }

  return url.replace(/\/rest\/v1\/?$/i, "");
}

export function formatSupabaseError(error) {
  if (!error) {
    return {
      message: "未知错误",
      code: "",
      details: "",
      hint: "",
    };
  }

  return {
    message: error.message || "未知错误",
    code: error.code || "",
    details: error.details || "",
    hint: error.hint || "",
  };
}

export function formatSupabaseErrorMessage(error) {
  const normalized = formatSupabaseError(error);
  return `message=${normalized.message}; code=${normalized.code || "-"}; details=${
    normalized.details || "-"
  }; hint=${normalized.hint || "-"}`;
}

export function logSupabaseError(label, error) {
  if (isSupabaseSchemaMissingError(error)) {
    return;
  }

  console.warn(`${label} ${formatSupabaseErrorMessage(error)}`);
}

export function isSupabaseSchemaMissingError(error) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = typeof error.code === "string" ? error.code.toUpperCase() : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";

  if (code === "42P01" || code === "42703" || code === "PGRST204" || code === "PGRST205") {
    return true;
  }

  return (
    message.includes("schema cache") &&
    (message.includes("could not find the table") || message.includes("could not find the"))
  );
}

export function getSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  try {
    browserClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: {
          getItem: (key) => readStorageValue(key),
          setItem: (key, value) => {
            writeStorageValue(key, value);
          },
          removeItem: (key) => {
            removeStorageValue(key);
          },
        },
      },
    });
  } catch (error) {
    console.error("初始化 Supabase 客户端失败:", error);
    browserClient = null;
  }

  return browserClient;
}
