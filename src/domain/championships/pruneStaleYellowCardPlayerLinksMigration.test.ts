import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260908185805_prune_stale_yellow_card_player_links.sql",
  ),
  "utf8",
);

describe("stale yellow card player links migration", () => {
  it("removes individual links that exceed the saved team counters", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.prune_stale_match_yellow_card_player_links()",
    );
    expect(migration).toContain("yellow_card_players.card_order > COALESCE(NEW.home_yellow_cards, 0)");
    expect(migration).toContain("yellow_card_players.card_order > COALESCE(NEW.away_yellow_cards, 0)");
  });

  it("runs after match counter edits and repairs existing inconsistent links", () => {
    expect(migration).toContain(
      "AFTER UPDATE OF home_yellow_cards, away_yellow_cards ON public.matches",
    );
    expect(migration).toContain(
      "EXECUTE FUNCTION public.prune_stale_match_yellow_card_player_links()",
    );
    expect(migration).toContain("USING public.matches AS matches_table");
  });
});
