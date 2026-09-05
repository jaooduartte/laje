import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260905181009_add_operational_schedule_intervals.sql",
  ),
  "utf8",
);

describe("operational schedule interval migration", () => {
  it("exposes authorized preview and apply functions with optimistic revision", () => {
    expect(migrationSource).toContain("preview_operational_schedule_interval");
    expect(migrationSource).toContain("apply_operational_schedule_interval");
    expect(migrationSource).toContain("championship_schedule'::public.admin_panel_tab");
    expect(migrationSource).toContain("reprogramming_revision <> _expected_revision");
    expect(migrationSource).toContain("SET reprogramming_revision = reprogramming_revision + 1");
    expect(migrationSource).toContain("GRANT EXECUTE ON FUNCTION public.apply_operational_schedule_interval");
  });

  it("supports general and court-specific intervals while retaining legacy compatibility", () => {
    expect(migrationSource).toContain("'ALL_COURTS'::public.bracket_day_break_scope_type");
    expect(migrationSource).toContain("'COURT'::public.bracket_day_break_scope_type");
    expect(migrationSource).toContain("concat('legacy:', day_record.id)");
    expect(migrationSource).toContain("interval_id_value LIKE 'legacy:%'");
  });

  it("recalculates selected courts and persists every match status without changing scores", () => {
    expect(migrationSource).toContain("matches_table.status::TEXT");
    expect(migrationSource).toContain("AND courts_table.id = ANY(target_court_ids)");
    expect(migrationSource).toContain("UPDATE public.matches");
    expect(migrationSource).toContain("queue_position = (timeline_item->>'queue_position')::INTEGER");
    expect(migrationSource).toContain("matches_table.end_time,");
    expect(migrationSource).not.toContain("home_score =");
    expect(migrationSource).not.toContain("away_score =");
  });

  it("blocks invalid confirmations and records the resulting schedule", () => {
    expect(migrationSource).toContain("A reorganização ultrapassa a data selecionada.");
    expect(migrationSource).toContain("A reorganização conflita com uma sessão individual da quadra.");
    expect(migrationSource).toContain("A reorganização conflita com uma reserva fixa da quadra.");
    expect(migrationSource).toContain("resolve_scheduled_match_rest_gap_conflict");
    expect(migrationSource).toContain("conflito de representação na mesma quadra");
    expect(migrationSource).toContain("Confirme a ampliação do fim do dia antes de aplicar.");
    expect(migrationSource).toContain("write_admin_action_log");
  });
});
