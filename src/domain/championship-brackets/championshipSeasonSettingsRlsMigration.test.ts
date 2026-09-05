import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260905201943_optimize_championship_season_settings_rls.sql",
  ),
  "utf8",
);

describe("championship season settings RLS migration", () => {
  it("avalia a identidade autenticada uma vez por política", () => {
    expect(migrationSource).toContain(
      "CREATE POLICY championship_season_settings_admin_select",
    );
    expect(migrationSource).toContain(
      "CREATE POLICY championship_season_settings_admin_insert",
    );
    expect(migrationSource).toContain(
      "CREATE POLICY championship_season_settings_admin_update",
    );
    expect(migrationSource.match(/\(select auth\.uid\(\)\)/g)).toHaveLength(4);
    expect(migrationSource).toContain(
      "public.has_admin_tab_access(\n    'matches'::public.admin_panel_tab,\n    true",
    );
  });
});
