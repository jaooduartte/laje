import { z } from "zod";

export const BACKEND_PROVIDER = {
  SUPABASE: "supabase",
  AWS: "aws",
} as const;

export type BackendProvider = (typeof BACKEND_PROVIDER)[keyof typeof BACKEND_PROVIDER];

const optionalUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().url().optional(),
);

const optionalStringSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const publicEnvironmentSchema = z.object({
  VITE_BACKEND_PROVIDER: z.enum([BACKEND_PROVIDER.SUPABASE, BACKEND_PROVIDER.AWS]).optional(),
  VITE_API_URL: optionalUrlSchema,
  VITE_SUPABASE_URL: optionalUrlSchema,
  VITE_SUPABASE_PUBLISHABLE_KEY: optionalStringSchema,
});

const parsedEnvironment = publicEnvironmentSchema.safeParse({
  VITE_BACKEND_PROVIDER: import.meta.env.VITE_BACKEND_PROVIDER,
  VITE_API_URL: import.meta.env.VITE_API_URL,
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

if (!parsedEnvironment.success) {
  const details = parsedEnvironment.error.issues
    .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("; ");

  throw new Error(`Configuração de ambiente inválida no frontend: ${details}`);
}

const resolvedBackendProvider: BackendProvider =
  parsedEnvironment.data.VITE_BACKEND_PROVIDER ??
  (parsedEnvironment.data.VITE_API_URL ? BACKEND_PROVIDER.AWS : BACKEND_PROVIDER.SUPABASE);

if (resolvedBackendProvider === BACKEND_PROVIDER.AWS && !parsedEnvironment.data.VITE_API_URL) {
  throw new Error(
    "Configuração AWS inválida. VITE_API_URL é obrigatória quando VITE_BACKEND_PROVIDER=aws.",
  );
}

export const frontendEnvironment = Object.freeze({
  backendProvider: resolvedBackendProvider,
  apiUrl: parsedEnvironment.data.VITE_API_URL,
  supabaseUrl: parsedEnvironment.data.VITE_SUPABASE_URL,
  supabasePublishableKey: parsedEnvironment.data.VITE_SUPABASE_PUBLISHABLE_KEY,
});

export function isAwsBackendEnabled(): boolean {
  return frontendEnvironment.backendProvider === BACKEND_PROVIDER.AWS;
}

export function isSupabaseBackendEnabled(): boolean {
  return frontendEnvironment.backendProvider === BACKEND_PROVIDER.SUPABASE;
}

export function requireSupabaseEnvironment(): {
  supabaseUrl: string;
  supabasePublishableKey: string;
} {
  if (!isSupabaseBackendEnabled()) {
    throw new Error(
      "Supabase está desabilitado neste deployment porque VITE_BACKEND_PROVIDER=aws.",
    );
  }

  const { supabaseUrl, supabasePublishableKey } = frontendEnvironment;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Configuração do Supabase ausente. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return { supabaseUrl, supabasePublishableKey };
}
