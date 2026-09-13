import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260913184220_fix_handball_card_suspensions.sql",
  ),
  "utf8",
);

describe("handball card suspension migration", () => {
  it("mantém o histórico e remove somente os efeitos de suspensão futura do Handebol", () => {
    expect(migration).toContain(
      "public.normalize_sport_name(athlete.value ->> 'sport_name') = 'handebol' AS is_handball",
    );
    expect(migration).toContain("WHEN discipline_athletes.is_handball THEN '0'::jsonb");
    expect(migration).toContain("WHEN discipline_athletes.is_handball THEN 'false'::jsonb");
    expect(migration).toContain("WHEN discipline_athletes.is_handball THEN '[]'::jsonb");
    expect(migration).toContain("WHEN discipline_athletes.is_handball THEN 'null'::jsonb");
    expect(migration).toContain("history.value - 'red_cards_derived'");
  });

  it("preserva a saída disciplinar existente para as demais modalidades", () => {
    expect(migration).toContain(
      "ELSE COALESCE(discipline_athletes.value -> 'is_suspended', 'false'::jsonb)",
    );
    expect(migration).toContain(
      "ELSE COALESCE(discipline_athletes.value -> 'suspension_causes', '[]'::jsonb)",
    );
    expect(migration).toContain(
      "ELSE COALESCE(discipline_athletes.value -> 'next_match', 'null'::jsonb)",
    );
  });
});
