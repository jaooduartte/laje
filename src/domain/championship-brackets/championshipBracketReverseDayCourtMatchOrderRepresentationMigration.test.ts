import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260816130000_fix_reverse_day_court_match_order_representation.sql"),
  "utf8",
);

describe("reverse day court match order representation migration", () => {
  it("mantém CO no primeiro jogo de cada quadra e recalcula os demais automaticamente", () => {
    expect(migration).toContain("WHEN ordered_matches.court_position = 1 THEN 'CO'");
    expect(migration).toContain("ELSE 'AUTO'");
    expect(migration).toContain("$new_representation_normalization$");
  });

  it("retorna bloqueios da prévia sem transformar a validação em erro HTTP", () => {
    expect(migration).toContain("IF SQLERRM <> 'ROLLBACK_CHAMPIONSHIP_BRACKET_RECONFIGURATION_PREVIEW' THEN");
    expect(migration).toContain("'blockers', jsonb_build_array(SQLERRM)");
  });

  it("mostra a alteração de representação na prévia", () => {
    expect(migration).toContain("'manual_representation_mode', matches_table.manual_representation_mode");
    expect(migration).toContain("THEN 'representação' END");
  });
});
