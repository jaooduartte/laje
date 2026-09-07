import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260907223602_fix_live_knockout_penalty_shootout_persistence.sql",
  ),
  "utf8",
);

describe("live knockout penalty shootout persistence migration", () => {
  it("preserves penalty scores while an eligible knockout match is live and tied", () => {
    expect(migrationSource).toContain(
      "ELSIF NEW.status = ''LIVE''::public.match_status",
    );
    expect(migrationSource).toContain(
      "AND is_penalty_shootout_knockout_match",
    );
    expect(migrationSource).toContain(
      "AND NEW.home_score = NEW.away_score THEN",
    );
  });

  it("keeps the official tie-break result exclusive to finishing the match", () => {
    expect(migrationSource).toContain(
      "NEW.resolved_tie_breaker_rule := NULL;",
    );
    expect(migrationSource).toContain(
      "NEW.resolved_tie_break_winner_team_id := NULL;",
    );
  });
});
