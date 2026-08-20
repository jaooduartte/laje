import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Award, Medal, Trophy } from "lucide-react";
import {
  resolveChampionshipBracketFirstRoundSeedIndexes,
  resolveChampionshipBracketKnockoutProjection,
  resolveChampionshipBracketProjectedKnockoutSummary,
  resolveChampionshipBracketQualificationSummary,
  resolveChampionshipBracketSeedPlaceholderLabels,
} from "@/domain/championship-brackets/championshipBracketKnockoutProjection";
import {
  resolveCompetitionPodium,
  type ChampionshipCompetitionPodium,
  type ChampionshipPodiumTeam,
} from "@/lib/championshipPodium";
import type {
  ChampionshipBracketCompetition,
  ChampionshipBracketKnockoutMatch,
  ChampionshipBracketView,
} from "@/lib/types";
import {
  BracketThirdPlaceMode,
  MatchNaipe,
  MatchStatus,
  TeamDivision,
} from "@/lib/enums";
import {
  BRACKET_EDITION_STATUS_LABELS,
  BRACKET_THIRD_PLACE_MODE_LABELS,
  MATCH_NAIPE_LABELS,
  TEAM_DIVISION_LABELS,
  resolveMatchQueueLabel,
  resolveMatchScheduledDateValue,
  resolveKnockoutRoundLabel,
  resolveMatchStatusLabel,
} from "@/lib/championship";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  championshipBracketView: ChampionshipBracketView;
  loading?: boolean;
  emptyMessage?: string;
}

interface ProjectedKnockoutMatchDisplay {
  id: string;
  round_number: number;
  slot_number: number;
  is_bye: boolean;
  is_third_place: boolean;
  status: ChampionshipBracketKnockoutMatch["status"];
  scheduled_date: string | null;
  queue_position: number | null;
  scheduled_slot?: number | null;
  start_time: string | null;
  location: string | null;
  court_name: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  winner_team_name: string | null;
  home_placeholder_label: string;
  away_placeholder_label: string;
}

interface ProjectedKnockoutRoundDisplay {
  round_number: number;
  matches: ProjectedKnockoutMatchDisplay[];
}

interface PlacedBracketMatchDisplay extends ProjectedKnockoutMatchDisplay {
  resolved_home_label: string;
  resolved_away_label: string;
  card_width: number;
  x: number;
  y: number;
}

interface BracketConnectorDisplay {
  id: string;
  path: string;
}

interface DesktopBracketLayout {
  width: number;
  height: number;
  card_top_offset: number;
  left_matches: PlacedBracketMatchDisplay[][];
  right_matches: PlacedBracketMatchDisplay[][];
  final_match: PlacedBracketMatchDisplay | null;
  third_place_match: PlacedBracketMatchDisplay | null;
  connectors: BracketConnectorDisplay[];
}

const ALL_FILTER = "ALL_FILTER";
const DESKTOP_CARD_WIDTH = 208;
const DESKTOP_FINAL_CARD_WIDTH = 280;
const DESKTOP_CARD_HEIGHT = 236;
const DESKTOP_COLUMN_GAP = 40;
const DESKTOP_VERTICAL_GAP = 44;
const DESKTOP_TOP_OFFSET = 20;
const DESKTOP_THIRD_PLACE_GAP = 96;
const DESKTOP_LAYOUT_HORIZONTAL_PADDING = 32;

function resolveTotalRounds(bracketSize: number): number {
  let totalRounds = 1;

  while (2 ** totalRounds < bracketSize) {
    totalRounds += 1;
  }

  return totalRounds;
}

function resolveShortKnockoutRoundLabel(
  roundNumber: number,
  totalRounds: number,
): string {
  return resolveKnockoutRoundLabel(roundNumber, totalRounds).replace(
    " de final",
    "",
  );
}

function resolveWinnerSourceLabel(
  roundNumber: number,
  slotNumber: number,
  totalRounds: number,
): string {
  const shortRoundLabel = resolveShortKnockoutRoundLabel(
    roundNumber,
    totalRounds,
  );
  const article =
    shortRoundLabel == "Semifinal" || shortRoundLabel == "Final" ? "da" : "das";

  return `Vencedor ${article} ${shortRoundLabel} ${slotNumber}`;
}

