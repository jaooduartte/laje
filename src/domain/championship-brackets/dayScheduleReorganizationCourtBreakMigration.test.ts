import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const targetCourtBreakMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260902173000_allow_target_court_break_reorganization.sql",
  ),
  "utf8",
);
const automaticPlacementMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260902180000_refine_day_schedule_reorganization_auto_placement.sql",
  ),
  "utf8",
);
const automaticKnockoutOrderingMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260902183000_keep_automatic_relocation_before_knockout.sql",
  ),
  "utf8",
);
const displacementBadgeMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260902184500_limit_reorganization_displacement_badges.sql",
  ),
  "utf8",
);

describe("day schedule reorganization court break migration", () => {
  it("allows the target court interval to be preserved or removed", () => {
    expect(targetCourtBreakMigration).toContain("breaks_table.bracket_court_id = target_court_record.id");
    expect(targetCourtBreakMigration).toContain("primary_break_record.scope_type");
    expect(targetCourtBreakMigration).toContain("primary_break_record.bracket_court_id");
    expect(targetCourtBreakMigration).toContain("primary_break_record.scope_type = ''COURT''");
    expect(targetCourtBreakMigration).toContain("next_break_start_at := public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_start_time)");
    expect(targetCourtBreakMigration).toContain("apply_day_schedule_reorganization");
  });

  it("moves the target court interval and inserts automatic selections before knockout slots", () => {
    expect(automaticPlacementMigration).toContain("should_reposition_target_court_break BOOLEAN := false");
    expect(automaticPlacementMigration).toContain("should_reposition_target_court_break := true;");
    expect(automaticPlacementMigration).toContain("next_break_end_at := next_break_start_at + primary_break_duration;");
    expect(automaticPlacementMigration).toContain("WHEN strategy = ''AUTO'' AND is_selected THEN 1");
    expect(automaticPlacementMigration).toContain("WHEN strategy = ''AUTO'' AND is_knockout THEN 2");
    expect(automaticPlacementMigration).toContain("max(existing_items.planned_end_at)");
    expect(automaticPlacementMigration).toContain("min(knockout_items.original_start_at)");
  });

  it("keeps every selected automatic relocation before target-court knockout slots", () => {
    expect(automaticKnockoutOrderingMigration).toContain("item_record.is_knockout");
    expect(automaticKnockoutOrderingMigration).toContain("item_record.bracket_court_id = target_court_record.id");
    expect(automaticKnockoutOrderingMigration).toContain("max(selected_items.planned_end_at)");
  });

  it("only marks an item as repositioned when its scheduled time changes", () => {
    expect(displacementBadgeMigration).toContain("original_start_at IS DISTINCT FROM planned_start_at");
    expect(displacementBadgeMigration).toContain("original_end_at IS DISTINCT FROM planned_end_at");
    expect(displacementBadgeMigration).toContain("''is_displaced'', is_selected = false AND (\\n        original_start_at IS DISTINCT FROM planned_start_at\\n        OR original_end_at IS DISTINCT FROM planned_end_at\\n      )");
  });

  it("removes the unused observation from preview and confirmation", () => {
    expect(targetCourtBreakMigration).toContain("relocation_notes TEXT");
    expect(targetCourtBreakMigration).toContain("''notes'', relocation_notes");
    expect(targetCourtBreakMigration).toContain("manual_schedule_override_notes = CASE WHEN changes_json.is_selected THEN NULL");
  });
});
