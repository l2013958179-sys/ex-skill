import { createClient } from "@supabase/supabase-js";

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
  console.warn(`${label} ${formatSupabaseErrorMessage(error)}`);
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

  browserClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return browserClient;
}
