let installed = false;

function pushDebugEvent(entry) {
  if (typeof window === "undefined") {
    return;
  }

  const debugState = window.__CHAOHUAXISHI_DEBUG__ || {
    errors: [],
    startedAt: new Date().toISOString(),
  };

  debugState.errors = [...debugState.errors, entry].slice(-30);
  window.__CHAOHUAXISHI_DEBUG__ = debugState;
}

function normalizeError(error) {
  if (!error) {
    return "未知错误";
  }

  if (typeof error === "string") {
    return error;
  }

  return error.stack || error.message || String(error);
}

export function installClientErrorDiagnostics() {
  if (installed || typeof window === "undefined") {
    return;
  }

  installed = true;

  window.addEventListener("error", (event) => {
    pushDebugEvent({
      type: "error",
      message: event.message || normalizeError(event.error),
      source: event.filename || "",
      line: event.lineno || 0,
      column: event.colno || 0,
      time: new Date().toISOString(),
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    pushDebugEvent({
      type: "unhandledrejection",
      message: normalizeError(event.reason),
      time: new Date().toISOString(),
    });
  });

  const originalConsoleError = console.error;
  console.error = (...args) => {
    pushDebugEvent({
      type: "console.error",
      message: args.map(normalizeError).join(" "),
      time: new Date().toISOString(),
    });
    originalConsoleError(...args);
  };
}
