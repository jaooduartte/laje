import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260829151603_add_walkover_winner_set_count.sql",
  ),
  "utf8",
);

describe("walkover winner set count migration", () => {
  it("stores a positive set count with a compatible default", () => {
    expect(migration).toContain(
      "ADD COLUMN walkover_winner_set_count INTEGER NOT NULL DEFAULT 1",
    );
    expect(migration).toContain("CHECK (walkover_winner_set_count > 0)");
    expect(migration).toContain("walkover_winner_points = 21");
    expect(migration).toContain("walkover_winner_set_count = 2");
    expect(migration).toContain(
      "championships_table.code = 'INTERLAJE'::public.championship_code",
    );
    expect(migration).toContain("sports_table.name = 'Voleibol'");
  });

  it("uses the configured set count for automatic walkovers", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.disqualify_championship_collective_team_competition(",
    );
    expect(migration).not.toContain(
      "CREATE OR REPLACE FUNCTION public.disqualify_championship_team_competition(",
    );
    expect(migration).toContain(
      "COALESCE(championship_sports_table.walkover_winner_set_count, 1)",
    );
    expect(migration).toContain(
      "THEN walkover_winner_set_count ELSE 0",
    );
    expect(migration).toContain(
      "FROM generate_series(1, walkover_winner_set_count) AS generated_sets(set_number)",
    );
  });
});
