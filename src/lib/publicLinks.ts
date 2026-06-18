import { CHAMPIONSHIP_CODE_LABELS } from "@/lib/championship";
import { PublicLinkFilterMode } from "@/lib/enums";
import type { Championship, PublicLinkItem, PublicLinkItemFilter, PublicLinkSection } from "@/lib/types";

export const PUBLIC_LINK_FILTER_MODE_LABELS: Record<PublicLinkFilterMode, string> = {
  [PublicLinkFilterMode.GLOBAL]: "Sem vínculo de filtro",
  [PublicLinkFilterMode.BY_CHAMPIONSHIP_YEAR]: "Vincular campeonato e ano",
};

export interface PublicLinksFilterState {
  championshipId: string;
  seasonYear: string;
}

function resolveSortOrder(firstValue: number, secondValue: number) {
  return firstValue - secondValue;
}

function resolveDateSortOrder(firstValue: string, secondValue: string) {
  return firstValue.localeCompare(secondValue);
}

function sortPublicLinkItemFilters(publicLinkItemFilters: PublicLinkItemFilter[] = []): PublicLinkItemFilter[] {
  return [...publicLinkItemFilters].sort((firstPublicLinkItemFilter, secondPublicLinkItemFilter) => {
    const seasonYearOrder = resolveSortOrder(firstPublicLinkItemFilter.season_year, secondPublicLinkItemFilter.season_year);

    if (seasonYearOrder != 0) {
      return seasonYearOrder;
    }

    return firstPublicLinkItemFilter.championship_id.localeCompare(secondPublicLinkItemFilter.championship_id);
  });
}

function sortPublicLinkItems(publicLinkItems: PublicLinkItem[] = []): PublicLinkItem[] {
  return [...publicLinkItems]
    .map((publicLinkItem) => ({
      ...publicLinkItem,
      public_link_item_filters: sortPublicLinkItemFilters(publicLinkItem.public_link_item_filters),
    }))
    .sort((firstPublicLinkItem, secondPublicLinkItem) => {
      const sortOrder = resolveSortOrder(firstPublicLinkItem.sort_order, secondPublicLinkItem.sort_order);

      if (sortOrder != 0) {
        return sortOrder;
      }

      return resolveDateSortOrder(firstPublicLinkItem.created_at, secondPublicLinkItem.created_at);
    });
}

export function sortPublicLinkSections(publicLinkSections: PublicLinkSection[] = []): PublicLinkSection[] {
  return [...publicLinkSections]
    .map((publicLinkSection) => ({
      ...publicLinkSection,
      public_link_items: sortPublicLinkItems(publicLinkSection.public_link_items),
    }))
    .sort((firstPublicLinkSection, secondPublicLinkSection) => {
      const sortOrder = resolveSortOrder(firstPublicLinkSection.sort_order, secondPublicLinkSection.sort_order);

      if (sortOrder != 0) {
        return sortOrder;
      }

      return resolveDateSortOrder(firstPublicLinkSection.created_at, secondPublicLinkSection.created_at);
    });
}

export function isValidPublicLinkUrl(value: string): boolean {
  const trimmedValue = value.trim();

  if (trimmedValue.length == 0) {
    return false;
  }

  try {
    const normalizedUrl = new URL(trimmedValue);
    return normalizedUrl.protocol == "http:" || normalizedUrl.protocol == "https:";
  } catch {
    return false;
  }
}

function matchesPublicLinkFilter(
  publicLinkItem: PublicLinkItem,
  { championshipId, seasonYear }: PublicLinksFilterState,
): boolean {
  const hasActiveFilter = championshipId != "ALL" || seasonYear != "ALL";

  if (!hasActiveFilter) {
    return true;
  }

  if (publicLinkItem.filter_mode == PublicLinkFilterMode.GLOBAL) {
    return true;
  }

  const publicLinkItemFilters = publicLinkItem.public_link_item_filters ?? [];

  if (publicLinkItemFilters.length == 0) {
    return false;
  }

  return publicLinkItemFilters.some((publicLinkItemFilter) => {
    const matchesChampionship = championshipId == "ALL" || publicLinkItemFilter.championship_id == championshipId;
    const matchesSeasonYear = seasonYear == "ALL" || String(publicLinkItemFilter.season_year) == seasonYear;

    return matchesChampionship && matchesSeasonYear;
  });
}

export function resolveVisiblePublicLinkSections(
  publicLinkSections: PublicLinkSection[],
  filterState: PublicLinksFilterState,
): PublicLinkSection[] {
  return sortPublicLinkSections(publicLinkSections)
    .map((publicLinkSection) => ({
      ...publicLinkSection,
      public_link_items: (publicLinkSection.public_link_items ?? []).filter((publicLinkItem) =>
        matchesPublicLinkFilter(publicLinkItem, filterState),
      ),
    }))
    .filter((publicLinkSection) => (publicLinkSection.public_link_items ?? []).length > 0);
}

export function resolveAvailablePublicLinkFilterYears(
  publicLinkSections: PublicLinkSection[],
  championshipId: string,
): number[] {
  const seasonYears = new Set<number>();

  publicLinkSections.forEach((publicLinkSection) => {
    (publicLinkSection.public_link_items ?? []).forEach((publicLinkItem) => {
      (publicLinkItem.public_link_item_filters ?? []).forEach((publicLinkItemFilter) => {
        if (championshipId != "ALL" && publicLinkItemFilter.championship_id != championshipId) {
          return;
        }

        seasonYears.add(publicLinkItemFilter.season_year);
      });
    });
  });

  return [...seasonYears].sort((firstSeasonYear, secondSeasonYear) => secondSeasonYear - firstSeasonYear);
}

export function resolveAvailablePublicLinkFilterChampionships(
  publicLinkSections: PublicLinkSection[],
  championships: Championship[],
): Championship[] {
  const linkedChampionshipIds = new Set<string>();

  publicLinkSections.forEach((publicLinkSection) => {
    (publicLinkSection.public_link_items ?? []).forEach((publicLinkItem) => {
      (publicLinkItem.public_link_item_filters ?? []).forEach((publicLinkItemFilter) => {
        linkedChampionshipIds.add(publicLinkItemFilter.championship_id);
      });
    });
  });

  return championships.filter((championship) => linkedChampionshipIds.has(championship.id));
}

export { CHAMPIONSHIP_CODE_LABELS };
