import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260909002118_enable_materialized_knockout_schedule_swaps.sql",
  ),
  "utf8",
);

describe("materialized knockout schedule swap migration", () => {
  it("permite que a origem materializada esteja agendada", () => {
    expect(migration).toContain(
      "source_item.status != 'SCHEDULED'::public.match_status",
    );
    expect(migration).toContain(
      "candidate_matches.status = 'SCHEDULED'::public.match_status",
    );
  });

  it("sincroniza os dois jogos materializados sem alterar a estrutura", () => {
    const swapFunction = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.swap_knockout_schedule_slots"),
      migration.indexOf("REVOKE ALL ON FUNCTION public.list_knockout_schedule_swap_candidates"),
    );

    expect(swapFunction).toContain("WHERE id = source_item.match_id");
    expect(swapFunction).toContain("WHERE id = target_item.match_id");
    expect(swapFunction).not.toMatch(
      /SET[\s\S]*\b(slot_number|home_team_id|away_team_id|match_id|source_home_bracket_match_id|source_away_bracket_match_id|next_bracket_match_id)\s*=/,
    );
  });
});
