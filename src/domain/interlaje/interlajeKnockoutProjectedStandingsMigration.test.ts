import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903194101_add_interlaje_knockout_projected_standings.sql",
  ),
  "utf8",
);

describe("Interlaje knockout projected standings migration", () => {
  it("define a projeção para chaves de quatro e oito equipes", () => {
    expect(migration).toContain("participant_count NOT IN (4, 8)");
    expect(migration).toContain("get_interlaje_knockout_projected_placements");
    expect(migration).toContain("WHEN champion_team_id THEN 5");
    expect(migration).toContain("WHEN runner_up_team_id THEN 6");
    expect(migration).toContain("WHEN third_place_team_id THEN 7");
  });

  it("prioriza resultados encerrados e usa a campanha somente para projetar partidas pendentes", () => {
    expect(migration).toMatch(/COALESCE\(\s*current_match\.winner_team_id/);
    expect(migration).toMatch(/COALESCE\(\s*real_winner_team_id/);
    expect(migration).toContain("ranked_positions ->> home_team_id::TEXT");
    expect(migration).toContain("THEN 'CONFIRMED' ELSE 'PROJECTED'");
  });

  it("não usa a disputa de terceiro lugar e mantém desclassificação e ausência de jogos sem pontos", () => {
    expect(migration).toContain("bracket_matches_table.is_third_place = false");
    expect(migration).toContain("resolved_standings.is_disqualified");
    expect(migration).toContain("NOT resolved_standings.has_completed_result THEN 0");
  });

  it("expõe totais confirmados e projetados na classificação geral", () => {
    expect(migration).toContain("confirmed_placement_points NUMERIC");
    expect(migration).toContain("projected_placement_points NUMERIC");
    expect(migration).toContain("has_projected_placement_points BOOLEAN");
    expect(migration).toContain("placement_status = 'PROJECTED'");
  });
});
