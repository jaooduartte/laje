import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260908224458_reconcile_knockout_finished_quarterfinals.sql",
  ),
  "utf8",
);

describe("finished quarterfinal reconciliation migration", () => {
  it("rebuilds expected first-round slots from the historical group ranking and pairing mode", () => {
    expect(migration).toContain(
      "get_championship_bracket_competition_group_rankings",
    );
    expect(migration).toContain(
      "get_championship_bracket_competition_qualification_pool_rankings",
    );
    expect(migration).toContain(
      "resolve_championship_knockout_seed_order",
    );
    expect(migration).toContain("competition_record.knockout_pairing_mode");
    expect(migration).toContain(
      "target_bracket_size > direct_qualified_team_count",
    );
    expect(migration).not.toContain(
      "competition_record.should_complete_knockout_with_best_second_placed_teams",
    );
  });

  it("maps completed quarterfinals by the exact pair of teams, not by schedule or match number", () => {
    expect(migration).toContain(
      "matches_table.status = 'FINISHED'::public.match_status",
    );
    expect(migration).toContain(
      "matches_table.home_team_id = current_expected_home_team_id",
    );
    expect(migration).toContain(
      "matches_table.away_team_id = current_expected_away_team_id",
    );
    expect(migration).toContain("completed_match_count = 1");
    expect(migration).not.toContain("queue_position = current_slot_number");
  });

  it("blocks ambiguous repairs and protects progressed knockout rounds", () => {
    expect(migration).toContain(
      "get_championship_knockout_qf_reconciliation_audit",
    );
    expect(migration).toContain("unsafe_plan_count > 0");
    expect(migration).toContain("round_number > 1");
    expect(migration).toContain("'LIVE'::public.match_status");
    expect(migration).toContain("'FINISHED'::public.match_status");
    expect(migration).toContain("'SCHEDULED'::public.match_status");
  });

  it("keeps completed matches immutable while updating only scheduled semifinals", () => {
    expect(migration).toContain("match_id = NULL");
    expect(migration).toContain("FROM jsonb_to_recordset(reconciliation_plan)");
    expect(migration).toContain("UPDATE public.matches AS matches_table");
    expect(migration).toContain(
      "WHERE matches_table.id = semifinal_record.match_id",
    );
    expect(migration).toContain(
      "matches_table.status = 'SCHEDULED'::public.match_status",
    );
  });
});
