import { describe, expect, it } from "vitest";
import { resolvePublicEnvironment } from "./environment";

describe("resolvePublicEnvironment", () => {
  it("normalizes required Supabase configuration and optional API URL", () => {
    const resolved = resolvePublicEnvironment({
      VITE_API_URL: " https://api.example.com/api/v1/ ",
      VITE_SUPABASE_URL: " https://example.supabase.co/ ",
      VITE_SUPABASE_PUBLISHABLE_KEY: " public-key ",
    });

    expect(resolved).toEqual({
      api: {
        baseUrl: "https://api.example.com/api/v1",
      },
      supabase: {
        url: "https://example.supabase.co",
        publishableKey: "public-key",
      },
    });
  });

  it("allows VITE_API_URL to remain unset during the migration", () => {
    const resolved = resolvePublicEnvironment({
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "public-key",
    });

    expect(resolved.api.baseUrl).toBeNull();
  });

  it("rejects missing required Supabase configuration", () => {
    expect(() =>
      resolvePublicEnvironment({
        VITE_SUPABASE_URL: "",
        VITE_SUPABASE_PUBLISHABLE_KEY: "public-key",
      }),
    ).toThrow("VITE_SUPABASE_URL");

    expect(() =>
      resolvePublicEnvironment({
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "",
      }),
    ).toThrow("VITE_SUPABASE_PUBLISHABLE_KEY");
  });

  it("rejects invalid URLs", () => {
    expect(() =>
      resolvePublicEnvironment({
        VITE_API_URL: "not-a-url",
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "public-key",
      }),
    ).toThrow("VITE_API_URL");
  });
});
