import { afterEach, describe, expect, it, vi } from "vitest";

async function loadEnvironment() {
  vi.resetModules();
  return import("./environment");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("frontend backend provider", () => {
  it("selects Supabase explicitly without requiring VITE_API_URL", async () => {
    vi.stubEnv("VITE_BACKEND_PROVIDER", "supabase");
    vi.stubEnv("VITE_API_URL", "");
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable-key");

    const environment = await loadEnvironment();

    expect(environment.frontendEnvironment.backendProvider).toBe("supabase");
    expect(environment.isSupabaseBackendEnabled()).toBe(true);
    expect(environment.isAwsBackendEnabled()).toBe(false);
    expect(environment.requireSupabaseEnvironment()).toEqual({
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "publishable-key",
    });
  });

  it("selects AWS with only VITE_API_URL and no Supabase variables", async () => {
    vi.stubEnv("VITE_BACKEND_PROVIDER", "aws");
    vi.stubEnv("VITE_API_URL", "https://example.execute-api.sa-east-1.amazonaws.com/api/v1");
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");

    const environment = await loadEnvironment();

    expect(environment.frontendEnvironment.backendProvider).toBe("aws");
    expect(environment.isAwsBackendEnabled()).toBe(true);
    expect(environment.isSupabaseBackendEnabled()).toBe(false);
    expect(() => environment.requireSupabaseEnvironment()).toThrow(
      "Supabase está desabilitado neste deployment",
    );
  });

  it("rejects AWS mode when VITE_API_URL is missing", async () => {
    vi.stubEnv("VITE_BACKEND_PROVIDER", "aws");
    vi.stubEnv("VITE_API_URL", "");
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");

    await expect(loadEnvironment()).rejects.toThrow(
      "VITE_API_URL é obrigatória quando VITE_BACKEND_PROVIDER=aws",
    );
  });

  it("keeps transitional compatibility for the current deployment", async () => {
    vi.stubEnv("VITE_BACKEND_PROVIDER", "");
    vi.stubEnv("VITE_API_URL", "");
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable-key");

    const environment = await loadEnvironment();

    expect(environment.frontendEnvironment.backendProvider).toBe("supabase");
  });
});
