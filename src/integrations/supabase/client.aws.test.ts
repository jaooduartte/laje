import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseJsMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: supabaseJsMocks.createClient,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

beforeEach(() => {
  supabaseJsMocks.createClient.mockReset();
});

describe("Supabase client per deployment", () => {
  it("does not initialize @supabase/supabase-js in AWS mode", async () => {
    vi.stubEnv("VITE_BACKEND_PROVIDER", "aws");
    vi.stubEnv("VITE_API_URL", "https://example.execute-api.sa-east-1.amazonaws.com/api/v1");
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");

    const { supabase } = await import("./client");

    expect(supabaseJsMocks.createClient).not.toHaveBeenCalled();
    expect(() => (supabase as unknown as { from: unknown }).from).toThrow(
      "Supabase está desabilitado neste deployment AWS",
    );
  });

  it("initializes the real client in Supabase mode", async () => {
    const rawClient = {
      auth: {},
      rpc: vi.fn(),
    };
    supabaseJsMocks.createClient.mockReturnValue(rawClient);

    vi.stubEnv("VITE_BACKEND_PROVIDER", "supabase");
    vi.stubEnv("VITE_API_URL", "");
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable-key");

    const { supabase } = await import("./client");

    expect(supabaseJsMocks.createClient).toHaveBeenCalledTimes(1);
    expect(supabaseJsMocks.createClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "publishable-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: true,
          autoRefreshToken: true,
        }),
      }),
    );
    expect(supabase).toBe(rawClient);
  });
});
