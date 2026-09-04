import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260904192351_add_operational_knockout_schedule_adjustments.sql",
  ),
  "utf8",
);
const previewFixMigrationSource = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260904200340_fix_operational_knockout_schedule_adjustment_preview.sql",
  ),
  "utf8",
);

describe("operational knockout schedule adjustment migration", () => {
  it("limits candidates to editable future knockout slots and scheduled matches", () => {
    expect(migrationSource).toContain("'KNOCKOUT'::public.bracket_phase");
    expect(migrationSource).toContain("reservations_table.start_at > now()");
    expect(migrationSource).toContain("'SCHEDULED'::public.match_status");
    expect(migrationSource).toContain("'REVIEW'::public.championship_status");
    expect(migrationSource).toContain("'IN_PROGRESS'::public.championship_status");
    expect(migrationSource).toContain("has_admin_tab_access('matches'::public.admin_panel_tab, true)");
  });

  it("preserves the logical court and recalculates reservations before synchronized matches", () => {
    expect(migrationSource).toContain("normalize_bracket_entity_name");
    expect(migrationSource).toContain("original_duration_minutes");
    expect(migrationSource).toContain("duration_minutes = duration_minutes_value");
    expect(migrationSource).toContain("championship_bracket_knockout_schedule_reservations AS reservations_table");
    expect(migrationSource).toContain("UPDATE public.matches");
    expect(migrationSource).toContain("reprogramming_revision = reprogramming_revision + 1");
  });

  it("keeps the applied migration immutable and versions the preview correction separately", () => {
    expect(migrationSource).not.toContain("DROP TABLE IF EXISTS operational_knockout_schedule_breaks");
    expect(migrationSource).not.toContain("DROP TABLE IF EXISTS operational_knockout_schedule_items");
    expect(previewFixMigrationSource).toContain(
      "CREATE OR REPLACE FUNCTION public.preview_operational_knockout_schedule_adjustment",
    );
    expect(previewFixMigrationSource).toContain(
      "DROP TABLE IF EXISTS operational_knockout_schedule_breaks",
    );
    expect(previewFixMigrationSource).toContain(
      "DROP TABLE IF EXISTS operational_knockout_schedule_items",
    );
    expect(previewFixMigrationSource).toContain("'sport_name', sport_name");
    expect(previewFixMigrationSource).toContain("'naipe', naipe");
  });

  it("normalizes legacy breaks and audits confirmed operations", () => {
    expect(migrationSource).toContain("concat('legacy:', day_record.id)");
    expect(migrationSource).toContain("public.championship_bracket_day_breaks");
    expect(migrationSource).toContain("accept_day_end_extension");
    expect(migrationSource).toContain("write_admin_action_log");
    expect(migrationSource).toContain("FOR UPDATE OF bracket_matches_table, reservations_table");
    expect(migrationSource).toContain("GRANT EXECUTE ON FUNCTION public.apply_operational_knockout_schedule_adjustment");
  });
});
