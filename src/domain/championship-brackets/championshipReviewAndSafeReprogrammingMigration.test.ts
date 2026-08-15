import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const enumMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260814234959_add_championship_review_and_safe_reprogramming.sql"),
  "utf8",
);
const workflowMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260814235554_implement_championship_review_and_safe_reprogramming.sql"),
  "utf8",
);
const revisionTriggerMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260815040000_fix_reprogramming_revision_trigger_for_courts.sql"),
  "utf8",
);
const locationNamesMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260815041500_update_bracket_location_names_without_redistribution.sql"),
  "utf8",
);
const globalLocationNamesMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260815041600_replicate_location_names_across_days.sql"),
  "utf8",
);
const matchLocationNamesMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260815041700_sync_bracket_location_names_with_matches.sql"),
  "utf8",
);
const knockoutReservationLocationNamesMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260815041800_sync_knockout_reservation_location_names.sql"),
  "utf8",
);
const knockoutPlannedLocationNamesMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260815041900_sync_knockout_planned_location_names.sql"),
  "utf8",
);

describe("championship review and safe reprogramming migrations", () => {
  it("adds review before using it in the workflow migration", () => {
    expect(enumMigration).toContain("ADD VALUE IF NOT EXISTS 'REVIEW' AFTER 'UPCOMING'");
    expect(workflowMigration).toContain("status = 'REVIEW'::public.championship_status");
  });

  it("moves generated championships to review and protects operational actions", () => {
    expect(workflowMigration).toContain("SET status = 'REVIEW'::public.championship_status");
    expect(workflowMigration).toContain("prevent_review_match_operations");
    expect(workflowMigration).toContain("prevent_review_individual_session_operations");
  });

  it("requires preview revision before applying a reprogramming", () => {
    expect(workflowMigration).toContain("preview_championship_bracket_reconfiguration");
    expect(workflowMigration).toContain("apply_championship_bracket_reconfiguration");
    expect(workflowMigration).toContain("revision_value <> _expected_revision");
    expect(workflowMigration).toContain("ROLLBACK_CHAMPIONSHIP_BRACKET_RECONFIGURATION_PREVIEW");
  });

  it("resolves the edition of a court through its location without reading a missing record field", () => {
    expect(revisionTriggerMigration).toContain("trigger_record := CASE TG_OP");
    expect(revisionTriggerMigration).toContain("WHEN 'championship_bracket_courts' THEN");
    expect(revisionTriggerMigration).toContain("locations_table.id = (trigger_record->>'bracket_location_id')::uuid");
    expect(revisionTriggerMigration).not.toContain("NEW.bracket_edition_id");
  });

  it("updates location and court names without redistributing matches or changing the revision", () => {
    expect(locationNamesMigration).toContain("update_bracket_generated_location_group");
    expect(locationNamesMigration).toContain("'championship_schedule'::public.admin_panel_tab");
    expect(locationNamesMigration).not.toContain("redistribute_bracket_scheduled_matches");
    expect(locationNamesMigration).toContain("(trigger_record - 'name') = (previous_record - 'name')");
  });

  it("replicates names by the original location and court positions when older days use different group ids", () => {
    expect(globalLocationNamesMigration).toContain("source_location_name");
    expect(globalLocationNamesMigration).toContain("source_court_position");
    expect(globalLocationNamesMigration).toContain("courts_table.position = source_court_position");
    expect(globalLocationNamesMigration).not.toContain("redistribute_bracket_scheduled_matches");
  });

  it("keeps the labels of generated matches synchronized with renamed locations and courts", () => {
    expect(matchLocationNamesMigration).toContain("source_court_name");
    expect(matchLocationNamesMigration).toContain("UPDATE public.matches AS matches_table");
    expect(matchLocationNamesMigration).toContain("SET court_name = trim(court_record->>'court_name')");
    expect(matchLocationNamesMigration).toContain("SET location = trim(_payload->>'location_name')");
    expect(matchLocationNamesMigration).toContain("unique_court_name_repairs");
    expect(matchLocationNamesMigration).toContain("set_config('app.skip_match_conflict_trigger', 'true', true)");
    expect(matchLocationNamesMigration).not.toContain("redistribute_bracket_scheduled_matches");
  });

  it("keeps the labels of knockout reservations synchronized with renamed locations and courts", () => {
    expect(knockoutReservationLocationNamesMigration).toContain(
      "UPDATE public.championship_bracket_knockout_schedule_reservations AS reservations_table",
    );
    expect(knockoutReservationLocationNamesMigration).toContain(
      "public.normalize_bracket_entity_name(reservations_table.court_name) = public.normalize_bracket_entity_name(source_court_name)",
    );
    expect(knockoutReservationLocationNamesMigration).toContain(
      "public.normalize_bracket_entity_name(reservations_table.location_name) = public.normalize_bracket_entity_name(source_location_name)",
    );
    expect(knockoutReservationLocationNamesMigration).toContain(
      "reservations_table.bracket_court_id = courts_table.id",
    );
    expect(knockoutReservationLocationNamesMigration).not.toContain("redistribute_bracket_scheduled_matches");
  });

  it("keeps the planned labels used by knockout cards synchronized with renamed locations and courts", () => {
    expect(knockoutPlannedLocationNamesMigration).toContain(
      "UPDATE public.championship_bracket_matches AS bracket_matches_table",
    );
    expect(knockoutPlannedLocationNamesMigration).toContain(
      "SET planned_court_name = trim(court_record->>'court_name')",
    );
    expect(knockoutPlannedLocationNamesMigration).toContain(
      "SET planned_location_name = trim(_payload->>'location_name')",
    );
    expect(knockoutPlannedLocationNamesMigration).toContain(
      "bracket_matches_table.competition_id = reservations_table.competition_id",
    );
    expect(knockoutPlannedLocationNamesMigration).not.toContain("redistribute_bracket_scheduled_matches");
  });
});
