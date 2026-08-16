import type { ChampionshipSport } from "@/lib/types";

export interface LocationCatalogSportOption {
  id: string;
  name: string;
}

interface LocationCatalogCourtLike {
  sport_ids: string[];
}

interface LocationCatalogLocationLike {
  courts: LocationCatalogCourtLike[];
}

export function resolveLocationCatalogSportOptions(
  championshipSports: ChampionshipSport[],
  enabledSportIdSet: Set<string>,
): LocationCatalogSportOption[] {
  return championshipSports
    .filter((championshipSport) => enabledSportIdSet.has(championshipSport.sport_id))
    .map((championshipSport) => ({
      id: championshipSport.sport_id,
      name: championshipSport.sports?.name ?? "Modalidade",
    }))
    .sort((leftSportOption, rightSportOption) =>
      leftSportOption.name.localeCompare(rightSportOption.name, "pt-BR", {
        sensitivity: "base",
      }),
    );
}

export function resolveLocationCatalogSupportSummary(
  location: LocationCatalogLocationLike,
  sportOptions: LocationCatalogSportOption[],
): string {
  const sportNameBySportId = sportOptions.reduce<Record<string, string>>(
    (carry, sportOption) => {
      carry[sportOption.id] = sportOption.name;
      return carry;
    },
    {},
  );

  const resourceCountBySportName = location.courts.reduce<Record<string, number>>(
    (carry, court) => {
      const supportedSportNames = [
        ...new Set(
          court.sport_ids
            .map((sportId) => sportNameBySportId[sportId])
            .filter(Boolean),
        ),
      ];

      supportedSportNames.forEach((sportName) => {
        carry[sportName] = (carry[sportName] ?? 0) + 1;
      });

      return carry;
    },
    {},
  );

  return Object.entries(resourceCountBySportName)
    .sort(([leftSportName], [rightSportName]) =>
      leftSportName.localeCompare(rightSportName, "pt-BR", {
        sensitivity: "base",
      }),
    )
    .map(
      ([sportName, resourceCount]) =>
        `${resourceCount} recurso${resourceCount == 1 ? "" : "s"} ${sportName}`,
    )
    .join(" • ");
}
