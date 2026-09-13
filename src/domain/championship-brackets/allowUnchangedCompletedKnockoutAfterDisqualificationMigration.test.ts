import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260913154753_allow_unchanged_completed_knockout_after_disqualification.sql",
  ),
  "utf8",
);

describe("completed knockout preservation after a collective disqualification", () => {
  it("removes the blanket guard for every completed knockout match", () => {
    expect(migration).toContain(
      "A desclassificação exige que todos os jogos eliminatórios permaneçam agendados.",
    );
    expect(migration).toContain("function_definition := replace(");
    expect(migration).toContain("completed_knockout_guard_fragment");
  });

  it("blocks only when recalculated first-round participants would change", () => {
    expect(migration).toContain("proposed_home_team_id UUID");
    expect(migration).toContain("proposed_away_team_id UUID");
    expect(migration).toContain("current_home_team_id UUID");
    expect(migration).toContain("current_away_team_id UUID");
    expect(migration).toContain(
      "current_home_team_id IS DISTINCT FROM proposed_home_team_id",
    );
    expect(migration).toContain(
      "current_away_team_id IS DISTINCT FROM proposed_away_team_id",
    );
  });

  it("keeps the configured competition crossing as the source of the proposal", () => {
    expect(migration).toContain("standard_seed_order[((slot_index - 1) * 2) + 1]");
    expect(migration).toContain("standard_seed_order[((slot_index - 1) * 2) + 2]");
    expect(migration).toContain("qualified_team_ids[");
  });
});
