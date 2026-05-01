import { createClient } from "@supabase/supabase-js";

function normalizeSupabaseUrl(url: string | undefined) {
  if (typeof url !== "string") {
    return "";
  }

  return url.replace(/\/rest\/v1\/?$/i, "");
}

function createRequestError(message: string, code: string, status: number) {
  const error = new Error(message) as Error & {
    code?: string;
    status?: number;
  };

  error.code = code;
  error.status = status;
  return error;
}

export function hasServerSupabaseConfig() {
  return Boolean(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const matched = authorization.match(/^Bearer\s+(.+)$/i);
  return matched?.[1]?.trim() || "";
}

export function getServerSupabaseClient(accessToken = "") {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw createRequestError("Supabase 未配置", "missing_supabase_config", 500);
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}

export async function getOptionalAuthenticatedServerUser(request: Request) {
  if (!hasServerSupabaseConfig()) {
    return {
      supabase: null,
      user: null,
      accessToken: "",
    };
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return {
      supabase: null,
      user: null,
      accessToken: "",
    };
  }

  try {
    const supabase = getServerSupabaseClient(accessToken);
    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data.user) {
      return {
        supabase: null,
        user: null,
        accessToken,
      };
    }

    return {
      supabase,
      user: data.user,
      accessToken,
    };
  } catch {
    return {
      supabase: null,
      user: null,
      accessToken,
    };
  }
}

export async function requireAuthenticatedServerUser(request: Request) {
  if (!hasServerSupabaseConfig()) {
    throw createRequestError("Supabase 未配置", "missing_supabase_config", 500);
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    throw createRequestError("请先登录", "unauthorized", 401);
  }

  const supabase = getServerSupabaseClient(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    throw createRequestError("登录状态已失效，请重新登录。", "unauthorized", 401);
  }

  return {
    supabase,
    user: data.user,
    accessToken,
  };
}
