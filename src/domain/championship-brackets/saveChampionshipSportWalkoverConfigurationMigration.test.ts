import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260912153107_save_championship_sport_walkover_configuration.sql",
  ),
  "utf8",
);

describe("save championship sport walkover configuration migration", () => {
  it("permite apenas a edição de Modalidades e restringe a operação à temporada atual", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.save_championship_sport_walkover_configuration(",
    );
    expect(migration).toContain(
      "public.has_admin_tab_access('sports'::public.admin_panel_tab, true)",
    );
    expect(migration).toContain("SECURITY DEFINER\nSET search_path = ''");
    expect(migration).toContain(
      "A atualização de W.O. só pode ser aplicada à temporada atual.",
    );
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.save_championship_sport_walkover_configuration(UUID, INTEGER, INTEGER, INTEGER, BOOLEAN) FROM PUBLIC",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.save_championship_sport_walkover_configuration(UUID, INTEGER, INTEGER, INTEGER, BOOLEAN) TO authenticated",
    );
  });

  it("recalcula apenas W.O.s simples encerrados e refaz os sets quando necessário", () => {
    expect(migration).toContain("matches_table.status = 'FINISHED'::public.match_status");
    expect(migration).toContain("matches_table.is_walkover = true");
    expect(migration).toContain("matches_table.is_double_walkover = false");
    expect(migration).toContain("DELETE FROM public.match_sets AS match_sets_table");
    expect(migration).toContain(
      "FROM generate_series(1, championship_sport_record.walkover_winner_set_count)",
    );
    expect(migration).toContain("updated_matches_count");
  });
});