function resolveFallbackKnockoutRounds(
  competition: ChampionshipBracketCompetition,
): ProjectedKnockoutRoundDisplay[] {
  const knockoutMatchesByRound = [...competition.knockout_matches].reduce<
    Record<number, ChampionshipBracketKnockoutMatch[]>
  >((currentKnockoutMatchesByRound, knockoutMatch) => {
    if (!currentKnockoutMatchesByRound[knockoutMatch.round_number]) {
      currentKnockoutMatchesByRound[knockoutMatch.round_number] = [];
    }

    currentKnockoutMatchesByRound[knockoutMatch.round_number].push(
      knockoutMatch,
    );
    return currentKnockoutMatchesByRound;
  }, {});

  const totalRounds = Math.max(
    1,
    ...competition.knockout_matches
      .filter((knockoutMatch) => !knockoutMatch.is_third_place)
      .map((knockoutMatch) => knockoutMatch.round_number),
  );

  return Object.keys(knockoutMatchesByRound)
    .map(Number)
    .sort((firstRound, secondRound) => firstRound - secondRound)
    .map((roundNumber) => ({
      round_number: roundNumber,
      matches: knockoutMatchesByRound[roundNumber]
        .sort(
          (firstMatch, secondMatch) =>
            firstMatch.slot_number - secondMatch.slot_number,
        )
        .map((knockoutMatch) => ({
          id: knockoutMatch.id,
          round_number: knockoutMatch.round_number,
          slot_number: knockoutMatch.slot_number,
          is_bye: knockoutMatch.is_bye,
          is_third_place: knockoutMatch.is_third_place,
          status: knockoutMatch.status,
          scheduled_date: knockoutMatch.scheduled_date,
          queue_position: knockoutMatch.queue_position,
          scheduled_slot: knockoutMatch.scheduled_slot,
          start_time: knockoutMatch.start_time,
          location: knockoutMatch.location,
          court_name: knockoutMatch.court_name,
          home_team_id: knockoutMatch.home_team_id,
          away_team_id: knockoutMatch.away_team_id,
          home_team_name: knockoutMatch.home_team_name,
          away_team_name: knockoutMatch.away_team_name,
          winner_team_name: knockoutMatch.winner_team_name,
          home_placeholder_label: resolveWinnerSourceLabel(
            Math.max(1, knockoutMatch.round_number - 1),
            Math.max(1, knockoutMatch.slot_number * 2 - 1),
            totalRounds,
          ),
          away_placeholder_label: resolveWinnerSourceLabel(
            Math.max(1, knockoutMatch.round_number - 1),
            Math.max(1, knockoutMatch.slot_number * 2),
            totalRounds,
          ),
        })),
    }));
}

function resolveProjectedKnockoutRounds(
  competition: ChampionshipBracketCompetition,
): ProjectedKnockoutRoundDisplay[] {
  const knockoutProjection = resolveChampionshipBracketKnockoutProjection({
    groups_count: competition.groups_count,
    qualifiers_per_group: competition.qualifiers_per_group,
    should_complete_knockout_with_best_second_placed_teams:
      competition.should_complete_knockout_with_best_second_placed_teams,
  });
  const qualifiedTeamCount = knockoutProjection.total_qualified_team_count;

  if (qualifiedTeamCount < 2 || competition.groups_count < 2) {
    if (competition.knockout_matches.length == 0) {
      return [];
    }

    return resolveFallbackKnockoutRounds(competition);
  }

  const bracketSize = knockoutProjection.projected_bracket_size;
  const totalRounds = resolveTotalRounds(bracketSize);
  const seedLabels = resolveChampionshipBracketSeedPlaceholderLabels({
    groups_count: competition.groups_count,
    qualifiers_per_group: competition.qualifiers_per_group,
    should_complete_knockout_with_best_second_placed_teams:
      competition.should_complete_knockout_with_best_second_placed_teams,
  });
  const knockoutMatchByRoundAndSlot = new Map<
    string,
    ChampionshipBracketKnockoutMatch
  >();

  competition.knockout_matches.forEach((knockoutMatch) => {
    knockoutMatchByRoundAndSlot.set(
      `${knockoutMatch.round_number}:${knockoutMatch.slot_number}:${knockoutMatch.is_third_place}`,
      knockoutMatch,
    );
  });

  const projectedRounds: ProjectedKnockoutRoundDisplay[] = [];

  for (let roundNumber = 1; roundNumber <= totalRounds; roundNumber += 1) {
    const matchesInRound = bracketSize / 2 ** roundNumber;
    const projectedMatches: ProjectedKnockoutMatchDisplay[] = [];

    for (let slotNumber = 1; slotNumber <= matchesInRound; slotNumber += 1) {
      const knockoutMatch =
        knockoutMatchByRoundAndSlot.get(`${roundNumber}:${slotNumber}:false`) ??
        null;
      const firstRoundSeedIndexes =
        roundNumber == 1
          ? resolveChampionshipBracketFirstRoundSeedIndexes(
              bracketSize,
              slotNumber,
              competition.knockout_pairing_mode ?? "LINEAR",
            )
          : null;
      const homePlaceholderLabel =
        firstRoundSeedIndexes != null
          ? (seedLabels[firstRoundSeedIndexes.home_seed_index] ?? "BYE")
          : resolveWinnerSourceLabel(
              roundNumber - 1,
              slotNumber * 2 - 1,
              totalRounds,
            );
      const awayPlaceholderLabel =
        firstRoundSeedIndexes != null
          ? (seedLabels[firstRoundSeedIndexes.away_seed_index] ?? "BYE")
          : resolveWinnerSourceLabel(
              roundNumber - 1,
              slotNumber * 2,
              totalRounds,
            );

      projectedMatches.push({
        id:
          knockoutMatch?.id ??
          `projected-round-${roundNumber}-slot-${slotNumber}`,
        round_number: roundNumber,
        slot_number: slotNumber,
        is_bye:
          knockoutMatch?.is_bye ??
          ((homePlaceholderLabel == "BYE" && awayPlaceholderLabel != "BYE") ||
            (awayPlaceholderLabel == "BYE" && homePlaceholderLabel != "BYE")),
        is_third_place: false,
        status: knockoutMatch?.status ?? null,
        scheduled_date: knockoutMatch?.scheduled_date ?? null,
        queue_position: knockoutMatch?.queue_position ?? null,
        scheduled_slot: knockoutMatch?.scheduled_slot ?? null,
        start_time: knockoutMatch?.start_time ?? null,
        location: knockoutMatch?.location ?? null,
        court_name: knockoutMatch?.court_name ?? null,
        home_team_id: knockoutMatch?.home_team_id ?? null,
        away_team_id: knockoutMatch?.away_team_id ?? null,
        home_team_name: knockoutMatch?.home_team_name ?? null,
        away_team_name: knockoutMatch?.away_team_name ?? null,
        winner_team_name: knockoutMatch?.winner_team_name ?? null,
        home_placeholder_label: homePlaceholderLabel,
        away_placeholder_label: awayPlaceholderLabel,
      });
    }

    if (
      roundNumber == totalRounds &&
      competition.third_place_mode == BracketThirdPlaceMode.MATCH
    ) {
      const knockoutMatch =
        knockoutMatchByRoundAndSlot.get(`${roundNumber}:2:true`) ?? null;

      projectedMatches.push({
        id: knockoutMatch?.id ?? `projected-third-place-${competition.id}`,
        round_number: roundNumber,
        slot_number: 2,
        is_bye: knockoutMatch?.is_bye ?? false,
        is_third_place: true,
        status: knockoutMatch?.status ?? null,
        scheduled_date: knockoutMatch?.scheduled_date ?? null,
        queue_position: knockoutMatch?.queue_position ?? null,
        scheduled_slot: knockoutMatch?.scheduled_slot ?? null,
        start_time: knockoutMatch?.start_time ?? null,
        location: knockoutMatch?.location ?? null,
        court_name: knockoutMatch?.court_name ?? null,
        home_team_id: knockoutMatch?.home_team_id ?? null,
        away_team_id: knockoutMatch?.away_team_id ?? null,
        home_team_name: knockoutMatch?.home_team_name ?? null,
        away_team_name: knockoutMatch?.away_team_name ?? null,
        winner_team_name: knockoutMatch?.winner_team_name ?? null,
        home_placeholder_label: "Perdedor da Semifinal 1",
        away_placeholder_label: "Perdedor da Semifinal 2",
      });
    }

    projectedRounds.push({
      round_number: roundNumber,
      matches: projectedMatches,
    });
  }

  return projectedRounds;
}

