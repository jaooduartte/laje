import { z } from "zod";

const optionalUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().url().optional(),
);

const optionalStringSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const publicEnvironmentSchema = z.object({
  VITE_API_URL: optionalUrlSchema,
  VITE_SUPABASE_URL: optionalUrlSchema,
  VITE_SUPABASE_PUBLISHABLE_KEY: optionalStringSchema,
});

const parsedEnvironment = publicEnvironmentSchema.safeParse({
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

export const frontendEnvironment = Object.freeze({
  apiUrl: parsedEnvironment.data.VITE_API_URL,
  supabaseUrl: parsedEnvironment.data.VITE_SUPABASE_URL,
  supabasePublishableKey: parsedEnvironment.data.VITE_SUPABASE_PUBLISHABLE_KEY,
});

const requiredSupabaseEnvironmentSchema = z.object({
  supabaseUrl: z.string().url(),
  supabasePublishableKey: z.string().min(1),
});

export function requireSupabaseEnvironment(): {
  supabaseUrl: string;
  supabasePublishableKey: string;
} {
  const result = requiredSupabaseEnvironmentSchema.safeParse(frontendEnvironment);

  if (!result.success) {
    const missingFields = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean)
      .join(", ");

    throw new Error(
      `Configuração do Supabase ausente ou inválida. Verifique: ${missingFields || "VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY"}.`,
    );
  }

  return result.data;
}
