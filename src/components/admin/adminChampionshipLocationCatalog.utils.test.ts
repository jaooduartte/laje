import { describe, expect, it } from "vitest";
import { resolveLocationCatalogSportOptions, resolveLocationCatalogSupportSummary } from "@/components/admin/adminChampionshipLocationCatalog.utils";
import type { ChampionshipSport } from "@/lib/types";

describe("adminChampionshipLocationCatalog.utils", () => {
  it("inclui modalidades individuais habilitadas no catálogo de locais", () => {
    const championshipSports = [
      {
        sport_id: "sport-basket",
        sports: { name: "Basquetebol" },
      },
      {
        sport_id: "sport-swim",
        sports: { name: "Natação" },
      },
      {
        sport_id: "sport-track",
        sports: { name: "Atletismo" },
      },
    ] as ChampionshipSport[];

    expect(
      resolveLocationCatalogSportOptions(
        championshipSports,
        new Set(["sport-swim", "sport-track"]),
      ),
    ).toEqual([
      { id: "sport-track", name: "Atletismo" },
      { id: "sport-swim", name: "Natação" },
    ]);
  });

  it("resume recursos por modalidade com nomes visíveis", () => {
    expect(
      resolveLocationCatalogSupportSummary(
        {
          courts: [
            { sport_ids: ["sport-track"] },
            { sport_ids: ["sport-track", "sport-swim"] },
          ],
        },
        [
          { id: "sport-track", name: "Atletismo" },
          { id: "sport-swim", name: "Natação" },
        ],
      ),
    ).toBe("2 recursos Atletismo • 1 recurso Natação");
  });
});
