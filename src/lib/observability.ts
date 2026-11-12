import { frontendEnvironment, isAwsBackendEnabled } from "@/config/environment";

export type BrowserFailureKind =
  | "javascript"
  | "promise"
  | "react-render"
  | "api-network"
  | "api-http";

interface BrowserFailureOptions {
  status?: number;
  code?: string;
  requestId?: string | null;
}

const codePattern = /^[A-Z][A-Z0-9_]{0,63}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * LAJE-40: best-effort browser telemetry for the AWS TCC deployment only.
 * No message, stack trace, route, URL, token, cookie or user data is collected.
 */
export function reportBrowserFailure(kind: BrowserFailureKind, options: BrowserFailureOptions = {}) {
  if (!isAwsBackendEnabled()) return;
  const baseUrl = frontendEnvironment.apiUrl?.replace(/\/+$/, "");
  if (!baseUrl) return;

  const payload: Record<string, string | number> = { kind };
  if (options.status && Number.isInteger(options.status) && options.status >= 500 && options.status <= 599) {
    payload.status = options.status;
  }
  if (options.code && codePattern.test(options.code)) {
    payload.code = options.code;
  }
  if (options.requestId && uuidPattern.test(options.requestId)) {
    payload.requestId = options.requestId;
  }

  // Never block the UI or retry when the backend is intentionally suspended.
  try {
    void fetch(`${baseUrl}/observability/client-errors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "omit",
      keepalive: true,
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  } catch {
    // Telemetry is best-effort and must not fail a user operation.
  }
}

export function installAwsErrorMonitoring(): () => void {
  if (!isAwsBackendEnabled() || typeof window === "undefined") return () => undefined;

  const onError = () => reportBrowserFailure("javascript");
  const onUnhandledRejection = () => reportBrowserFailure("promise");
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
