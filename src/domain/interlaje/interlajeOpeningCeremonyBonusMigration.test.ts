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
});
