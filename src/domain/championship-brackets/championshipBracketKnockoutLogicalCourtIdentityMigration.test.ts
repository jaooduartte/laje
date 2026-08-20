import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260820192014_fix_knockout_logical_court_identity.sql",
  ),
  "utf8",
);

describe("knockout logical court identity migration", () => {
  it("compara prioridades manuais pela identidade de local e quadra", () => {
    expect(migration).toContain(
      "is_bracket_knockout_priority_court_match",
    );
    expect(migration).toContain(
      "public.normalize_bracket_entity_name(priority_location_name)",
    );
    expect(migration).toContain(
      "public.normalize_bracket_entity_name(candidate_court_name)",
    );
  });

  it("deduplica o fallback automático por identidade lógica", () => {
    expect(migration).toContain(
      "SELECT DISTINCT ON (logical_location_name, logical_court_name)",
    );
    expect(migration).toContain(
      "AND EXISTS (SELECT 1 FROM ordered_courts WHERE overall_order = 2)",
    );
  });

  it("substitui comparações literais no redistribuidor", () => {
    expect(migration).toContain(
      "public.is_bracket_knockout_priority_court_match(",
    );
    expect(migration).toContain("one_line_pattern TEXT :=");
    expect(migration).toContain("split_pattern TEXT :=");
    expect(migration).toContain("one_line_count + split_count = 0");
    expect(migration).not.toContain("original_pattern TEXT :=");
    expect(migration).toContain(
      "Nenhuma comparação de prioridade do mata-mata foi localizada no redistribuidor.",
    );
    expect(migration).toContain("EXECUTE function_definition");
  });
});
