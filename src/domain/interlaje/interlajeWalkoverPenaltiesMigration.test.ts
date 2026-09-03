import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903135455_add_interlaje_walkover_penalties.sql",
  ),
  "utf8",
);
const rlsFixMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903141156_fix_interlaje_overall_standings_walkover_rls.sql",
  ),
  "utf8",
);
const auditMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903144450_audit_interlaje_overall_standings_adjustments.sql",
  ),
  "utf8",
);

describe("interlaje walkover penalties migration", () => {
  it("persists a positive seasonal value and manual positive counters", () => {
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS public.championship_walkover_penalty_settings",
    );
    expect(migration).toContain("points INTEGER NOT NULL CHECK (points > 0)");
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS public.championship_walkover_penalty_counts",
    );
    expect(migration).toContain("walkover_count INTEGER NOT NULL CHECK (walkover_count > 0)");
  });

  it("limits reads and writes to authenticated users with the existing permission", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE public.championship_walkover_penalty_settings");
    expect(migration).toContain("REVOKE ALL ON TABLE public.championship_walkover_penalty_counts");
    expect(migration).toContain(
      "NOT public.has_admin_tab_access('opening_ceremony_bonus'::public.admin_panel_tab, true)",
    );
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.save_interlaje_walkover_penalty_counts");
  });

  it("validates active registrations, championship status and zero reset", () => {
    expect(migration).toContain("editions_table.championship_id = _championship_id");
    expect(migration).toContain("editions_table.season_year = _season_year");
    expect(migration).toContain("teams_table.is_active IS DISTINCT FROM false");
    expect(migration).toContain("'PLANNING'::public.championship_status");
    expect(migration).toContain("'IN_PROGRESS'::public.championship_status");
    expect(migration).toContain("counts_input.walkover_count = 0");
    expect(migration).toContain("Configure a pontuação da penalidade por W.O. antes de informar as atléticas.");
  });

  it("deducts the configured amount before ranking the overall standings", () => {
    expect(migration).toContain("DROP FUNCTION IF EXISTS public.get_interlaje_overall_standings(UUID, INTEGER)");
    expect(migration).toContain("walkover_totals AS");
    expect(migration).toContain("counts_table.walkover_count * settings_table.points");
    expect(migration).toContain("- COALESCE(walkover_totals.walkover_penalty_points, 0) AS overall_points");
    expect(migration).toContain("walkover_count INTEGER");
    expect(migration).toContain("walkover_penalty_points NUMERIC");
  });

  it("keeps the penalty tables closed while the public standings RPC reads their aggregate", () => {
    expect(rlsFixMigration).toContain("SECURITY DEFINER");
    expect(rlsFixMigration).toContain("SET search_path = public");
    expect(rlsFixMigration).toContain(
      "REVOKE ALL ON FUNCTION public.get_interlaje_overall_standings(UUID, INTEGER)",
    );
    expect(rlsFixMigration).toContain("TO anon, authenticated");
  });

  it("audits changes to the W.O. value and counters", () => {
    expect(auditMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.save_interlaje_walkover_penalty_points",
    );
    expect(auditMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.save_interlaje_walkover_penalty_counts",
    );
    expect(auditMigration).toContain("PERFORM public.write_admin_action_log(");
    expect(auditMigration).toContain(
      "'public.championship_walkover_penalty_counts'",
    );
  });
});
