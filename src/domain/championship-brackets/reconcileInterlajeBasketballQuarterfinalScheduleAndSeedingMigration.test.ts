import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260912173053_reconcile_interlaje_basketball_quarterfinal_schedule_and_seeding.sql",
  ),
  "utf8",
);

describe("INTERLAJE basketball quarterfinal schedule and seeding reconciliation migration", () => {
  it("materializes future v8 knockout matches from the structural plan", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.create_championship_knockout_match_schedule",
    );
    expect(migration).toContain("planned_scheduled_date");
    expect(migration).toContain("planned_scheduled_slot");
    expect(migration).toContain("planned_queue_position");
    expect(migration).toContain("planned_start_time");
    expect(migration).toContain(
      "public.combine_bracket_schedule_timestamp(",
    );
    expect(migration).toContain("scheduled_start_time");
  });

  it("places basketball PA before goal difference in the qualification pool", () => {
    const pointsAveragePosition = migration.indexOf(
      "scored_candidate_rows.points_average ELSE NULL::numeric END DESC NULLS LAST",
    );
    const goalDifferencePosition = migration.indexOf(
      "scored_candidate_rows.goal_diff END DESC",
    );

    expect(pointsAveragePosition).toBeGreaterThan(-1);
    expect(goalDifferencePosition).toBeGreaterThan(pointsAveragePosition);
    expect(migration).toContain("AS is_interlaje_basketball");
    expect(migration).toContain("scored_candidate_rows.goals_against");
  });

  it("rebuilds the scheduled male quarterfinal participants from the corrected pool", () => {
    expect(migration).toContain("'basquetebol'");
    expect(migration).toContain("'MASCULINO'::public.match_naipe");
    expect(migration).toContain(
      "get_championship_bracket_competition_qualification_pool_rankings",
    );
    expect(migration).toContain(
      "resolve_championship_knockout_seed_order",
    );
    expect(migration).toContain("current_expected_home_team_id");
    expect(migration).toContain("current_expected_away_team_id");
  });

  it("copies planned logistics to the four scheduled matches without moving bracket slots", () => {
    expect(migration).toContain("first_round_match_count <> 4");
    expect(migration).toContain(
      "matches_table.status = 'SCHEDULED'::public.match_status",
    );
    expect(migration).toContain(
      "scheduled_slot = current_match_record.planned_scheduled_slot",
    );
    expect(migration).toContain(
      "queue_position = current_match_record.planned_queue_position",
    );
    expect(migration).not.toContain("\n      slot_number =");
  });
});
