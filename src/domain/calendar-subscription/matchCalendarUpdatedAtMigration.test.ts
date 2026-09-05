import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260905204926_add_match_calendar_updated_at.sql",
  ),
  "utf8",
);

describe("match calendar updated-at migration", () => {
  it("preenche registros existentes pelo default sem atualizar a escala", () => {
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()",
    );
    expect(migration).not.toContain("UPDATE public.matches");
  });

  it("mantém o carimbo atualizado nas alterações posteriores", () => {
    expect(migration).toContain("set_updated_at_timestamp_on_matches");
    expect(migration).toContain("BEFORE UPDATE ON public.matches");
    expect(migration).toContain("EXECUTE FUNCTION public.set_updated_at_timestamp()");
  });
});
