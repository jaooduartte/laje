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
    expect(migration).toMatch(
      /PRIMARY KEY\s*\(\s*job_id\s*,\s*match_id\s*,\s*phase\s*,\s*search_tier\s*,\s*slot_id\s*\)/,
    );
    expect(migration).toContain("format('%s_%s', tier_record.search_tier");
  });

  it("resets attempted candidate slots before each tier", () => {
    expect(migration).toContain("attempted_slot_ids := ARRAY[]::BIGINT[];");
  });

  it("keeps gap 3 restricted to pending-match fallback", () => {
    const relocationSearch = migration.slice(
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION championship_bracket_preview_private.try_relocate_for_match_search(",
      ),
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_v8_internal_empty_diagnostics(",
      ),
    );

    const compaction = migration.slice(
      migration.lastIndexOf(
        "CREATE OR REPLACE FUNCTION championship_bracket_preview_private.compact_v8_schedule_batch(",
      ),
      migration.lastIndexOf(
        "CREATE OR REPLACE FUNCTION championship_bracket_preview_private.schedule_v8_knockout_batch(",
      ),
    );

    expect(relocationSearch).toContain("WHEN current_phase = 'RELAXED' THEN 3");
    expect(relocationSearch).toContain(
      "SET\n        relocation_search_phase = 'RELAXED'",
    );

    expect(compaction).toContain("'COMPACTION',\n        4,");
    expect(compaction).not.toContain(
      "FOR rest_gap_value IN SELECT unnest(ARRAY[4, 3])",
    );
    expect(compaction).not.toContain("CASE WHEN rest_gap_value = 3");
  });

  it("bounds compaction timeout retries across worker executions", () => {
    const compaction = migration.slice(
      migration.lastIndexOf(
        "CREATE OR REPLACE FUNCTION championship_bracket_preview_private.compact_v8_schedule_batch(",
      ),
      migration.lastIndexOf(
        "CREATE OR REPLACE FUNCTION championship_bracket_preview_private.schedule_v8_knockout_batch(",
      ),
    );

    expect(migration).toContain("timeout_count INTEGER NOT NULL DEFAULT 0");

    expect(compaction).toContain("compaction_gaps.status = 'UNRESOLVED'");

    expect(compaction).toContain(
      "championship_bracket_preview_private.compaction_gaps.timeout_count + 1",
    );

    expect(compaction).toContain("THEN 'UNRESOLVED'");

    expect(compaction).toContain("'retry', compaction_status = 'RETRY'");

    expect(compaction).toContain(
      "'search_limit', compaction_status = 'UNRESOLVED'",
    );

    expect(migration).toMatch(
      /COMPACTING_GROUPS[\s\S]*resolve_v8_target_completion_diagnostics\(_job_id\)[\s\S]*resolve_v8_internal_empty_diagnostics\(_job_id\)/,
    );
  });

  it("keeps relocation search resumable across worker executions", () => {
    const relocationSearch = migration.slice(
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION championship_bracket_preview_private.try_relocate_for_match_search(",
      ),
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_v8_internal_empty_diagnostics(",
      ),
    );

    expect(relocationSearch).toContain(
      "overall_deadline := clock_timestamp() + interval '10 seconds';",
    );
    expect(relocationSearch).toContain(
      "candidate_states.status =\n              tier_record.search_tier || '_TIMEOUT'",
    );
    expect(relocationSearch).toContain(
      "candidate_states.timeout_count < tier_record.retry_limit",
    );
    expect(relocationSearch).toContain(
      "THEN tier_record.search_tier || '_SEARCH_LIMIT'",
    );
    expect(relocationSearch).toContain("IF tier_has_remaining THEN");
    expect(relocationSearch).toContain("'exhausted', false");
  });

  it("does not treat a deep timeout as immediate search exhaustion", () => {
    const relocationSearch = migration.slice(
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION championship_bracket_preview_private.try_relocate_for_match_search(",
      ),
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_v8_internal_empty_diagnostics(",
      ),
    );

    expect(relocationSearch).toContain("('DEEP'::text, 12, 120, 40, 7000, 3)");
    expect(relocationSearch).toContain(
      "next_timeout_count >= tier_record.retry_limit",
    );
    expect(relocationSearch).toContain(
      "tier_record.search_tier || '_SEARCH_LIMIT'",
    );
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
    expect(migration).toContain(
      "ORDER BY ordered_groups.group_number, qualifiers.rank_number",
    );
  });

  it("keeps the normal qualification pools and third-place branch", () => {
    expect(migration).toContain("BEST_SECOND_POOL_POSITION");
    expect(migration).toContain("BEST_THIRD_POOL_POSITION");
    expect(migration).toContain("third_place_mode = 'MATCH'");
  });

  it("projects implicit best-second vacancies instead of byes", () => {
    const seedResolver = migration.slice(
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_v8_knockout_seed_source(",
      ),
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION championship_bracket_preview_private.create_v8_knockout_matches(",
      ),
    );

    const knockoutCreation = migration.slice(
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION championship_bracket_preview_private.create_v8_knockout_matches(",
      ),
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_v8_knockout_court_windows(",
      ),
    );

    expect(seedResolver).toContain("_include_best_second_pool BOOLEAN");
    expect(seedResolver).toContain(
      "IF _qualifiers_per_group = 1\n    AND _include_best_second_pool",
    );

    expect(knockoutCreation).toContain(
      "should_include_best_second_placed_teams :=\n  competition_record.qualifiers_per_group = 1\n  AND bracket_size > direct_qualified_count;",
    );
    expect(knockoutCreation).toContain(
      "should_include_best_second_placed_teams, should_use_cross_groups_pairing,",
    );
  });

  it("persists the v8 marker with the bracket edition", () => {
    expect(migration).toContain("exact_preview_algorithm_version");
    expect(migration).toContain(
      "payload_snapshot ->> 'exact_preview_algorithm_version'",
    );
    expect(migration).not.toContain(
      "jobs_table.result_edition_id = _bracket_edition_id",
    );
  });

  it("keeps knockout reservations as the materialization source", () => {
    expect(migration).toContain(
      "championship_bracket_knockout_schedule_reservations",
    );
    expect(migration).toContain("create_championship_knockout_match_schedule");
  });

  it("records tier telemetry and leaves unavailable inner counters explicit", () => {
    expect(migration).toContain("'search_tiers'");
    expect(migration).toContain("'relocations_used', 0");
    expect(migration).toContain("'branches_examined', 0");
  });

  it("keeps v8 knockout materialization reservation-authoritative", () => {
    expect(migration).toContain(
      "RENAME TO create_championship_knockout_match_schedule_v7",
    );
    expect(migration).toContain(
      "não possui reserva estrutural aprovada na Etapa 13",
    );
    expect(migration).toContain(
      "RENAME TO ensure_championship_knockout_next_round_match_v7",
    );
    expect(migration).toContain(
      "não existe na estrutura aprovada pela prévia v8",
    );
    expect(migration).toContain(
      "RENAME TO ensure_championship_knockout_third_place_match_v7",
    );
    expect(migration).toContain(
      "A disputa de terceiro lugar não existe na estrutura aprovada pela prévia v8",
    );
  });

  it("validates persisted knockout structure and reservations", () => {
    expect(migration).toContain(
      "A árvore eliminatória persistida divergiu da estrutura aprovada pela prévia v8.",
    );
    expect(migration).toContain(
      "O encadeamento next_bracket_match_id divergiu da árvore eliminatória aprovada pela prévia v8.",
    );
    expect(migration).toContain(
      "Uma ou mais reservas eliminatórias persistidas divergem da programação exata aprovada pela prévia v8.",
    );
    expect(migration).toContain(
      "Os campos planned_* do mata-mata divergem da reserva estrutural aprovada pela prévia v8.",
    );
  });
});
