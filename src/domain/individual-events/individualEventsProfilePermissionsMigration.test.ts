import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260820234801_backfill_individual_event_profile_permissions.sql",
);

describe("individual events profile permissions migration", () => {
  it("preserva o nível efetivo de Jogos ao preencher permissões ausentes", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("'individual_events'::public.admin_panel_tab");
    expect(migration).toContain("matches_permissions.access_level");
    expect(migration).toContain("individual_events_permissions.profile_id IS NULL");
  });
});
