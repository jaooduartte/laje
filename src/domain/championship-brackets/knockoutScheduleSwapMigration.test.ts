import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903130028_add_knockout_schedule_swap_rpcs.sql",
  ),
  "utf8",
);

const correctionMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903131537_fix_knockout_schedule_swap_competition_edition_join.sql",
  ),
  "utf8",
);

const seasonYearCorrectionMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903131820_fix_knockout_schedule_swap_edition_season_year.sql",
  ),
  "utf8",
);

describe("knockout schedule swap migration", () => {
  it("limits the source and candidates to the scheduled knockout phase", () => {
    expect(migration).toContain("resolve_knockout_schedule_swap_conflict");
    expect(migration).toContain("list_knockout_schedule_swap_candidates");
    expect(migration).toContain("swap_knockout_schedule_slots");
    expect(migration).toContain("'KNOCKOUT'::public.bracket_phase");
    expect(migration).toContain("source_item.match_id IS NOT NULL");
    expect(migration).toContain("candidate_matches.status = 'SCHEDULED'::public.match_status");
    expect(migration).toContain("candidate_competitions.sport_id = source_item.sport_id");
  });

  it("preserves the planned reservation and synchronizes a materialized target", () => {
    expect(migration).toContain("planned_scheduled_date = COALESCE(target_item.scheduled_date");
    expect(migration).toContain("planned_location_group_id = target_item.planned_location_group_id");
    expect(migration).toContain("UPDATE public.matches");
    expect(migration).toContain("scheduled_date = source_item.planned_scheduled_date");
    expect(migration).toContain("scheduled_slot = source_item.planned_scheduled_slot");
    expect(migration).toContain("reprogramming_revision = reprogramming_revision + 1");
  });

  it("keeps the operation authorized and revalidates operational constraints", () => {
    expect(migration).toContain("has_admin_tab_access('matches'::public.admin_panel_tab, true)");
    expect(migration).toContain("resolve_scheduled_match_rest_gap_conflict");
    expect(migration).toContain("A troca cria conflito de representação na mesma quadra.");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.list_knockout_schedule_swap_candidates(UUID) FROM PUBLIC");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.swap_knockout_schedule_slots(UUID, UUID) TO authenticated");
  });

  it("obtains the championship from the bracket edition", () => {
    expect(migration).not.toContain("competitions_table.championship_id");
    expect(migration).not.toContain("competitions_table.season_year");
    expect(migration).toContain("editions_table.championship_id");
    expect(migration).toContain("editions_table.season_year");
    expect(migration).toContain("JOIN public.championship_bracket_editions AS editions_table");
    expect(correctionMigration).toContain("pg_get_functiondef");
    expect(correctionMigration).toContain("editions_table.championship_id");
    expect(correctionMigration).toContain("editions_table.season_year");
    expect(seasonYearCorrectionMigration).toContain("editions_table.season_year");
  });
});
