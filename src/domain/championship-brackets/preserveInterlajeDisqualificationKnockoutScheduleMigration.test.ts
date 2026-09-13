import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260913145921_preserve_interlaje_disqualification_knockout_schedule.sql",
  ),
  "utf8",
);

describe("knockout schedule preservation after a collective disqualification", () => {
  it("does not contain a team, sport, or competition-specific pairing plan", () => {
    expect(migration).not.toContain("disqualified_team_id");
    expect(migration).not.toContain("6414e4b1-5f9e-4d49-9650-498519d1586c");
    expect(migration).not.toContain("0956943a-3786-49fa-8a2c-9d1b6e3942ac");
    expect(migration).not.toContain("245a807e-4f08-4c42-990e-a034c9ef3349");
    expect(migration).not.toContain("a6d102a2-fce6-475e-a079-dec2eda7dfef");
  });

  it("uses the competition crossing mode to recalculate the first-round seed order", () => {
    expect(migration).toContain("competitions_table.knockout_pairing_mode");
    expect(migration).toContain(
      "public.resolve_championship_knockout_seed_order(",
    );
    expect(migration).toContain("competition_record.knockout_pairing_mode");
    expect(migration).toContain(
      "function_definition := replace(function_definition, linear_seed_fragment, configured_seed_fragment);",
    );
  });

  it("keeps scheduled knockout matches playable and applies walkovers only to group matches", () => {
    expect(migration).toContain(
      "A desclassificação exige que todos os jogos eliminatórios permaneçam agendados.",
    );
    expect(migration).toContain(
      "bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase",
    );
    expect(migration).toContain("OR has_generated_knockout = false");
  });
});
