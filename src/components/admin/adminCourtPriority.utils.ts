import type { ChampionshipBracketCompetition } from "@/lib/types";
import { MatchNaipe, type TeamDivision } from "@/lib/enums";

const NAIPE_PRIORITY_ORDER: MatchNaipe[] = [
  MatchNaipe.FEMININO,
  MatchNaipe.MASCULINO,
];

export function resolveNaipeOptionsBySportId(
  competitions: ChampionshipBracketCompetition[],
): Record<string, MatchNaipe[]> {
  const optionsBySportId =
    competitions.reduce<Record<string, MatchNaipe[]>>((carry, competition) => {
      const currentNaipes = carry[competition.sport_id] ?? [];

      if (!currentNaipes.includes(competition.naipe)) {
        carry[competition.sport_id] = [...currentNaipes, competition.naipe];
      }

      return carry;
    }, {});

  Object.keys(optionsBySportId).forEach((sportId) => {
    optionsBySportId[sportId] = [...optionsBySportId[sportId]].sort(
      (left, right) =>
        NAIPE_PRIORITY_ORDER.indexOf(left) -
        NAIPE_PRIORITY_ORDER.indexOf(right),
    );
  });

  return optionsBySportId;
}

export function resolveDivisionOptionsBySportId(
  competitions: ChampionshipBracketCompetition[],
): Record<string, TeamDivision[]> {
  return competitions.reduce<Record<string, TeamDivision[]>>((carry, competition) => {
    if (competition.division == null) {
      return carry;
    }

    const currentDivisions = carry[competition.sport_id] ?? [];

    if (!currentDivisions.includes(competition.division)) {
      carry[competition.sport_id] = [...currentDivisions, competition.division];
    }

    return carry;
  }, {});
}

export type CourtPriorityMode = "NONE" | "NAIPE" | "DIVISION";

interface CourtPriorityPreferenceEntry {
  preferred_naipe: MatchNaipe | null;
  preferred_division: TeamDivision | null;
}

interface ResolveCourtPriorityModeParams {
  entries: CourtPriorityPreferenceEntry[];
  usesDivisions: boolean;
}

export function resolveCourtPriorityMode({
  entries,
  usesDivisions,
}: ResolveCourtPriorityModeParams): CourtPriorityMode {
  const hasPreferredNaipe = entries.some((entry) => entry.preferred_naipe != null);
  const hasPreferredDivision = entries.some((entry) => entry.preferred_division != null);

  if (!hasPreferredNaipe && !hasPreferredDivision) {
    return "NONE";
  }

  if (hasPreferredNaipe && !hasPreferredDivision) {
    return "NAIPE";
  }

  if (usesDivisions && hasPreferredDivision && !hasPreferredNaipe) {
    return "DIVISION";
  }

  return "NONE";
}

interface BuildCourtPriorityPreferencesForModeParams {
  entries: CourtPriorityPreferenceEntry[];
  mode: CourtPriorityMode;
  naipeOptions: MatchNaipe[];
  divisionOptions: TeamDivision[];
}

export function buildCourtPriorityPreferencesForMode({
  entries,
  mode,
  naipeOptions,
  divisionOptions,
}: BuildCourtPriorityPreferencesForModeParams): CourtPriorityPreferenceEntry[] {
  if (mode === "NAIPE" && naipeOptions.length > 0) {
    return entries.map((entry, index) => ({
      ...entry,
      preferred_naipe: naipeOptions[index % naipeOptions.length] ?? null,
      preferred_division: null,
    }));
  }

  if (mode === "DIVISION" && divisionOptions.length > 0) {
    return entries.map((entry, index) => ({
      ...entry,
      preferred_naipe: null,
      preferred_division: divisionOptions[index % divisionOptions.length] ?? null,
    }));
  }

  return entries.map((entry) => ({
    ...entry,
    preferred_naipe: null,
    preferred_division: null,
  }));
}

interface CourtPriorityRankParams {
  matchNaipe: MatchNaipe;
  matchDivision: TeamDivision | null;
  preferredNaipe: MatchNaipe | null;
  preferredDivision: TeamDivision | null;
}

export function resolveCourtPriorityRank({
  matchNaipe,
  matchDivision,
  preferredNaipe,
  preferredDivision,
}: CourtPriorityRankParams): number {
  if (preferredNaipe == null && preferredDivision == null) {
    return 1;
  }

  const matchesPreferredNaipe = preferredNaipe == null || preferredNaipe == matchNaipe;
  const matchesPreferredDivision = preferredDivision == null || preferredDivision == matchDivision;

  return matchesPreferredNaipe && matchesPreferredDivision ? 0 : 2;
}
