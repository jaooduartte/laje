export interface PublicEnvironmentSource {
  VITE_API_URL?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

function normalizeRequiredValue(name: string, value: string | undefined): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`[environment] Missing required environment variable: ${name}`);
  }

  return normalized;
}

function normalizeUrl(name: string, value: string): string {
  try {
    new URL(value);
  } catch {
    throw new Error(`[environment] ${name} must be a valid absolute URL.`);
  }

  return value.replace(/\/+$/, "");
}

function normalizeOptionalUrl(name: string, value: string | undefined): string | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  return normalizeUrl(name, normalized);
}

export function resolvePublicEnvironment(source: PublicEnvironmentSource) {
  const supabaseUrl = normalizeUrl(
    "VITE_SUPABASE_URL",
    normalizeRequiredValue("VITE_SUPABASE_URL", source.VITE_SUPABASE_URL),
  );
  const supabasePublishableKey = normalizeRequiredValue(
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    source.VITE_SUPABASE_PUBLISHABLE_KEY,
  );

  return {
    api: {
      baseUrl: normalizeOptionalUrl("VITE_API_URL", source.VITE_API_URL),
    },
    supabase: {
      url: supabaseUrl,
      publishableKey: supabasePublishableKey,
    },
  } as const;
}

export const environment = resolvePublicEnvironment({
  VITE_API_URL: import.meta.env.VITE_API_URL,
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});
