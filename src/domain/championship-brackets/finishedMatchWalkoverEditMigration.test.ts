import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260906162810_edit_finished_match_walkover.sql",
  ),
  "utf8",
);

describe("finished match walkover edit migration", () => {
  it("limits the transactional operation to administrators with Jogos edit permission", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.save_finished_match_walkover(",
    );
    expect(migration).toContain(
      "public.has_admin_tab_access('matches'::public.admin_panel_tab, true)",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.save_finished_match_walkover(UUID, TEXT) TO authenticated",
    );
  });

  it("supports the four walkover modes and resets dependent records", () => {
    expect(migration).toContain(
      "('NONE', 'HOME_LOST', 'AWAY_LOST', 'DOUBLE')",
    );
    expect(migration).toContain("DELETE FROM public.match_sets WHERE match_id = _match_id");
    expect(migration).toContain(
      "DELETE FROM public.match_award_goal_scorers WHERE match_id = _match_id",
    );
    expect(migration).toContain(
      "DELETE FROM public.match_yellow_card_players WHERE match_id = _match_id",
    );
    expect(migration).toContain(
      "DELETE FROM public.match_red_card_players WHERE match_id = _match_id",
    );
    expect(migration).toContain(
      "DELETE FROM public.match_blue_card_players WHERE match_id = _match_id",
    );
    expect(migration).toContain("is_score_sheet_reviewed = false");
  });

  it("creates configured set results and preserves knockout invariants", () => {
    expect(migration).toContain("FROM generate_series(1, winner_set_count)");
    expect(migration).toContain(
      "Não é possível aplicar W.O. duplo em jogos do mata-mata.",
    );
    expect(migration).toContain(
      "Não é possível remover o W.O. de um jogo de mata-mata encerrado sem definir um resultado válido.",
    );
  });
});