function resolvePlacedMatchLabels(
  projectedMatch: ProjectedKnockoutMatchDisplay,
) {
  return {
    resolved_home_label:
      projectedMatch.home_team_name ??
      projectedMatch.home_placeholder_label ??
      "A definir",
    resolved_away_label:
      projectedMatch.away_team_name ??
      projectedMatch.away_placeholder_label ??
      "A definir",
  };
}

function resolveSideMatchTop(
  localRoundNumber: number,
  localSlotIndex: number,
  verticalUnit: number,
): number {
  const matchCenter =
    DESKTOP_CARD_HEIGHT / 2 +
    ((2 ** (localRoundNumber - 1) - 1) / 2) * verticalUnit +
    localSlotIndex * 2 ** (localRoundNumber - 1) * verticalUnit;

  return matchCenter - DESKTOP_CARD_HEIGHT / 2;
}

function resolveDesktopBracketLayout(
  projectedRounds: ProjectedKnockoutRoundDisplay[],
): DesktopBracketLayout | null {
  const mainRounds = projectedRounds
    .map((projectedRound) => ({
      round_number: projectedRound.round_number,
      matches: projectedRound.matches.filter(
        (projectedMatch) => !projectedMatch.is_third_place,
      ),
    }))
    .filter((projectedRound) => projectedRound.matches.length > 0);
  const thirdPlaceMatch =
    projectedRounds
      .flatMap((projectedRound) => projectedRound.matches)
      .find((projectedMatch) => projectedMatch.is_third_place) ?? null;

  if (mainRounds.length == 0) {
    return null;
  }

  const totalRounds = mainRounds.length;
  const finalMatch = mainRounds[mainRounds.length - 1].matches[0] ?? null;
  const sideRoundCount = Math.max(0, totalRounds - 1);
  const sideFirstRoundMatchCount =
    totalRounds > 1 ? Math.max(1, mainRounds[0].matches.length / 2) : 1;
  const verticalUnit = DESKTOP_CARD_HEIGHT + DESKTOP_VERTICAL_GAP;
  const baseHeight =
    DESKTOP_CARD_HEIGHT +
    Math.max(0, sideFirstRoundMatchCount - 1) * verticalUnit;
  const leftSideWidth =
    sideRoundCount > 0
      ? sideRoundCount * DESKTOP_CARD_WIDTH +
        (sideRoundCount - 1) * DESKTOP_COLUMN_GAP
      : 0;
  const finalCardWidth = DESKTOP_FINAL_CARD_WIDTH;
  const finalColumnX =
    sideRoundCount == 0 ? 0 : leftSideWidth + DESKTOP_COLUMN_GAP;
  const rightSideStartX = finalColumnX + finalCardWidth + DESKTOP_COLUMN_GAP;
  const width =
    totalRounds == 1
      ? finalCardWidth
      : leftSideWidth + finalCardWidth + DESKTOP_COLUMN_GAP * 2 + leftSideWidth;
  const height =
    DESKTOP_TOP_OFFSET +
    baseHeight +
    (thirdPlaceMatch ? DESKTOP_THIRD_PLACE_GAP + DESKTOP_CARD_HEIGHT : 0) +
    16;

  const leftMatches: PlacedBracketMatchDisplay[][] = [];
  const rightMatches: PlacedBracketMatchDisplay[][] = [];

  for (let roundIndex = 0; roundIndex < sideRoundCount; roundIndex += 1) {
    const roundNumber = roundIndex + 1;
    const currentRound = mainRounds[roundIndex];
    const sideMatchCount = currentRound.matches.length / 2;
    const leftRoundX = roundIndex * (DESKTOP_CARD_WIDTH + DESKTOP_COLUMN_GAP);
    const rightRoundX =
      rightSideStartX +
      (sideRoundCount - roundIndex - 1) *
        (DESKTOP_CARD_WIDTH + DESKTOP_COLUMN_GAP);
    const leftRoundMatches = currentRound.matches
      .slice(0, sideMatchCount)
      .map((projectedMatch, localSlotIndex) => ({
        ...projectedMatch,
        ...resolvePlacedMatchLabels(projectedMatch),
        card_width: DESKTOP_CARD_WIDTH,
        x: leftRoundX,
        y: resolveSideMatchTop(roundNumber, localSlotIndex, verticalUnit),
      }));
    const rightRoundMatches = currentRound.matches
      .slice(sideMatchCount)
      .map((projectedMatch, localSlotIndex) => ({
        ...projectedMatch,
        ...resolvePlacedMatchLabels(projectedMatch),
        card_width: DESKTOP_CARD_WIDTH,
        x: rightRoundX,
        y: resolveSideMatchTop(roundNumber, localSlotIndex, verticalUnit),
      }));

    leftMatches.push(leftRoundMatches);
    rightMatches.push(rightRoundMatches);
  }

  const placedFinalMatch = finalMatch
    ? {
        ...finalMatch,
        ...resolvePlacedMatchLabels(finalMatch),
        card_width: finalCardWidth,
        x: finalColumnX,
        y: (baseHeight - DESKTOP_CARD_HEIGHT) / 2,
      }
    : null;
  const placedThirdPlaceMatch = thirdPlaceMatch
    ? {
        ...thirdPlaceMatch,
        ...resolvePlacedMatchLabels(thirdPlaceMatch),
        card_width: DESKTOP_CARD_WIDTH,
        x: finalColumnX,
        y: baseHeight + DESKTOP_THIRD_PLACE_GAP,
      }
    : null;
  const connectors: BracketConnectorDisplay[] = [];

  leftMatches.forEach((roundMatches, roundIndex) => {
    roundMatches.forEach((currentMatch, localSlotIndex) => {
      const parentMatch =
        roundIndex == leftMatches.length - 1
          ? placedFinalMatch
          : (leftMatches[roundIndex + 1][Math.floor(localSlotIndex / 2)] ??
            null);

      if (!parentMatch) {
        return;
      }

      const currentMatchCenterY =
        DESKTOP_TOP_OFFSET + currentMatch.y + DESKTOP_CARD_HEIGHT / 2;
      const parentMatchCenterY =
        DESKTOP_TOP_OFFSET + parentMatch.y + DESKTOP_CARD_HEIGHT / 2;
      const currentMatchEdgeX = currentMatch.x + currentMatch.card_width;
      const parentMatchEdgeX = parentMatch.x;
      const middleX = currentMatchEdgeX + DESKTOP_COLUMN_GAP / 2;

      connectors.push({
        id: `left-connector-${currentMatch.id}-${parentMatch.id}`,
        path: `M ${currentMatchEdgeX} ${currentMatchCenterY} H ${middleX} V ${parentMatchCenterY} H ${parentMatchEdgeX}`,
      });
    });
  });

  rightMatches.forEach((roundMatches, roundIndex) => {
    roundMatches.forEach((currentMatch, localSlotIndex) => {
      const parentMatch =
        roundIndex == rightMatches.length - 1
          ? placedFinalMatch
          : (rightMatches[roundIndex + 1][Math.floor(localSlotIndex / 2)] ??
            null);

      if (!parentMatch) {
        return;
      }

      const currentMatchCenterY =
        DESKTOP_TOP_OFFSET + currentMatch.y + DESKTOP_CARD_HEIGHT / 2;
      const parentMatchCenterY =
        DESKTOP_TOP_OFFSET + parentMatch.y + DESKTOP_CARD_HEIGHT / 2;
      const currentMatchEdgeX = currentMatch.x;
      const parentMatchEdgeX = parentMatch.x + parentMatch.card_width;
      const middleX = currentMatchEdgeX - DESKTOP_COLUMN_GAP / 2;

      connectors.push({
        id: `right-connector-${currentMatch.id}-${parentMatch.id}`,
        path: `M ${currentMatchEdgeX} ${currentMatchCenterY} H ${middleX} V ${parentMatchCenterY} H ${parentMatchEdgeX}`,
      });
    });
  });

  return {
    width,
    height,
    card_top_offset: DESKTOP_TOP_OFFSET,
    left_matches: leftMatches,
    right_matches: rightMatches,
    final_match: placedFinalMatch,
    third_place_match: placedThirdPlaceMatch,
    connectors,
  };
}

