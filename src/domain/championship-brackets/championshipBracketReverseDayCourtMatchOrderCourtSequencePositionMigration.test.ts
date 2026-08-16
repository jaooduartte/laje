import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260816150000_add_reverse_day_court_match_order_court_sequence_positions.sql"),
  "utf8",
);

describe("reverse day court match order court sequence positions migration", () => {
  it("retorna a posição sequencial de cada jogo dentro da própria quadra", () => {
    expect(migration).toContain("court_positions AS");
    expect(migration).toContain("PARTITION BY\n          matches_table.scheduled_date");
    expect(migration).toContain("AS court_sequence_position");
    expect(migration).toContain("'court_sequence_position', CASE");
  });

  it("usa a mesma ordenação da inversão para exibir as posições", () => {
    expect(migration).toContain("matches_table.global_queue_order ASC NULLS LAST");
    expect(migration).toContain("matches_table.status = 'SCHEDULED'::public.match_status");
    expect(migration).toContain("WHEN _action = 'REVERSE_DAY_COURT_MATCH_ORDER'");
  });
});
