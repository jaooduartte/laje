import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260913155843_preserve_immutable_knockout_after_group_disqualification.sql",
  ),
  "utf8",
);

describe("immutable knockout preservation after a group disqualification", () => {
  it("detects an existing live or completed knockout separately from team participation", () => {
    expect(migration).toContain("has_immutable_knockout BOOLEAN := false");
    expect(migration).toContain(
      "has_disqualified_team_in_knockout BOOLEAN := false",
    );
    expect(migration).toContain("matches_table.status <> 'SCHEDULED'::public.match_status");
  });

  it("blocks only a team that participates in the immutable knockout", () => {
    expect(migration).toContain("has_immutable_knockout AND has_disqualified_team_in_knockout");
    expect(migration).toContain(
      "A atlética participa de um jogo eliminatório que não pode ser alterado.",
    );
  });

  it("preserves the historical bracket while still applying group-stage walkovers", () => {
    expect(migration).toContain("IF has_immutable_knockout = false THEN");
    expect(migration).toContain(
      "public.refresh_championship_knockout_competition_after_disqualification(",
    );
  });
});