function resolveProjectedMatchStatusSummary(
  projectedMatch: ProjectedKnockoutMatchDisplay,
): string {
  if (!projectedMatch.status) {
    return "Aguardando definição";
  }

  return resolveMatchStatusLabel(projectedMatch.status);
}

function resolveProjectedMatchScheduleSummary(
  projectedMatch: ProjectedKnockoutMatchDisplay,
): string {
  if (projectedMatch.status == MatchStatus.SCHEDULED) {
    const scheduledDateValue = resolveMatchScheduledDateValue(projectedMatch);

    if (scheduledDateValue) {
      return `${format(new Date(`${scheduledDateValue}T12:00:00`), "dd/MM", { locale: ptBR })} • ${resolveMatchQueueLabel(projectedMatch.queue_position)}`;
    }

    return resolveMatchQueueLabel(projectedMatch.queue_position);
  }

  if (!projectedMatch.start_time) {
    return "A definir em fila";
  }

  return format(new Date(projectedMatch.start_time), "dd/MM HH:mm", {
    locale: ptBR,
  });
}

function resolveProjectedMatchLocationSummary(
  projectedMatch: ProjectedKnockoutMatchDisplay,
): string {
  const locationLabel = projectedMatch.location ?? "Local a definir";

  if (!projectedMatch.court_name) {
    return locationLabel;
  }

  return `${locationLabel} • ${projectedMatch.court_name}`;
}

