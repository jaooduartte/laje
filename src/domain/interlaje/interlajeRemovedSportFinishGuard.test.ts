import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260916195617_skip_removed_interlaje_sports_on_finish.sql",
  ),
  "utf8",
);

describe("INTERLAJE finish guard with removed sports", () => {
  it("ignora modalidades removidas ao exigir sessões individuais", () => {
    expect(migration).toContain(
      "FROM public.championship_season_sport_removals AS removals_table",
    );
    expect(migration).toContain(
      "removals_table.sport_id = championship_sports_table.sport_id",
    );
    expect(migration).toContain(
      "removals_table.season_year = NEW.current_season_year",
    );
  });

  it("também ignora sessões residuais de modalidade removida na checagem de pendências", () => {
    expect(migration).toContain(
      "removals_table.sport_id = sessions_table.sport_id",
    );
    expect(migration).toContain(
      "modalidades individuais ativas do INTERLAJE ainda não encerradas",
    );
  });
});
