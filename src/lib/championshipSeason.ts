import { aggregateStandingsByTeam, moveDisqualifiedStandingsToBottom, type TeamStandingAggregate } from "@/lib/standings";
import type { Championship, ChampionshipSeasonSettings, Standing } from "@/lib/types";
import {
  ChampionshipCode,
  ChampionshipSeasonDivisionFormat,
  ChampionshipSeasonDivisionSettlementMode,
  ChampionshipSportTieBreakerRule,
  TeamDivision,
} from "@/lib/enums";

export interface ChampionshipSeasonSettingsShape {
  division_format: ChampionshipSeasonDivisionFormat;
  division_settlement_mode: ChampionshipSeasonDivisionSettlementMode;
  principal_slots_count: number | null;
  principal_relegation_count: number | null;
  access_promotion_count: number | null;
}

export interface ChampionshipSeasonDivisionMovementPreview {
  team_id: string;
  team_name: string;
  previous_division: TeamDivision | null;
  next_division: TeamDivision | null;
  source_division: TeamDivision | null;
  ranking_position: number;
  rule_code: string;
}

export function resolveChampionshipSeasonSettingsFromBracketPayload(
  payloadSnapshot?: Record<string, unknown> | null,
): ChampionshipSeasonSettingsShape | null {
  const seasonSettings = payloadSnapshot?.season_settings;

  if (
    !seasonSettings ||
    typeof seasonSettings != "object" ||
    Array.isArray(seasonSettings)
  ) {
    return null;
  }

  const values = seasonSettings as Record<string, unknown>;
  const divisionFormat = values.division_format;
  const divisionSettlementMode = values.division_settlement_mode;

  if (
    (divisionFormat != ChampionshipSeasonDivisionFormat.UNIFIED &&
      divisionFormat != ChampionshipSeasonDivisionFormat.SEPARATED) ||
    (divisionSettlementMode != ChampionshipSeasonDivisionSettlementMode.NONE &&
      divisionSettlementMode !=
        ChampionshipSeasonDivisionSettlementMode.TOP_N_TO_PRINCIPAL &&
      divisionSettlementMode !=
        ChampionshipSeasonDivisionSettlementMode.PROMOTION_RELEGATION)
  ) {
    return null;
  }

  const resolveOptionalCount = (value: unknown) =>
    typeof value == "number" && Number.isInteger(value) ? value : null;

  return {
    division_format: divisionFormat,
    division_settlement_mode: divisionSettlementMode,
    principal_slots_count: resolveOptionalCount(values.principal_slots_count),
    principal_relegation_count: resolveOptionalCount(
      values.principal_relegation_count,
    ),
    access_promotion_count: resolveOptionalCount(values.access_promotion_count),
  };
}

export function resolveDefaultChampionshipSeasonSettings(
  championshipCode?: ChampionshipCode,
): ChampionshipSeasonSettingsShape {
  if (championshipCode == ChampionshipCode.INTERLAJE) {
    return {
      division_format: ChampionshipSeasonDivisionFormat.SEPARATED,
      division_settlement_mode:
        ChampionshipSeasonDivisionSettlementMode.PROMOTION_RELEGATION,
      principal_slots_count: null,
      principal_relegation_count: 2,
      access_promotion_count: 2,
    };
  }

  return {
    division_format: ChampionshipSeasonDivisionFormat.UNIFIED,
    division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.NONE,
    principal_slots_count: null,
    principal_relegation_count: null,
    access_promotion_count: null,
  };
}

export function resolveEffectiveChampionshipSeasonSettings({
  championship,
  seasonSettings,
}: {
  championship?: Pick<Championship, "code" | "uses_divisions"> | null;
  seasonSettings?: Pick<
    ChampionshipSeasonSettings,
    | "division_format"
    | "division_settlement_mode"
    | "principal_slots_count"
    | "principal_relegation_count"
    | "access_promotion_count"
  > | null;
}): ChampionshipSeasonSettingsShape {
  if (!seasonSettings) {
    if (championship?.code == ChampionshipCode.INTERLAJE) {
      return resolveDefaultChampionshipSeasonSettings(championship.code);
    }

    if (championship?.uses_divisions != null) {
      return {
        division_format: championship.uses_divisions
          ? ChampionshipSeasonDivisionFormat.SEPARATED
          : ChampionshipSeasonDivisionFormat.UNIFIED,
        division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.NONE,
        principal_slots_count: null,
        principal_relegation_count: null,
        access_promotion_count: null,
      };
    }

    return resolveDefaultChampionshipSeasonSettings(championship?.code);
  }

  return {
    division_format: seasonSettings.division_format,
    division_settlement_mode: seasonSettings.division_settlement_mode,
    principal_slots_count: seasonSettings.principal_slots_count,
    principal_relegation_count: seasonSettings.principal_relegation_count,
    access_promotion_count: seasonSettings.access_promotion_count,
  };
}

