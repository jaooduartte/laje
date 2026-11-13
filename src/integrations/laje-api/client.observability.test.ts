import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function loadClient() {
  vi.stubEnv("VITE_BACKEND_PROVIDER", "aws");
  vi.stubEnv("VITE_API_URL", "https://api.example.test/api/v1");
  vi.resetModules();
  return import("./client");
}

describe("LAJE-40 API error correlation", () => {
  it("reports a server failure with the response correlation ID without leaking credentials", async () => {
    const requestId = "2ea65777-faa7-4802-a9d8-3b5ea9bb1a67";
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "SERVER_FAILURE", message: "Falha" } }), {
          status: 503,
          headers: { "content-type": "application/json", "x-request-id": requestId },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fakeFetch);
    const { lajeApiRequest } = await loadClient();

    await expect(lajeApiRequest("/matches")).rejects.toMatchObject({
      statusCode: 503,
      code: "SERVER_FAILURE",
    });

    expect(fakeFetch).toHaveBeenCalledTimes(2);
    const [, options] = fakeFetch.mock.calls[1];
    expect(JSON.parse(options.body)).toEqual({
      kind: "api-http",
      status: 503,
      code: "SERVER_FAILURE",
      requestId,
    });
    expect(options.credentials).toBe("omit");
    expect(options.headers).not.toHaveProperty("authorization");
  });

  it("records a connection failure without changing the rejection seen by callers", async () => {
    const cause = new TypeError("Failed to fetch");
    const fakeFetch = vi
      .fn()
      .mockRejectedValueOnce(cause)
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fakeFetch);
    const { lajeApiRequest } = await loadClient();

    await expect(lajeApiRequest("/health")).rejects.toBe(cause);

    expect(fakeFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fakeFetch.mock.calls[1][1].body)).toEqual({
      kind: "api-network",
    });
  });

  it("does not report expected 4xx errors or intentional cancellations", async () => {
    const aborted = Object.assign(new Error("cancelled"), { name: "AbortError" });
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "UNAUTHORIZED" } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockRejectedValueOnce(aborted);
    vi.stubGlobal("fetch", fakeFetch);
    const { lajeApiRequest } = await loadClient();

    await expect(lajeApiRequest("/private")).rejects.toMatchObject({
      statusCode: 401,
      code: "UNAUTHORIZED",
    });
    await expect(lajeApiRequest("/cancelled")).rejects.toBe(aborted);

    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });
});
