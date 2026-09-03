import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260902160534_refine_day_schedule_reorganization_strategies.sql",
  ),
  "utf8",
);
const manualMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260902190000_add_manual_day_schedule_reorganization.sql",
  ),
  "utf8",
);
const manualRefinementMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260902191500_refine_manual_day_schedule_reorganization.sql",
  ),
  "utf8",
);
const multiCourtManualMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260902202626_refine_multicourt_manual_day_schedule_reorganization.sql",
  ),
  "utf8",
);
const dragAndDropMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260902210506_implement_drag_drop_day_schedule_reorganization.sql",
  ),
  "utf8",
);
const manualPlacementFixMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903023215_fix_day_schedule_manual_placement_validation.sql",
  ),
  "utf8",
);
const selectedMatchAliasFixMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903024350_fix_day_schedule_selected_match_validation_alias.sql",
  ),
  "utf8",
);
const manualPlacementPredicateFixMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903030000_fix_day_schedule_manual_placement_predicate.sql",
  ),
  "utf8",
);
const preserveManualScheduleMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903032856_preserve_manual_schedule_and_fix_placeholder_preview.sql",
  ),
  "utf8",
);
const alignedRestConflictsMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903035643_align_day_schedule_rest_conflicts_with_schedule_generator.sql",
  ),
  "utf8",
);

describe("day schedule reorganization strategies migration", () => {
  it("upgrades the applied calculation without rewriting its migration", () => {
    expect(migration).toContain("pg_get_functiondef");
    expect(migration).toContain("build_day_schedule_reorganization_preview");
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it("supports queue boundaries and an anticipated day start", () => {
    expect(migration).toContain("day_start_time");
    expect(migration).toContain("''START'', ''END'', ''AUTO''");
    expect(migration).toContain("O novo horário de início do dia deve antecipar");
    expect(migration).toContain("strategy = ''START''");
    expect(migration).toContain("strategy = ''END''");
  });

  it("supports manual insertion after a timeline item", () => {
    expect(manualMigration).toContain("''START'', ''END'', ''AUTO'', ''MANUAL''");
    expect(manualMigration).toContain("manual_anchor_item_id");
    expect(manualMigration).toContain("WHEN strategy = ''MANUAL'' AND item_record.is_selected THEN");
    expect(manualMigration).toContain("anchor_item.planned_end_at");
  });

  it("loads the manual base schedule before selecting matches and prioritizes the target court anchor", () => {
    expect(manualRefinementMigration).toContain("manual_anchor_item_id");
    expect(manualRefinementMigration).toContain("match_ids");
    expect(manualRefinementMigration).toContain("AND bracket_court_id = target_court_record.id");
  });

  it("compacts movable courts, accepts the manual order and returns per-card rest conflicts", () => {
    expect(multiCourtManualMigration).toContain("manual_court_item_order");
    expect(multiCourtManualMigration).toContain("manual_order_position");
    expect(multiCourtManualMigration).toContain("jsonb_each(manual_court_item_order)");
    expect(multiCourtManualMigration).toContain("previous_items.bracket_court_id = item_record.bracket_court_id");
    expect(multiCourtManualMigration).toContain("target_group_items.original_end_at");
    expect(multiCourtManualMigration).toContain("rest_conflicts");
    expect(multiCourtManualMigration).toContain("primary_break_record.id IS NULL OR breaks_table.id <> primary_break_record.id");
  });

  it("separates the original selection from games positioned by drag and drop", () => {
    expect(dragAndDropMigration).toContain("source_match_ids UUID[]");
    expect(dragAndDropMigration).toContain("placed_match_ids");
    expect(dragAndDropMigration).toContain("selected_match_ids <@ source_match_ids");
    expect(dragAndDropMigration).toContain("Posicione todos os jogos selecionados no cronograma.");
  });

  it("recognizes a game present in the manual court order and only marks displacement after placement", () => {
    expect(manualPlacementFixMigration).toContain("manual_order_item(item_id)");
    expect(manualPlacementFixMigration).toContain(
      "manual_order_item.item_id = selected_match_id::TEXT",
    );
    expect(manualPlacementFixMigration).toContain(
      "COALESCE(cardinality(selected_match_ids), 0) > 0 AND is_selected = false",
    );
    expect(selectedMatchAliasFixMigration).toContain(
      "selected_match_item(match_id)",
    );
    expect(selectedMatchAliasFixMigration).toContain(
      "manual_order_item.item_id = selected_match_item.match_id::TEXT",
    );
    expect(manualPlacementPredicateFixMigration).toContain(
      "AND EXISTS (",
    );
    expect(manualPlacementPredicateFixMigration).toContain(
      "selected_match_item(match_id)",
    );
  });

  it("keeps the base schedule static and only recalculates a court after a manual change", () => {
    expect(preserveManualScheduleMigration).toContain(
      "should_recalculate_target_court BOOLEAN := false",
    );
    expect(preserveManualScheduleMigration).toContain(
      "AND should_recalculate_target_court",
    );
    expect(preserveManualScheduleMigration).toContain(
      "AND bracket_court_id = target_court_record.id",
    );
    expect(preserveManualScheduleMigration).toContain(
      "rest_conflicting_end",
    );
    expect(preserveManualScheduleMigration).toContain(
      "A sequência de %s não respeita o descanso mínimo na mesma quadra.",
    );
  });

  it("uses the generator rest gap in the manual preview", () => {
    expect(alignedRestConflictsMigration).toContain(
      "timeline_items.sport_id = conflicting_items.sport_id THEN 3",
    );
    expect(alignedRestConflictsMigration).toContain("ELSE 2");
    expect(alignedRestConflictsMigration).toContain(
      "timeline_items.is_knockout = false",
    );
    expect(alignedRestConflictsMigration).toContain(
      "public.is_championship_team_rest_gap_conflict(",
    );
  });
});
