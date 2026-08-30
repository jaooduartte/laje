import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260830203000_add_manual_match_relocation_slot_insertion.sql",
  ),
  "utf8",
);

describe("manual match relocation slot migration", () => {
  it("provides an individual slot preview and atomic application", () => {
    expect(migration).toContain("preview_manual_match_relocation_slot");
    expect(migration).toContain("apply_manual_match_relocation_slot");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("A prévia está desatualizada");
  });

  it("keeps fixed occupations and validates physical and rest conflicts", () => {
    expect(migration).toContain("is_manual_schedule_override, false");
    expect(migration).toContain("is_pending_manual_relocation, false");
    expect(migration).toContain("sobreposição física");
    expect(migration).toContain("is_championship_team_rest_gap_conflict");
  });

  it("clears a held match only in the confirmed application", () => {
    expect(migration).toContain("is_pending_manual_relocation = CASE WHEN changes_json.is_selected THEN false");
    expect(migration).toContain("pending_manual_relocation_previous_label = CASE WHEN changes_json.is_selected THEN NULL");
  });
});
