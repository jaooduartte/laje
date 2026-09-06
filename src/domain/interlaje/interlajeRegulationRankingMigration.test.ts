import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260906180000_align_interlaje_regulation_rankings.sql",
  ),
  "utf8",
);

describe("Interlaje regulation ranking migration", () => {
  it("persists the six official policies without a name-based sporting tie break", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS classification_policy JSONB");
    expect(migration).toContain("'HEAD_TO_HEAD_EXACTLY_TWO'");
    expect(migration).toContain("'SETS_AVERAGE'");
    expect(migration).toContain("'SWIM_OFF_50M_SAME_CATEGORY'");
    expect(migration).toContain("'REPEAT_MARK_UNTIL_FIRST'");
    expect(migration).toContain("h2h.team_id ASC");
    expect(migration).not.toContain("team_name ASC");
    expect(migration).toContain("AND sports_table.id = championship_sports_table.sport_id");
  });

  it("keeps rally points separate from sets and exposes the shared collective ranking routine", () => {
    expect(migration).toContain("rally_points_for INTEGER");
    expect(migration).toContain("rally_points_against INTEGER");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_interlaje_collective_ranking");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_interlaje_regulation_competition_standings");
  });

  it("records individual tiebreak procedures for swimming and athletics", () => {
    expect(migration).toContain("championship_interlaje_individual_tie_break_resolutions");
    expect(migration).toContain("'SWIM_OFF'");
    expect(migration).toContain("'REPEAT_MARK'");
    expect(migration).toContain("'CAMERA'");
  });
});
