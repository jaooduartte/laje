import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260908235358_reconcile_scheduled_handball_female_quarterfinals.sql",
  ),
  "utf8",
);

describe("scheduled handball female quarterfinal reconciliation migration", () => {
  it("recalculates the scheduled first round from the historical group ranking", () => {
    expect(migration).toContain("'handebol'");
    expect(migration).toContain("'FEMININO'::public.match_naipe");
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
  });

  it("updates only scheduled quarterfinal participants and preserves their schedule", () => {
    expect(migration).toContain(
      "matches_table.status = 'SCHEDULED'::public.match_status",
    );
    expect(migration).toContain("home_team_id = current_expected_home_team_id");
    expect(migration).toContain("away_team_id = current_expected_away_team_id");
    expect(migration).not.toMatch(
      /SET[\s\S]*\b(scheduled_date|start_time|end_time|scheduled_slot|queue_position|location|court_name)\s*=/,
    );
  });

  it("blocks the repair after a later knockout round progresses", () => {
    expect(migration).toContain("round_number > 1");
    expect(migration).toContain("'LIVE'::public.match_status");
    expect(migration).toContain("'FINISHED'::public.match_status");
    expect(migration).toContain("resolve_scheduled_match_rest_gap_conflict");
  });
});
