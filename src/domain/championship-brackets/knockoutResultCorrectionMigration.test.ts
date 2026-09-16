import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260916223000_add_knockout_result_correction_flow.sql",
  ),
  "utf8",
);

describe("knockout result correction migration", () => {
  it("adds preview, apply and audit infrastructure without hardcoded competition ids", () => {
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS public.championship_knockout_result_corrections",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.preview_knockout_result_correction(",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.apply_knockout_result_correction(",
    );
    expect(migration).not.toContain("c7718ca6-4447-4c20-a8ca-5781a34a3778");
    expect(migration).not.toContain("a6d102a2-fce6-475e-a079-dec2eda7dfef");
  });

  it("archives invalidated matches, keeps the bracket nodes and preserves unaffected winners", () => {
    expect(migration).toContain("archived_matches JSONB NOT NULL");
    expect(migration).toContain("SET match_id = NULL");
    expect(migration).toContain("DELETE FROM public.matches AS matches_table");
    expect(migration).toContain("home_team_id = source_home.winner_team_id");
    expect(migration).toContain("away_team_id = source_away.winner_team_id");
  });

  it("requires a fresh schedule candidate when a played descendant must be replayed", () => {
    expect(migration).toContain("requires_replay_schedule");
    expect(migration).toContain("generate_series(");
    expect(migration).toContain("championship_bracket_day_breaks");
    expect(migration).toContain("O horário selecionado não está mais disponível. Gere uma nova prévia.");
  });
});
