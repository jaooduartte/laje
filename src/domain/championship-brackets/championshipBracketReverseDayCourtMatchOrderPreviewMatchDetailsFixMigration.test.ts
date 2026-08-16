import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260816140000_fix_reverse_day_court_match_order_preview_match_details.sql"),
  "utf8",
);

describe("reverse day court match order preview match details fix migration", () => {
  it("recria a prévia com os dados completos de cada partida", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.preview_championship_bracket_reconfiguration");
    expect(migration).toContain("'sport_name', sports_table.name");
    expect(migration).toContain("'naipe', matches_table.naipe");
    expect(migration).toContain("'home_team_name', home_teams_table.name");
    expect(migration).toContain("'away_team_name', away_teams_table.name");
  });

  it("calcula a numeração visual pela configuração do campeonato, separada da posição", () => {
    expect(migration).toContain("editions_table.payload_snapshot ->> 'match_numbering_mode'");
    expect(migration).toContain("row_number() OVER");
    expect(migration).toContain("'match_number', numbered_matches.match_number");
    expect(migration).toContain("'match_number', NULLIF(before_item.value ->> 'match_number', '')::INTEGER");
    expect(migration).toContain("'scheduled_slot', matches_table.scheduled_slot");
    expect(migration).toContain("matches_table.season_year = editions_table.season_year");
  });
});
