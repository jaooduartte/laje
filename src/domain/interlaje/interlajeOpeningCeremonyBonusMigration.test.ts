import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const permissionMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260823120000_add_opening_ceremony_bonus_admin_permission.sql",
  ),
  "utf8",
);
const bonusMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260823120100_configure_interlaje_opening_ceremony_bonus.sql",
  ),
  "utf8",
);
const correctionMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260824120000_fix_interlaje_opening_ceremony_bonus_eligibility.sql",
  ),
  "utf8",
);

describe("interlaje opening ceremony bonus migration", () => {
  it("creates an independent permission and seasonal positive integer configuration", () => {
    expect(permissionMigration).toContain("'opening_ceremony_bonus'");
    expect(bonusMigration).toContain(
      "CREATE TABLE IF NOT EXISTS public.championship_opening_ceremony_bonus_settings",
    );
    expect(bonusMigration).toContain("points INTEGER NOT NULL CHECK (points > 0)");
    expect(bonusMigration).toContain(
      "'opening_ceremony_bonus'::public.admin_panel_tab",
    );
  });

  it("enforces permission, championship status and full recalculation in the RPCs", () => {
    expect(bonusMigration).toContain(
      "NOT public.has_admin_tab_access('opening_ceremony_bonus'::public.admin_panel_tab, true)",
    );
    expect(bonusMigration).toContain(
      "'PLANNING'::public.championship_status",
    );
    expect(bonusMigration).toContain(
      "'REVIEW'::public.championship_status",
    );
    expect(bonusMigration).toContain(
      "'IN_PROGRESS'::public.championship_status",
    );
    expect(bonusMigration).toContain("SET points = _points, updated_at = now()");
    expect(bonusMigration).toContain(
      "'Presença confirmada na abertura.'",
    );
  });

  it("limits the opening bonus to active teams registered for the championship season", () => {
    expect(correctionMigration).toContain(
      "FROM public.championship_bracket_team_registrations AS registrations_table",
    );
    expect(correctionMigration).toContain(
      "editions_table.championship_id = _championship_id",
    );
    expect(correctionMigration).toContain(
      "editions_table.season_year = _season_year",
    );
    expect(correctionMigration).toContain(
      "teams_table.is_active IS DISTINCT FROM false",
    );
    expect(correctionMigration).toContain(
      "Atlética ativa não está inscrita nesta edição do INTERLAJE.",
    );
  });

  it("keeps removal available and limits positive integer points to the opening bonus", () => {
    expect(correctionMigration).toContain("IF _eligible IS NOT TRUE THEN");
    expect(correctionMigration).toContain("DELETE FROM public.championship_overall_score_adjustments");
    expect(correctionMigration).toContain(
      "adjustment_type <> 'OPENING_CEREMONY'",
    );
    expect(correctionMigration).toContain("points > 0 AND points = trunc(points)");
  });
});