type KnockoutPlacementBadge = "CHAMPION" | "RUNNER_UP" | "THIRD_PLACE";

function doesProjectedTeamMatchPodiumTeam(
  projectedTeamId: string | null,
  projectedTeamName: string | null,
  podiumTeam: ChampionshipPodiumTeam,
): boolean {
  if (projectedTeamId && projectedTeamId == podiumTeam.team_id) {
    return true;
  }

  return projectedTeamName == podiumTeam.team_name;
}

function resolveProjectedTeamPlacementBadge(
  projectedMatch: ProjectedKnockoutMatchDisplay | PlacedBracketMatchDisplay,
  projectedTeamId: string | null,
  projectedTeamName: string | null,
  competitionPodium: ChampionshipCompetitionPodium | null,
): KnockoutPlacementBadge | null {
  if (!competitionPodium || !projectedTeamName) {
    return null;
  }

  if (
    projectedMatch.id == competitionPodium.final_match_id &&
    doesProjectedTeamMatchPodiumTeam(
      projectedTeamId,
      projectedTeamName,
      competitionPodium.champion,
    )
  ) {
    return "CHAMPION";
  }

  if (
    projectedMatch.id == competitionPodium.final_match_id &&
    competitionPodium.runner_up &&
    doesProjectedTeamMatchPodiumTeam(
      projectedTeamId,
      projectedTeamName,
      competitionPodium.runner_up,
    )
  ) {
    return "RUNNER_UP";
  }

  if (
    competitionPodium.third_place &&
    projectedMatch.id == competitionPodium.third_place.source_match_id &&
    doesProjectedTeamMatchPodiumTeam(
      projectedTeamId,
      projectedTeamName,
      competitionPodium.third_place.team,
    )
  ) {
    return "THIRD_PLACE";
  }

  return null;
}

function renderPlacementIcon(
  placementBadge: KnockoutPlacementBadge | null,
): JSX.Element | null {
  if (placementBadge == "CHAMPION") {
    return <Trophy className="h-4 w-4 shrink-0 text-amber-400" />;
  }

  if (placementBadge == "RUNNER_UP") {
    return <Medal className="h-4 w-4 shrink-0 text-slate-400" />;
  }

  if (placementBadge == "THIRD_PLACE") {
    return <Award className="h-4 w-4 shrink-0 text-orange-400" />;
  }

  return null;
}

