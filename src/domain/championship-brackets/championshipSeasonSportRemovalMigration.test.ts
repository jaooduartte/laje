import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260912210804_add_championship_season_sport_removal.sql",
  ),
  "utf8",
);

describe("championship season sport removal migration", () => {
  it("keeps the removal scoped to one championship season and records its audit fields", () => {
    expect(migration).toContain("CREATE TABLE public.championship_season_sport_removals");
    expect(migration).toContain("removed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL");
    expect(migration).toContain("UNIQUE (championship_id, season_year, sport_id)");
    expect(migration).toContain("Modalidade não encontrada na temporada atual do campeonato.");
  });

  it("requires Modalidades permission, confirmation and no live item before the transaction deletes operational data", () => {
    expect(migration).toContain("public.has_admin_tab_access('sports'::public.admin_panel_tab, true)");
    expect(migration).toContain("Confirme a remoção digitando o nome da modalidade.");
    expect(migration).toContain("Não é possível remover uma modalidade com jogo ou sessão ao vivo.");
    expect(migration).toContain("DELETE FROM public.matches AS matches_table");
    expect(migration).toContain("DELETE FROM public.championship_individual_events AS events_table");
    expect(migration).toContain("DELETE FROM public.championship_bracket_competitions AS competitions_table");
    expect(migration).toContain("DELETE FROM public.championship_bracket_court_sports AS court_sports_table");
    expect(migration).toContain("team_modalities_count");
  });

  it("keeps collective matches limited by court and individual sessions limited by sport and sex", () => {
    expect(migration).toContain("PARTITION BY matches_table.location, COALESCE(matches_table.court_name, '')");
    expect(migration).toContain("PARTITION BY sessions_table.sport_id, sessions_table.naipe");
    expect(migration).toContain("championship_season_sport_removals AS removals_table");
  });
});
