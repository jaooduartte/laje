import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function loadTelemetry(provider: "aws" | "supabase") {
  vi.stubEnv("VITE_BACKEND_PROVIDER", provider);
  vi.stubEnv(
    "VITE_API_URL",
    provider === "aws" ? "https://api.example.test/api/v1" : "",
  );
  vi.resetModules();
  return import("./observability");
}

describe("LAJE-40 AWS-only browser error telemetry", () => {
  it("reports only whitelisted fields to the dedicated API", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ status: 204 });
    vi.stubGlobal("fetch", fakeFetch);
    const { reportBrowserFailure } = await loadTelemetry("aws");
    const id = "2ea65777-faa7-4802-a9d8-3b5ea9bb1a67";

    reportBrowserFailure("api-http", {
      status: 503,
      code: "BACKEND_UNAVAILABLE",
      requestId: id,
    });

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, options] = fakeFetch.mock.calls[0];
    expect(url).toBe("https://api.example.test/api/v1/observability/client-errors");
    expect(options.credentials).toBe("omit");
    expect(JSON.parse(options.body)).toEqual({
      kind: "api-http",
      status: 503,
      code: "BACKEND_UNAVAILABLE",
      requestId: id,
    });
    expect(options.headers).toEqual({ "content-type": "application/json" });
  });

  it("discards invalid correlation IDs, codes and expected client statuses", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ status: 204 });
    vi.stubGlobal("fetch", fakeFetch);
    const { reportBrowserFailure } = await loadTelemetry("aws");

    reportBrowserFailure("javascript", {
      status: 401,
      code: "private e-mail: example@example.com",
      requestId: "not-a-valid-uuid",
    });

    expect(JSON.parse(fakeFetch.mock.calls[0][1].body)).toEqual({
      kind: "javascript",
    });
  });

  it("never sends telemetry from the permanent Supabase deployment", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ status: 204 });
    vi.stubGlobal("fetch", fakeFetch);
    const { reportBrowserFailure, installAwsErrorMonitoring } =
      await loadTelemetry("supabase");
    reportBrowserFailure("javascript");
    installAwsErrorMonitoring();

    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("listens to unhandled browser errors only in AWS mode", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ status: 204 });
    vi.stubGlobal("fetch", fakeFetch);
    const { installAwsErrorMonitoring } = await loadTelemetry("aws");

    const uninstall = installAwsErrorMonitoring();
    window.dispatchEvent(new Event("error"));
    window.dispatchEvent(new Event("unhandledrejection"));
    expect(fakeFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fakeFetch.mock.calls[0][1].body)).toEqual({
      kind: "javascript",
    });
    expect(JSON.parse(fakeFetch.mock.calls[1][1].body)).toEqual({
      kind: "promise",
    });

    uninstall();
    window.dispatchEvent(new Event("error"));
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });
});