function BracketMatchCard({
  projectedMatch,
  totalRounds,
  competitionPodium,
  fixedSize = false,
  fixedWidth = DESKTOP_CARD_WIDTH,
  isFinalCard = false,
}: {
  projectedMatch: ProjectedKnockoutMatchDisplay | PlacedBracketMatchDisplay;
  totalRounds: number;
  competitionPodium: ChampionshipCompetitionPodium | null;
  fixedSize?: boolean;
  fixedWidth?: number;
  isFinalCard?: boolean;
}) {
  const resolvedHomeLabel =
    "resolved_home_label" in projectedMatch
      ? projectedMatch.resolved_home_label
      : (projectedMatch.home_team_name ??
        projectedMatch.home_placeholder_label ??
        "A definir");
  const resolvedAwayLabel =
    "resolved_away_label" in projectedMatch
      ? projectedMatch.resolved_away_label
      : (projectedMatch.away_team_name ??
        projectedMatch.away_placeholder_label ??
        "A definir");
  const isFinishedFinalMatch =
    !projectedMatch.is_third_place &&
    projectedMatch.round_number == totalRounds &&
    projectedMatch.status == MatchStatus.FINISHED &&
    Boolean(projectedMatch.winner_team_name);
  const isHomeWinner =
    isFinishedFinalMatch &&
    projectedMatch.winner_team_name != null &&
    projectedMatch.winner_team_name == projectedMatch.home_team_name;
  const isAwayWinner =
    isFinishedFinalMatch &&
    projectedMatch.winner_team_name != null &&
    projectedMatch.winner_team_name == projectedMatch.away_team_name;
  const homePlacementBadge =
    resolveProjectedTeamPlacementBadge(
      projectedMatch,
      projectedMatch.home_team_id,
      projectedMatch.home_team_name,
      competitionPodium,
    ) ?? (isHomeWinner ? "CHAMPION" : null);
  const awayPlacementBadge =
    resolveProjectedTeamPlacementBadge(
      projectedMatch,
      projectedMatch.away_team_id,
      projectedMatch.away_team_name,
      competitionPodium,
    ) ?? (isAwayWinner ? "CHAMPION" : null);

  return (
    <div
      className={`app-input-field flex h-full flex-col overflow-hidden rounded-[1.35rem] p-3 shadow-[0_8px_20px_rgba(15,23,42,0.15)] dark:shadow-none ${
        isFinalCard
          ? "border-transparent !bg-primary/20 dark:!bg-primary/20"
          : ""
      }`}
      style={
        fixedSize
          ? {
              width: `${fixedWidth}px`,
              height: `${DESKTOP_CARD_HEIGHT}px`,
            }
          : undefined
      }
    >
      <div className="space-y-1 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
          {resolveKnockoutRoundLabel(
            projectedMatch.round_number,
            totalRounds,
            projectedMatch.is_third_place,
          )}
        </p>
        {projectedMatch.is_bye ? (
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            BYE
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col justify-center gap-2.5">
        <div className="app-input-field flex min-h-[44px] items-center justify-center rounded-xl px-3 py-2 text-center">
          <div className="flex max-w-full items-center justify-center gap-2">
            {renderPlacementIcon(homePlacementBadge)}
            <p className="max-w-full break-words text-center text-sm font-semibold leading-snug">
              {resolvedHomeLabel}
            </p>
          </div>
        </div>

        <div className="flex justify-center">
          <span className="font-display text-lg font-bold text-muted-foreground/70">
            ×
          </span>
        </div>

        <div className="app-input-field flex min-h-[44px] items-center justify-center rounded-xl px-3 py-2 text-center">
          <div className="flex max-w-full items-center justify-center gap-2">
            {renderPlacementIcon(awayPlacementBadge)}
            <p className="max-w-full break-words text-center text-sm font-semibold leading-snug">
              {resolvedAwayLabel}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-col items-center gap-1 text-center text-[11px] leading-tight text-muted-foreground">
        <p className="max-w-full break-words">
          {resolveProjectedMatchStatusSummary(projectedMatch)} •{" "}
          {resolveProjectedMatchScheduleSummary(projectedMatch)}
        </p>
        <p className="max-w-full break-words">
          {resolveProjectedMatchLocationSummary(projectedMatch)}
        </p>
      </div>
    </div>
  );
}

function DesktopBracketCanvas({
  desktopBracketLayout,
  totalRounds,
  competitionPodium,
}: {
  desktopBracketLayout: DesktopBracketLayout;
  totalRounds: number;
  competitionPodium: ChampionshipCompetitionPodium | null;
}) {
  const desktopBracketCanvasReference = useRef<HTMLDivElement | null>(null);
  const [desktopBracketScale, setDesktopBracketScale] = useState(1);

  useEffect(() => {
    const currentDesktopBracketCanvas = desktopBracketCanvasReference.current;

    if (!currentDesktopBracketCanvas) {
      return;
    }

    const updateDesktopBracketScale = () => {
      const availableWidth = Math.max(
        0,
        currentDesktopBracketCanvas.clientWidth -
          DESKTOP_LAYOUT_HORIZONTAL_PADDING,
      );

      if (availableWidth <= 0) {
        setDesktopBracketScale(1);
        return;
      }

      setDesktopBracketScale(
        Math.min(1, availableWidth / desktopBracketLayout.width),
      );
    };

    updateDesktopBracketScale();

    if (typeof ResizeObserver == "undefined") {
      window.addEventListener("resize", updateDesktopBracketScale);

      return () => {
        window.removeEventListener("resize", updateDesktopBracketScale);
      };
    }

    const desktopBracketResizeObserver = new ResizeObserver(() => {
      updateDesktopBracketScale();
    });

    desktopBracketResizeObserver.observe(currentDesktopBracketCanvas);

    return () => {
      desktopBracketResizeObserver.disconnect();
    };
  }, [desktopBracketLayout.width]);

  return (
    <div
      ref={desktopBracketCanvasReference}
      className="app-card-muted hidden rounded-2xl px-6 py-5 md:block"
    >
      <div
        className="flex w-full items-start justify-center overflow-visible"
        style={{
          height: `${desktopBracketLayout.height * desktopBracketScale + 32}px`,
        }}
      >
        <div
          className="relative mx-auto shrink-0"
          style={{
            width: `${desktopBracketLayout.width}px`,
            height: `${desktopBracketLayout.height}px`,
            transform: `scale(${desktopBracketScale})`,
            transformOrigin: "top center",
          }}
        >
          <svg
            width={desktopBracketLayout.width}
            height={desktopBracketLayout.height}
            className="absolute inset-0 overflow-visible"
            aria-hidden="true"
          >
            {desktopBracketLayout.connectors.map((connector) => (
              <path
                key={connector.id}
                d={connector.path}
                fill="none"
                stroke="hsl(var(--border) / 0.8)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>

          {desktopBracketLayout.left_matches.flatMap((roundMatches) =>
            roundMatches.map((projectedMatch) => (
              <div
                key={projectedMatch.id}
                className="absolute"
                style={{
                  left: `${projectedMatch.x}px`,
                  top: `${desktopBracketLayout.card_top_offset + projectedMatch.y}px`,
                }}
              >
                <BracketMatchCard
                  projectedMatch={projectedMatch}
                  totalRounds={totalRounds}
                  competitionPodium={competitionPodium}
                  fixedSize
                  fixedWidth={projectedMatch.card_width}
                />
              </div>
            )),
          )}

          {desktopBracketLayout.right_matches.flatMap((roundMatches) =>
            roundMatches.map((projectedMatch) => (
              <div
                key={projectedMatch.id}
                className="absolute"
                style={{
                  left: `${projectedMatch.x}px`,
                  top: `${desktopBracketLayout.card_top_offset + projectedMatch.y}px`,
                }}
              >
                <BracketMatchCard
                  projectedMatch={projectedMatch}
                  totalRounds={totalRounds}
                  competitionPodium={competitionPodium}
                  fixedSize
                  fixedWidth={projectedMatch.card_width}
                />
              </div>
            )),
          )}

          {desktopBracketLayout.final_match ? (
            <div
              className="absolute"
              style={{
                left: `${desktopBracketLayout.final_match.x}px`,
                top: `${desktopBracketLayout.card_top_offset + desktopBracketLayout.final_match.y}px`,
              }}
            >
              <BracketMatchCard
                projectedMatch={desktopBracketLayout.final_match}
                totalRounds={totalRounds}
                competitionPodium={competitionPodium}
                fixedSize
                fixedWidth={desktopBracketLayout.final_match.card_width}
                isFinalCard
              />
            </div>
          ) : null}

          {desktopBracketLayout.third_place_match ? (
            <div
              className="absolute"
              style={{
                left: `${desktopBracketLayout.third_place_match.x}px`,
                top: `${desktopBracketLayout.card_top_offset + desktopBracketLayout.third_place_match.y}px`,
              }}
            >
              <BracketMatchCard
                projectedMatch={desktopBracketLayout.third_place_match}
                totalRounds={totalRounds}
                competitionPodium={competitionPodium}
                fixedSize
                fixedWidth={desktopBracketLayout.third_place_match.card_width}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ChampionshipBracketBoard({
  championshipBracketView,
  loading = false,
  emptyMessage = "Nenhum grupo de campeonato encontrado.",
}: Props) {
  const [naipeFilter, setNaipeFilter] = useState(ALL_FILTER);
  const [divisionFilter, setDivisionFilter] = useState(ALL_FILTER);

  const visibleCompetitions = useMemo(() => {
    return championshipBracketView.competitions.filter((competition) => {
      return (
        competition.groups_count > 0 || competition.knockout_matches.length > 0
      );
    });
  }, [championshipBracketView.competitions]);

  const availableDivisions = useMemo(() => {
    const divisionSet = new Set<TeamDivision>();

    visibleCompetitions.forEach((competition) => {
      if (competition.division) {
        divisionSet.add(competition.division);
      }
    });

    return [...divisionSet];
  }, [visibleCompetitions]);

  const filteredCompetitions = useMemo(() => {
    return visibleCompetitions.filter((competition) => {
      if (naipeFilter != ALL_FILTER && competition.naipe != naipeFilter) {
        return false;
      }

      if (divisionFilter != ALL_FILTER) {
        const currentDivision = competition.division ?? "";

        if (currentDivision != divisionFilter) {
          return false;
        }
      }

      return true;
    });
  }, [divisionFilter, naipeFilter, visibleCompetitions]);

  if (loading) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, competitionIndex) => (
          <div
            key={`championship-bracket-skeleton-${competitionIndex}`}
            className="space-y-4 rounded-2xl app-card-muted p-4"
          >
            <div className="flex flex-col items-center space-y-2">
              <Skeleton className="h-5 w-52 max-w-full" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-44 max-w-full" />
            </div>

            <div className="hidden gap-4 md:grid md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, matchIndex) => (
                <Skeleton
                  key={`championship-bracket-match-skeleton-${competitionIndex}-${matchIndex}`}
                  className="h-56 w-full rounded-2xl"
                />
              ))}
            </div>

            <div className="space-y-3 md:hidden">
              {Array.from({ length: 3 }).map((_, matchIndex) => (
                <Skeleton
                  key={`championship-bracket-mobile-skeleton-${competitionIndex}-${matchIndex}`}
                  className="h-52 w-full rounded-2xl"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

  if (visibleCompetitions.length == 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Select value={naipeFilter} onValueChange={setNaipeFilter}>
          <SelectTrigger className="app-input-field">
            <SelectValue placeholder="Filtrar naipe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER}>Todos os naipes</SelectItem>
            <SelectItem value={MatchNaipe.MASCULINO}>
              {MATCH_NAIPE_LABELS[MatchNaipe.MASCULINO]}
            </SelectItem>
            <SelectItem value={MatchNaipe.FEMININO}>
              {MATCH_NAIPE_LABELS[MatchNaipe.FEMININO]}
            </SelectItem>
            <SelectItem value={MatchNaipe.MISTO}>
              {MATCH_NAIPE_LABELS[MatchNaipe.MISTO]}
            </SelectItem>
          </SelectContent>
        </Select>

        <Select value={divisionFilter} onValueChange={setDivisionFilter}>
          <SelectTrigger className="app-input-field">
            <SelectValue placeholder="Filtrar divisão" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER}>Todas as divisões</SelectItem>
            {availableDivisions.map((division) => (
              <SelectItem key={division} value={division}>
                {TEAM_DIVISION_LABELS[division]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredCompetitions.length == 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma competição encontrada para os filtros selecionados.
        </p>
      ) : null}

      {filteredCompetitions.map((competition) => {
        const projectedKnockoutRounds =
          resolveProjectedKnockoutRounds(competition);
        const competitionPodium = resolveCompetitionPodium(competition);
        const qualificationSummary =
          resolveChampionshipBracketQualificationSummary({
            groups_count: competition.groups_count,
            qualifiers_per_group: competition.qualifiers_per_group,
            should_complete_knockout_with_best_second_placed_teams:
              competition.should_complete_knockout_with_best_second_placed_teams,
          });
        const projectedKnockoutSummary =
          resolveChampionshipBracketProjectedKnockoutSummary({
            groups_count: competition.groups_count,
            qualifiers_per_group: competition.qualifiers_per_group,
            should_complete_knockout_with_best_second_placed_teams:
              competition.should_complete_knockout_with_best_second_placed_teams,
          });
        const desktopBracketLayout = resolveDesktopBracketLayout(
          projectedKnockoutRounds,
        );
        const mainProjectedRounds = projectedKnockoutRounds
          .map((projectedRound) => ({
            round_number: projectedRound.round_number,
            matches: projectedRound.matches.filter(
              (projectedMatch) => !projectedMatch.is_third_place,
            ),
          }))
          .filter((projectedRound) => projectedRound.matches.length > 0);
        const thirdPlaceMatch =
          projectedKnockoutRounds
            .flatMap((projectedRound) => projectedRound.matches)
            .find((projectedMatch) => projectedMatch.is_third_place) ?? null;
        const totalRounds = Math.max(
          1,
          ...projectedKnockoutRounds
            .flatMap((projectedRound) => projectedRound.matches)
            .filter((projectedMatch) => !projectedMatch.is_third_place)
            .map((projectedMatch) => projectedMatch.round_number),
        );

        return (
          <div
            key={competition.id}
            className="space-y-4 rounded-2xl app-card-muted p-4"
          >
            <div className="space-y-1 text-center">
              <h3 className="font-display text-lg font-bold">
                {competition.sport_name} •{" "}
                {MATCH_NAIPE_LABELS[competition.naipe]}
                {competition.division
                  ? ` • ${TEAM_DIVISION_LABELS[competition.division]}`
                  : ""}
              </h3>
              <p className="text-xs text-muted-foreground">
                Grupos: {competition.groups_count}
              </p>
              <p className="text-xs text-muted-foreground">
                Classificados/grupo: {competition.qualifiers_per_group}
              </p>
              <p className="text-xs text-muted-foreground">
                {qualificationSummary} • {projectedKnockoutSummary}
              </p>
            </div>

            {projectedKnockoutRounds.length == 0 ? (
              <p className="text-xs text-muted-foreground">
                Esta competição ainda não possui participantes suficientes para
                o mata-mata.
              </p>
            ) : (
              <>
                {desktopBracketLayout ? (
                  <DesktopBracketCanvas
                    desktopBracketLayout={desktopBracketLayout}
                    totalRounds={totalRounds}
                    competitionPodium={competitionPodium}
                  />
                ) : null}

                <div className="space-y-4 md:hidden">
                  {mainProjectedRounds.map((projectedRound) => (
                    <div
                      key={`${competition.id}-mobile-round-${projectedRound.round_number}`}
                      className="space-y-3"
                    >
                      <div className="space-y-3">
                        {projectedRound.matches.map((projectedMatch) => (
                          <BracketMatchCard
                            key={projectedMatch.id}
                            projectedMatch={projectedMatch}
                            totalRounds={totalRounds}
                            competitionPodium={competitionPodium}
                            isFinalCard={
                              projectedMatch.round_number == totalRounds &&
                              !projectedMatch.is_third_place
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  {thirdPlaceMatch ? (
                    <div className="space-y-3">
                      <BracketMatchCard
                        projectedMatch={thirdPlaceMatch}
                        totalRounds={totalRounds}
                        competitionPodium={competitionPodium}
                      />
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
