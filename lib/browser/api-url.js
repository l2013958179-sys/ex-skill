const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_APP_API_BASE_URL || "";

function getCurrentLocation() {
  return typeof window !== "undefined" ? window.location : null;
}

function isLocalHost(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

export function getApiBaseUrlIssue() {
  if (!API_BASE_URL) {
    return "";
  }

  const location = getCurrentLocation();

  try {
    const url = new URL(API_BASE_URL, location?.origin || "http://localhost:3000");

    if (location?.protocol === "https:" && url.protocol === "http:") {
      return "接口地址使用了 http，iOS Safari 会拦截 HTTPS 页面里的非安全请求。";
    }

    if (location && !isLocalHost(location.hostname) && isLocalHost(url.hostname)) {
      return "接口地址被配置为 localhost/127.0.0.1，手机访问时会指向手机本机，无法连接线上服务。";
    }

    return "";
  } catch {
    return "接口地址格式不正确，请检查 NEXT_PUBLIC_API_BASE_URL。";
  }
}

export function buildApiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const issue = getApiBaseUrlIssue();

  if (!API_BASE_URL || issue) {
    if (issue) {
      console.warn(`${issue} 当前回退到同源 API: ${normalizedPath}`);
    }
    return normalizedPath;
  }

  return `${API_BASE_URL.replace(/\/+$/, "")}${normalizedPath}`;
}