export function resolveChampionshipUsesSeasonDivisions({
  championship,
  seasonSettings,
}: {
  championship?: Pick<Championship, "code" | "uses_divisions"> | null;
  seasonSettings?: Pick<ChampionshipSeasonSettings, "division_format"> | null;
}) {
  if (!championship && !seasonSettings) {
    return false;
  }

  if (seasonSettings) {
    return (
      seasonSettings.division_format ==
      ChampionshipSeasonDivisionFormat.SEPARATED
    );
  }

  return resolveEffectiveChampionshipSeasonSettings({
    championship: championship ?? null,
    seasonSettings: null,
  }).division_format == ChampionshipSeasonDivisionFormat.SEPARATED;
}

export function resolveChampionshipOverallSeasonStandings(input: {
  standings: Standing[];
  correctedStandingsByKey?: Record<string, { points_base: number; corrected_points: number }>;
  disqualifiedTeamKeys?: ReadonlySet<string>;
}): TeamStandingAggregate[] {
  const standingsWithCorrectedPoints = input.correctedStandingsByKey
    ? input.standings.map((standing) => {
        const key = [
          standing.team_id,
          standing.sport_id,
          standing.naipe,
          standing.division ?? "WITHOUT_DIVISION",
        ].join(":");
        const correctedStanding = input.correctedStandingsByKey?.[key];

        if (!correctedStanding) {
          return standing;
        }

        return {
          ...standing,
          points:
            standing.points -
            Number(correctedStanding.points_base) +
            Number(correctedStanding.corrected_points),
        };
      })
    : input.standings;

  return moveDisqualifiedStandingsToBottom(
    aggregateStandingsByTeam(standingsWithCorrectedPoints, {
      tieBreakerRule: ChampionshipSportTieBreakerRule.STANDARD,
    }),
    input.disqualifiedTeamKeys,
  );
}

export function resolveSeasonDivisionMovementPreview({
  seasonSettings,
  standings,
}: {
  seasonSettings: ChampionshipSeasonSettingsShape;
  standings: TeamStandingAggregate[];
}): ChampionshipSeasonDivisionMovementPreview[] {
  if (
    seasonSettings.division_settlement_mode ==
    ChampionshipSeasonDivisionSettlementMode.NONE
  ) {
    return [];
  }

  if (
    seasonSettings.division_format == ChampionshipSeasonDivisionFormat.UNIFIED &&
    seasonSettings.division_settlement_mode ==
      ChampionshipSeasonDivisionSettlementMode.TOP_N_TO_PRINCIPAL
  ) {
    const principalSlotsCount = seasonSettings.principal_slots_count ?? 0;

    return standings.map((standing, standingIndex) => ({
      team_id: standing.team_id,
      team_name: standing.team_name,
      previous_division: standing.division,
      next_division:
        standingIndex < principalSlotsCount
          ? TeamDivision.DIVISAO_PRINCIPAL
          : TeamDivision.DIVISAO_ACESSO,
      source_division: standing.division,
      ranking_position: standingIndex + 1,
      rule_code: "TOP_N_TO_PRINCIPAL",
    }));
  }

  if (
    seasonSettings.division_format == ChampionshipSeasonDivisionFormat.SEPARATED &&
    seasonSettings.division_settlement_mode ==
      ChampionshipSeasonDivisionSettlementMode.PROMOTION_RELEGATION
  ) {
    const principalStandings = standings.filter(
      (standing) => standing.division == TeamDivision.DIVISAO_PRINCIPAL,
    );
    const accessStandings = standings.filter(
      (standing) => standing.division == TeamDivision.DIVISAO_ACESSO,
    );
    const relegatedTeams = principalStandings
      .slice(
        Math.max(
          0,
          principalStandings.length -
            (seasonSettings.principal_relegation_count ?? 0),
        ),
      )
      .map((standing) => ({
        team_id: standing.team_id,
        team_name: standing.team_name,
        previous_division: TeamDivision.DIVISAO_PRINCIPAL,
        next_division: TeamDivision.DIVISAO_ACESSO,
        source_division: TeamDivision.DIVISAO_PRINCIPAL,
        ranking_position:
          principalStandings.findIndex(
            (candidateStanding) => candidateStanding.team_id == standing.team_id,
          ) + 1,
        rule_code: "RELEGATED_FROM_PRINCIPAL",
      }));
    const promotedTeams = accessStandings
      .slice(0, seasonSettings.access_promotion_count ?? 0)
      .map((standing, standingIndex) => ({
        team_id: standing.team_id,
        team_name: standing.team_name,
        previous_division: TeamDivision.DIVISAO_ACESSO,
        next_division: TeamDivision.DIVISAO_PRINCIPAL,
        source_division: TeamDivision.DIVISAO_ACESSO,
        ranking_position: standingIndex + 1,
        rule_code: "PROMOTED_FROM_ACCESS",
      }));

    return [...promotedTeams, ...relegatedTeams];
  }

  return [];
}
