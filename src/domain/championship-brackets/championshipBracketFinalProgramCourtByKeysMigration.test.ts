import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260820193909_resolve_final_program_court_by_keys.sql",
  ),
  "utf8",
);

describe("final program court by keys migration", () => {
  it("prioriza as chaves materializadas antes dos nomes", () => {
    expect(migration).toContain("program_block_record\n                  ->> 'location_key'");
    expect(migration).toContain("program_block_record\n                  ->> 'court_key'");
    expect(migration).toContain("locations_table\n            .location_group_id::text");
    expect(migration).toContain("courts_table\n            .court_group_id::text");
  });

  it("mantém o fallback por nome e escolhe a correspondência por chave", () => {
    expect(migration).toContain("public.normalize_bracket_entity_name(");
    expect(migration).toContain("ORDER BY\n      CASE");
    expect(migration).toContain("THEN 0");
  });

  it("altera somente a função de programação de finais", () => {
    expect(migration).toContain(
      "get_championship_knockout_final_program_schedule(uuid)",
    );
    expect(migration).toContain("EXECUTE function_definition");
    expect(migration).not.toContain("redistribute_bracket_scheduled_matches");
  });
});
