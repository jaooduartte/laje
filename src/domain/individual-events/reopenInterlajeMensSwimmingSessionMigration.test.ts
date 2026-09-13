import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260913173500_reopen_interlaje_2026_mens_swimming_session.sql",
  ),
  "utf8",
);

describe("reopen Interlaje 2026 mens swimming session migration", () => {
  it("restaura somente a sessão masculina de Natação encerrada do INTERLAJE 2026", () => {
    expect(migration).toContain(
      "championships_table.code = 'INTERLAJE'::public.championship_code",
    );
    expect(migration).toContain("sessions_table.season_year = 2026");
    expect(migration).toContain(
      "public.normalize_sport_name(sports_table.name) = 'natacao'",
    );
    expect(migration).toContain(
      "sessions_table.naipe = 'MASCULINO'::public.match_naipe",
    );
    expect(migration).toContain(
      "sessions_table.status = 'FINISHED'::public.championship_individual_session_status",
    );
    expect(migration).toContain(
      "SET status = 'LIVE'::public.championship_individual_session_status",
    );
  });
});
