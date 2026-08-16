import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260816133000_enrich_reverse_day_court_match_order_preview.sql"),
  "utf8",
);

describe("reverse day court match order preview details migration", () => {
  it("inclui a identificação completa da partida na prévia", () => {
    expect(migration).toContain("LEFT JOIN public.sports AS sports_table");
    expect(migration).toContain("LEFT JOIN public.teams AS home_teams_table");
    expect(migration).toContain("LEFT JOIN public.teams AS away_teams_table");
    expect(migration).toContain("'sport_name', sports_table.name");
    expect(migration).toContain("'naipe', matches_table.naipe");
    expect(migration).toContain("'home_team_name', home_teams_table.name");
    expect(migration).toContain("'away_team_name', away_teams_table.name");
  });

  it("retorna a posição da vaga como número do jogo", () => {
    expect(migration).toContain("'match_number', COALESCE(NULLIF(after_item.value->>'scheduled_slot', '')::integer");
  });
});
