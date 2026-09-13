import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260913155345_preserve_completed_knockout_participant_orientation.sql",
  ),
  "utf8",
);

describe("completed knockout participant orientation preservation", () => {
  it("treats reversed home and away teams as the same completed matchup", () => {
    expect(migration).toContain(
      "current_home_team_id IS NOT DISTINCT FROM proposed_away_team_id",
    );
    expect(migration).toContain(
      "current_away_team_id IS NOT DISTINCT FROM proposed_home_team_id",
    );
  });

  it("preserves the historical home and away orientation for a completed matchup", () => {
    expect(migration).toContain("matches_table.status <> 'SCHEDULED'::public.match_status");
    expect(migration).toContain("home_team_id := current_home_team_id");
    expect(migration).toContain("away_team_id := current_away_team_id");
  });

  it("continues to block a completed knockout when its participating teams change", () => {
    expect(migration).toContain(
      "A desclassificação alteraria participantes de uma chave com jogo eliminatório ao vivo ou finalizado.",
    );
  });
});
