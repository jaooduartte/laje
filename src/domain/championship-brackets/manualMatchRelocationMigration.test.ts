import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260830174858_manual_match_relocation.sql",
  ),
  "utf8",
);

describe("manual match relocation migration", () => {
  it("persists the protected manual scheduling exception and its reason", () => {
    expect(migration).toContain("is_manual_schedule_override BOOLEAN NOT NULL DEFAULT false");
    expect(migration).toContain("manual_schedule_override_reason");
    expect(migration).toContain("WEATHER");
    expect(migration).toContain("COURT_UNAVAILABLE");
  });

  it("provides a versioned preview and an atomic apply operation", () => {
    expect(migration).toContain("preview_manual_match_relocation");
    expect(migration).toContain("apply_manual_match_relocation");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("A prévia está desatualizada");
  });

  it("keeps automatic changes from rewriting a protected relocation", () => {
    expect(migration).toContain("prevent_manual_schedule_override_rewrite");
    expect(migration).toContain("A agenda deste jogo é uma realocação manual protegida.");
    expect(migration).toContain("is_manual_schedule_override, false");
  });

  it("returns an operational preview with final time and non-negotiable blockers", () => {
    expect(migration).toContain("next_day_end");
    expect(migration).toContain("representation_warning");
    expect(migration).toContain("A realocação ultrapassa meia-noite");
    expect(migration).toContain("is_championship_team_rest_gap_conflict");
  });
});
