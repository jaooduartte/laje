import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260913200316_record_individual_team_placements.sql",
  ),
  "utf8",
);

describe("individual team placements migration", () => {
  it("persists direct team placements without athlete, lane or metric requirements", () => {
    expect(migration).toContain("recording_mode IN ('ATHLETE_METRIC', 'TEAM_PLACEMENT')");
    expect(migration).toContain(
      "save_championship_individual_event_team_placements",
    );
    expect(migration).toContain("final_position INTEGER");
    expect(migration).toContain("'TEAM_PLACEMENT'");
    expect(migration).not.toContain("Informe atlética, atleta ou titulares, raia");
  });

  it("allows repeated teams, keeps W.O. scoped to the event and rejects conflicting input", () => {
    expect(migration).toContain("unique_team_placement_position_idx");
    expect(migration).not.toContain("GROUP BY placement_row.team_id");
    expect(migration).toContain("Uma atlética marcada em W.O. não pode ocupar uma colocação.");
    expect(migration).toContain("'WALKOVER'::public.championship_individual_entry_status");
  });

  it("preserves direct placements after disqualification and excludes legacy rows once positions exist", () => {
    expect(migration).toContain("WHEN NEW.recording_mode = 'TEAM_PLACEMENT' THEN OLD.final_position");
    expect(migration).toContain("entries_table.recording_mode = 'ATHLETE_METRIC'");
    expect(migration).toContain("team_placement_entries.recording_mode = 'TEAM_PLACEMENT'");
  });
});
