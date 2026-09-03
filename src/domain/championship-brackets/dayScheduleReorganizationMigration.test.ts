import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260902152735_add_day_schedule_reorganization.sql",
  ),
  "utf8",
);

describe("day schedule reorganization migration", () => {
  it("creates a dedicated preview and confirmation flow", () => {
    expect(migration).toContain("build_day_schedule_reorganization_preview");
    expect(migration).toContain("preview_day_schedule_reorganization");
    expect(migration).toContain("apply_day_schedule_reorganization");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("A prévia está desatualizada");
  });

  it("reorganizes every eligible court item and preserves pending selections", () => {
    expect(migration).toContain("day_schedule_reorganization_items");
    expect(migration).toContain("is_pending_manual_relocation, false) = false");
    expect(migration).toContain("is_pending_manual_relocation = CASE WHEN changes_json.is_selected THEN false");
    expect(migration).toContain("selection_order");
    expect(migration).toContain("planned_court_position");
  });

  it("terminates the fixed-item update before recalculating the remaining queue", () => {
    expect(migration).toContain(
      "WHERE fixed_items.item_id = day_schedule_reorganization_items.item_id;\n\n  FOR item_record IN",
    );
  });

  it("checks cross-court rest, configured breaks and resource locks", () => {
    expect(migration).toContain("is_championship_team_rest_gap_conflict");
    expect(migration).toContain("bracket_court_id <> bracket_court_id");
    expect(migration).toContain("championship_bracket_day_breaks");
    expect(migration).toContain("edition_payload->'resource_locks'");
  });

  it("supports preserving or removing the day interval", () => {
    expect(migration).toContain("KEEP_BEFORE_KNOCKOUT");
    expect(migration).toContain("break_policy = 'REMOVE'");
    expect(migration).toContain("next_break_start_at");
    expect(migration).toContain("DELETE FROM public.championship_bracket_day_breaks");
  });

  it("persists placeholders without materializing matches and adjusts the day window", () => {
    expect(migration).toContain("item_type = 'KNOCKOUT_PLACEHOLDER'");
    expect(migration).toContain("AND bracket_matches_table.match_id IS NULL");
    expect(migration).toContain("planned_scheduled_date = changes_table.scheduled_date");
    expect(migration).toContain("start_time = LEAST(start_time, next_day_start)");
    expect(migration).toContain("end_time = GREATEST(end_time, next_day_end)");
  });
});
