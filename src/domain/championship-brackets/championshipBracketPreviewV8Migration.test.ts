import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260813040313_implement_full_exact_preview_v8.sql",
  ),
  "utf8",
);

describe("championship bracket preview v8 migration", () => {
  it("isolates candidate outcomes by search tier", () => {
    expect(migration).toContain("relocation_candidate_tier_states");
    expect(migration).toContain(
      "PRIMARY KEY (job_id, match_id, phase, search_tier, slot_id)",
    );
    expect(migration).toContain("format('%s_%s', tier_record.search_tier");
  });

  it("resets attempted candidate slots before each tier", () => {
    expect(migration).toContain(
      "attempted_slot_ids := ARRAY[]::BIGINT[];",
    );
  });

  it("keeps strict rest search before the relaxed fallback", () => {
    expect(migration).toContain("FOR rest_gap_value IN SELECT unnest(ARRAY[4, 3])");
    expect(migration).toContain("rest_gap_value = 3");
  });

  it("uses short phases for group compaction and knockout scheduling", () => {
    expect(migration).toContain("SCHEDULING_GROUPS");
    expect(migration).toContain("COMPACTING_GROUPS");
    expect(migration).toContain("SCHEDULING_KNOCKOUT");
    expect(migration).toContain("stage = 'FINALIZING'");
  });

  it("revalidates sport targets after compaction", () => {
    expect(migration).toMatch(
      /COMPACTING_GROUPS[\s\S]*resolve_v8_target_completion_diagnostics/,
    );
  });

  it("validates internal gaps against the combined group and knockout timeline", () => {
    expect(migration).toMatch(
      /WITH scheduled AS \([\s\S]*UNION ALL[\s\S]*knockout_matches/,
    );
  });

  it("uses only court sport compatibility for knockout windows", () => {
    const knockoutWindows = migration.slice(
      migration.indexOf("resolve_v8_knockout_court_windows"),
      migration.indexOf("schedule_v8_knockout_matches"),
    );

    expect(knockoutWindows).toContain("court_item.value -> 'sport_ids'");
    expect(knockoutWindows).not.toContain("sport_match_targets");
  });

  it("applies an ALL final block to every division", () => {
    expect(migration).toContain(
      "COALESCE(NULLIF(block_item.value ->> 'division_scope', ''), 'ALL') = 'ALL'",
    );
    expect(migration).not.toContain(
      "= 'ALL' AND knockout_record.division IS NULL",
    );
  });

  it("keeps the Futebol Society cross-group qualification sequence", () => {
    expect(migration).toContain("FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS");
    expect(migration).toContain("should_use_cross_groups_pairing");
    expect(migration).toContain("ORDER BY ordered_groups.group_number, qualifiers.rank_number");
  });

  it("keeps the normal qualification pools and third-place branch", () => {
    expect(migration).toContain("BEST_SECOND_POOL_POSITION");
    expect(migration).toContain("BEST_THIRD_POOL_POSITION");
    expect(migration).toContain("third_place_mode = 'MATCH'");
  });

  it("persists the v8 marker with the bracket edition", () => {
    expect(migration).toContain("exact_preview_algorithm_version");
    expect(migration).toContain("payload_snapshot ->> 'exact_preview_algorithm_version'");
    expect(migration).not.toContain("jobs_table.result_edition_id = _bracket_edition_id");
  });

  it("keeps knockout reservations as the materialization source", () => {
    expect(migration).toContain(
      "championship_bracket_knockout_schedule_reservations",
    );
    expect(migration).toContain(
      "create_championship_knockout_match_schedule",
    );
  });

  it("records tier telemetry and leaves unavailable inner counters explicit", () => {
    expect(migration).toContain("'search_tiers'");
    expect(migration).toContain("'relocations_used', 0");
    expect(migration).toContain("'branches_examined', 0");
  });
});
