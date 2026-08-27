import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appliedMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260826120000_simplify_individual_live_entries.sql",
  ),
  "utf8",
);

const correctionMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260826181935_add_individual_athlete_identification_and_disqualification.sql",
  ),
  "utf8",
);

const disqualificationMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260826185047_extend_team_disqualifications_to_individual_events.sql",
  ),
  "utf8",
);

describe("individual live entries migration", () => {
  it("stores lane, athlete identity and the three field attempts", () => {
    expect(appliedMigration).toContain("ADD COLUMN IF NOT EXISTS lane_number");
    expect(appliedMigration).toContain("attempt_one_centimeters");
    expect(appliedMigration).toContain("attempt_two_centimeters");
    expect(appliedMigration).toContain("attempt_three_centimeters");
    expect(correctionMigration).toContain("athlete_id UUID");
    expect(correctionMigration).toContain("starter_athlete_ids UUID[]");
    expect(correctionMigration).toContain("COALESCE(cardinality(entry_row.starter_athlete_ids), 0) != 4");
    expect(correctionMigration).toContain("Atleta inválido para o contexto da prova.");
  });

  it("enforces the operational rules for entries and standings", () => {
    expect(correctionMigration).toContain("no máximo 3 atletas por prova individual de Natação");
    expect(correctionMigration).toContain("somente um registro em prova de revezamento");
    expect(correctionMigration).toContain("ao menos 2 atléticas diferentes confirmadas");
    expect(correctionMigration).toContain("Empates devem ser resolvidos pela arbitragem");
    expect(correctionMigration).toContain(
      "recalculate_championship_individual_standings",
    );
    expect(correctionMigration).toContain(
      "recalculate_championship_individual_athlete_limits",
    );
    expect(correctionMigration).toContain("COUNT(DISTINCT entry_id) > 4");
    expect(correctionMigration).toContain("máximo 18 atletas por modalidade e naipe");
    expect(correctionMigration).toContain("members_table.is_starter = true");
    expect(correctionMigration).toContain("'LIVE'::public.championship_individual_session_status");
  });

  it("blocks individual registrations for a disqualified athletic association", () => {
    expect(disqualificationMigration).toContain(
      "disqualify_championship_individual_team_competition",
    );
    expect(disqualificationMigration).toContain(
      "prevent_disqualified_individual_entry_write",
    );
    expect(disqualificationMigration).toContain(
      "get_championship_individual_session_participants",
    );
    expect(disqualificationMigration).toContain(
      "'REVIEW'::public.championship_status",
    );
    expect(disqualificationMigration).toContain(
      "A atlética está desclassificada desta modalidade e naipe.",
    );
    expect(disqualificationMigration).toContain(
      "DELETE FROM public.championship_overall_competition_placements",
    );
  });
});
