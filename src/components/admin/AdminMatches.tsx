import { useCallback, useEffect, useMemo, useState } from "react";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchChampionshipBracketLocationTemplates,
  fetchChampionshipBracketPendingTieBreaks,
  generateChampionshipKnockout,
  saveMatchSets,
  saveChampionshipBracketTieBreakResolution,
} from "@/domain/championship-brackets/championshipBracket.repository";
import type {
  ChampionshipBracketLocationTemplate,
  ChampionshipBracketScheduleDayInput,
  ChampionshipBracketTieBreakPendingContext,
} from "@/domain/championship-brackets/championshipBracket.types";
import type { Championship, ChampionshipBracketView, ChampionshipSport, Match, Sport, Team } from "@/lib/types";
import {
  AppBadgeTone,
  BracketEditionStatus,
  BracketPhase,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
  MatchNaipe,
  MatchStatus,
  TeamDivision,
} from "@/lib/enums";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  type MatchBracketContext,
  doesChampionshipSportSupportNaipe,
  CHAMPIONSHIP_SPORT_TIE_BREAKER_RULE_LABELS,
  MATCH_NAIPE_LABELS,
  TEAM_DIVISION_BADGE_TONES,
  TEAM_DIVISION_LABELS,
  isMatchNaipe,
  isTeamDivision,
  resolveBracketGroupFilterOptions,
  resolveChampionshipBracketGroupStageOptions,
  resolveChampionshipGroupLabel,
  resolveGroupStageMatchBindingByMatchId,
  resolveMatchQueueLabel,
  resolveMatchNaipeBadgeTone,
  resolveMatchNaipeLabel,
  resolveMatchScheduledDateValue,
  resolveMatchSetSummary,
  resolveMatchStartedAtLabel,
  resolveMatchStatusBadgeTone,
  resolveMatchStatusLabel,
  resolveMatchTieBreakRuleLabel,
} from "@/lib/championship";
import { AppBadge } from "@/components/ui/app-badge";
import {
  AppPaginationControls,
  DEFAULT_PAGINATION_ITEMS_PER_PAGE,
} from "@/components/ui/app-pagination-controls";
import { SportFilter } from "@/components/SportFilter";

interface Props {
  matches: Match[];
  championshipSports: ChampionshipSport[];
  teams: Team[];
  selectedChampionship: Championship;
  championshipBracketView: ChampionshipBracketView;
  loadingChampionshipBracket: boolean;
  matchBracketContextByMatchId: Record<string, MatchBracketContext>;
  canManageMatches?: boolean;
  onRefetch: () => void;
  onRefetchChampionshipBracket: () => void;
}

interface MatchEditDraft {
  sportId: string;
  homeTeamId: string;
  awayTeamId: string;
  location: string;
  scheduledDate: Date | null;
  division: TeamDivision;
  naipe: MatchNaipe;
  status: MatchStatus;
  selectedGroupOptionValue: string;
  resolvedTieBreakerRule: ChampionshipSportTieBreakerRule | "";
}

const NAIPE_OPTIONS: MatchNaipe[] = [MatchNaipe.MASCULINO, MatchNaipe.FEMININO, MatchNaipe.MISTO];
const ALL_MATCHES_SPORT_FILTER = "ALL_MATCHES_SPORTS";
const ALL_MATCHES_STATUS_FILTER = "ALL_MATCHES_STATUS";
const ALL_MATCHES_TEAM_FILTER = "ALL_MATCHES_TEAMS";
const ALL_MATCHES_NAIPE_FILTER = "ALL_MATCHES_NAIPES";
const ALL_MATCHES_DIVISION_FILTER = "ALL_MATCHES_DIVISIONS";
const ALL_MATCHES_GROUP_FILTER = "ALL_MATCHES_GROUPS";
const MATCHES_STATUS_FILTER_LIVE = "MATCHES_STATUS_FILTER_LIVE";
const MATCHES_STATUS_FILTER_FINISHED = "MATCHES_STATUS_FILTER_FINISHED";
const MATCHES_STATUS_FILTER_OPEN = "MATCHES_STATUS_FILTER_OPEN";
const EMPTY_GROUP_OPTION_VALUE = "EMPTY_GROUP_OPTION_VALUE";
const EMPTY_TIE_BREAKER_RULE_OPTION_VALUE = "EMPTY_TIE_BREAKER_RULE_OPTION_VALUE";

const MATCH_STATUS_SORT_ORDER: Record<MatchStatus, number> = {
  [MatchStatus.LIVE]: 0,
  [MatchStatus.SCHEDULED]: 1,
  [MatchStatus.FINISHED]: 2,
};

function resolveDateOnlyString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function resolveScheduledDateDraftValue(match: Match): Date | null {
  const scheduledDateValue = resolveMatchScheduledDateValue(match);

  if (!scheduledDateValue) {
    return null;
  }

  return new Date(`${scheduledDateValue}T12:00:00`);
}

function resolveScheduledQueueSummary(match: Match): string {
  const scheduledDateValue = resolveMatchScheduledDateValue(match);
  const queueLabel = resolveMatchQueueLabel(match.queue_position);

  if (!scheduledDateValue) {
    return queueLabel;
  }

  return `${format(new Date(`${scheduledDateValue}T12:00:00`), "dd/MM", { locale: ptBR })} • ${queueLabel}`;
}

function resolveAdminMatchesOperationalErrorMessage(error: { code?: string; message: string }): string {
  if (
    error.code == "PGRST204" &&
    (error.message.includes("current_set_home_score") || error.message.includes("current_set_away_score"))
  ) {
    return "A migration 20260316013000_add_match_live_set_progress_and_tie_break_metadata.sql ainda não foi aplicada no banco. Rode npx supabase db push e recarregue o schema.";
  }

  if (error.code == "42702" && error.message.includes("team_id_value")) {
    return "A migration 20260316013000_add_match_live_set_progress_and_tie_break_metadata.sql ainda não foi aplicada no banco. Rode npx supabase db push para atualizar a função de sorteio.";
  }

  return error.message;
}

function resolveChampionshipBracketScheduleDays(
  championshipBracketView: ChampionshipBracketView,
): ChampionshipBracketScheduleDayInput[] {
  const scheduleDays = (championshipBracketView.edition?.payload_snapshot as { schedule_days?: unknown } | null)?.schedule_days;

  if (!Array.isArray(scheduleDays)) {
    return [];
  }

  return scheduleDays.filter((scheduleDay): scheduleDay is ChampionshipBracketScheduleDayInput => {
    return typeof scheduleDay == "object" && scheduleDay != null && typeof scheduleDay.date == "string" && Array.isArray(scheduleDay.locations);
  });
}

function resolveSportsByNaipe(championshipSports: ChampionshipSport[], naipe: MatchNaipe): Sport[] {
  const sportsById = new Map<string, Sport>();

  championshipSports
    .filter((championshipSport) => doesChampionshipSportSupportNaipe(championshipSport.naipe_mode, naipe))
    .forEach((championshipSport) => {
      const sport = championshipSport.sports;

      if (sport && !sportsById.has(sport.id)) {
        sportsById.set(sport.id, sport);
      }
    });

  return [...sportsById.values()].sort((firstSport, secondSport) => firstSport.name.localeCompare(secondSport.name));
}

function shuffleTeamIds(teamIds: string[]): string[] {
  const shuffledTeamIds = [...teamIds];

  for (let currentIndex = shuffledTeamIds.length - 1; currentIndex > 0; currentIndex -= 1) {
    const randomIndex = Math.floor(Math.random() * (currentIndex + 1));
    const currentValue = shuffledTeamIds[currentIndex];

    shuffledTeamIds[currentIndex] = shuffledTeamIds[randomIndex];
    shuffledTeamIds[randomIndex] = currentValue;
  }

  return shuffledTeamIds;
}

export function AdminMatches({
  matches,
  championshipSports,
  teams,
  selectedChampionship,
  championshipBracketView,
  loadingChampionshipBracket,
  matchBracketContextByMatchId,
  canManageMatches = true,
  onRefetch,
  onRefetchChampionshipBracket,
}: Props) {
  const [naipe, setNaipe] = useState<MatchNaipe>(MatchNaipe.MASCULINO);
  const [sportId, setSportId] = useState("");
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [location, setLocation] = useState("");
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [division, setDivision] = useState<TeamDivision>(TeamDivision.DIVISAO_PRINCIPAL);
  const [selectedGroupOptionValue, setSelectedGroupOptionValue] = useState("");
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editingMatchDraft, setEditingMatchDraft] = useState<MatchEditDraft | null>(null);
  const [matchesSportFilter, setMatchesSportFilter] = useState<string>(ALL_MATCHES_SPORT_FILTER);
  const [matchesStatusFilter, setMatchesStatusFilter] = useState<string>(ALL_MATCHES_STATUS_FILTER);
  const [matchesTeamFilter, setMatchesTeamFilter] = useState<string>(ALL_MATCHES_TEAM_FILTER);
  const [matchesNaipeFilter, setMatchesNaipeFilter] = useState<string>(ALL_MATCHES_NAIPE_FILTER);
  const [matchesDivisionFilter, setMatchesDivisionFilter] = useState<string>(ALL_MATCHES_DIVISION_FILTER);
  const [matchesGroupFilter, setMatchesGroupFilter] = useState<string>(ALL_MATCHES_GROUP_FILTER);
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [matchesCurrentPage, setMatchesCurrentPage] = useState(1);
  const [matchesItemsPerPage, setMatchesItemsPerPage] = useState(DEFAULT_PAGINATION_ITEMS_PER_PAGE);
  const [deletingMatches, setDeletingMatches] = useState(false);
  const [applyingBulkAction, setApplyingBulkAction] = useState(false);
  const [savingEditingMatch, setSavingEditingMatch] = useState(false);
  const [showCreateMatchModal, setShowCreateMatchModal] = useState(false);
  const [locationTemplates, setLocationTemplates] = useState<ChampionshipBracketLocationTemplate[]>([]);
  const [loadingLocationTemplates, setLoadingLocationTemplates] = useState(false);
  const [pendingTieBreakContexts, setPendingTieBreakContexts] = useState<ChampionshipBracketTieBreakPendingContext[]>([]);
  const [loadingPendingTieBreakContexts, setLoadingPendingTieBreakContexts] = useState(false);
  const [showTieBreakDialog, setShowTieBreakDialog] = useState(false);
  const [savingTieBreakResolutions, setSavingTieBreakResolutions] = useState(false);
  const [draftTieBreakTeamIdsByContextKey, setDraftTieBreakTeamIdsByContextKey] = useState<Record<string, string[]>>({});

  const championshipUsesDivisions = selectedChampionship.uses_divisions;
  const hasConfiguredBracket =
    championshipBracketView.edition != null && championshipBracketView.competitions.length > 0;
  const bracketGroupMatchesProgress = useMemo(() => {
    const groupMatches = championshipBracketView.competitions.flatMap((competition) => {
      return competition.groups.flatMap((group) => group.matches);
    });

    return {
      total: groupMatches.length,
      pending: groupMatches.filter((match) => match.status != MatchStatus.FINISHED).length,
    };
  }, [championshipBracketView.competitions]);
  const availableSportsForCreate = useMemo(() => {
    return resolveSportsByNaipe(championshipSports, naipe);
  }, [championshipSports, naipe]);

  const availableSportsForEditing = useMemo(() => {
    if (!editingMatchDraft) {
      return [];
    }

    return resolveSportsByNaipe(championshipSports, editingMatchDraft.naipe);
  }, [championshipSports, editingMatchDraft]);

  const championshipBracketScheduleDays = useMemo(() => {
    return resolveChampionshipBracketScheduleDays(championshipBracketView);
  }, [championshipBracketView]);

  const championshipDayDates = useMemo(() => {
    const payloadScheduleDayDates = championshipBracketScheduleDays
      .map((scheduleDay) => scheduleDay.date)
      .filter((scheduleDayDate, scheduleDayIndex, scheduleDayDates) => {
        return scheduleDayDate.trim() && scheduleDayDates.indexOf(scheduleDayDate) == scheduleDayIndex;
      })
      .sort((leftDate, rightDate) => leftDate.localeCompare(rightDate));

    if (payloadScheduleDayDates.length > 0) {
      return payloadScheduleDayDates;
    }

    const matchScheduleDates = matches
      .map((match) => resolveMatchScheduledDateValue(match))
      .filter((scheduledDateValue): scheduledDateValue is string => scheduledDateValue != null)
      .filter((scheduledDateValue, scheduledDateIndex, scheduledDateValues) => {
        return scheduledDateValues.indexOf(scheduledDateValue) == scheduledDateIndex;
      })
      .sort((leftDate, rightDate) => leftDate.localeCompare(rightDate));

    return matchScheduleDates;
  }, [championshipBracketScheduleDays, matches]);

  const availableLocationOptions = useMemo(() => {
    const locationNameSet = new Set<string>();

    if (selectedChampionship.default_location?.trim()) {
      locationNameSet.add(selectedChampionship.default_location.trim());
    }

    locationTemplates.forEach((locationTemplate) => {
      if (locationTemplate.name.trim()) {
        locationNameSet.add(locationTemplate.name.trim());
      }
    });

    championshipBracketScheduleDays.forEach((scheduleDay) => {
      scheduleDay.locations.forEach((scheduleLocation) => {
        if (scheduleLocation.name.trim()) {
          locationNameSet.add(scheduleLocation.name.trim());
        }
      });
    });

    return [...locationNameSet].sort((leftLocationName, rightLocationName) => {
      return leftLocationName.localeCompare(rightLocationName, "pt-BR", { sensitivity: "base" });
    });
  }, [championshipBracketScheduleDays, locationTemplates, selectedChampionship.default_location]);

  const createLocationOptions = useMemo(() => {
    if (!location.trim() || availableLocationOptions.includes(location.trim())) {
      return availableLocationOptions;
    }

    return [...availableLocationOptions, location.trim()].sort((leftLocationName, rightLocationName) => {
      return leftLocationName.localeCompare(rightLocationName, "pt-BR", { sensitivity: "base" });
    });
  }, [availableLocationOptions, location]);

  const editingLocationOptions = useMemo(() => {
    const editingLocation = editingMatchDraft?.location.trim();

    if (!editingLocation || availableLocationOptions.includes(editingLocation)) {
      return availableLocationOptions;
    }

    return [...availableLocationOptions, editingLocation].sort((leftLocationName, rightLocationName) => {
      return leftLocationName.localeCompare(rightLocationName, "pt-BR", { sensitivity: "base" });
    });
  }, [availableLocationOptions, editingMatchDraft?.location]);

  const teamsAllowedForMatches = useMemo(() => {
    return teams.filter((team) => team.division != null);
  }, [teams]);

  const loadPendingTieBreakContexts = useCallback(async () => {
    if (!championshipBracketView.edition?.id) {
      setPendingTieBreakContexts([]);
      setDraftTieBreakTeamIdsByContextKey({});
      setLoadingPendingTieBreakContexts(false);
      return;
    }

    setLoadingPendingTieBreakContexts(true);

    const response = await fetchChampionshipBracketPendingTieBreaks(
      selectedChampionship.id,
      championshipBracketView.edition.id,
    );

    setLoadingPendingTieBreakContexts(false);

    if (response.error) {
      toast.error(resolveAdminMatchesOperationalErrorMessage(response.error));
      return;
    }

    setPendingTieBreakContexts(response.data);
    setDraftTieBreakTeamIdsByContextKey(() => {
      return response.data.reduce<Record<string, string[]>>((carry, pendingTieBreakContext) => {
        carry[pendingTieBreakContext.context_key] = [];
        return carry;
      }, {});
    });
  }, [championshipBracketView.edition?.id, selectedChampionship.id]);

  const loadLocationTemplates = useCallback(async () => {
    setLoadingLocationTemplates(true);

    const response = await fetchChampionshipBracketLocationTemplates();

    setLoadingLocationTemplates(false);

    if (response.error) {
      toast.error(response.error.message);
      return;
    }

    setLocationTemplates(response.data);
  }, []);

  const resetCreateMatchForm = () => {
    setNaipe(MatchNaipe.MASCULINO);
    setSportId("");
    setHomeTeamId("");
    setAwayTeamId("");
    setLocation("");
    setScheduledDate(null);
    setDivision(TeamDivision.DIVISAO_PRINCIPAL);
    setSelectedGroupOptionValue("");
  };

  useEffect(() => {
    setNaipe(MatchNaipe.MASCULINO);
    setSportId("");
    setHomeTeamId("");
    setAwayTeamId("");
    setLocation("");
    setScheduledDate(null);
    setDivision(TeamDivision.DIVISAO_PRINCIPAL);
    setSelectedGroupOptionValue("");
    setEditingMatchId(null);
    setEditingMatchDraft(null);
    setSavingEditingMatch(false);
    setMatchesSportFilter(ALL_MATCHES_SPORT_FILTER);
    setMatchesTeamFilter(ALL_MATCHES_TEAM_FILTER);
    setMatchesNaipeFilter(ALL_MATCHES_NAIPE_FILTER);
    setMatchesDivisionFilter(ALL_MATCHES_DIVISION_FILTER);
    setMatchesGroupFilter(ALL_MATCHES_GROUP_FILTER);
    setSelectedMatchIds([]);
    setMatchesCurrentPage(1);
    setMatchesItemsPerPage(DEFAULT_PAGINATION_ITEMS_PER_PAGE);
  }, [selectedChampionship.id]);

  useEffect(() => {
    void loadPendingTieBreakContexts();
  }, [loadPendingTieBreakContexts]);

  useEffect(() => {
    void loadLocationTemplates();
  }, [loadLocationTemplates]);

  useEffect(() => {
    setSportId("");
    setHomeTeamId("");
    setAwayTeamId("");
    setSelectedGroupOptionValue("");
  }, [naipe]);

  const sportsForMatchesFilter = useMemo(() => {
    const sportsById = new Map<string, Sport>();

    matches.forEach((match) => {
      if (match.sports && !sportsById.has(match.sports.id)) {
        sportsById.set(match.sports.id, match.sports);
      }
    });

    return [...sportsById.values()].sort((firstSport, secondSport) => firstSport.name.localeCompare(secondSport.name));
  }, [matches]);

  const teamsForMatchesFilter = useMemo(() => {
    const teamIds = new Set<string>();

    matches.forEach((match) => {
      teamIds.add(match.home_team_id);
      teamIds.add(match.away_team_id);
    });

    return teams
      .filter((team) => teamIds.has(team.id))
      .sort((firstTeam, secondTeam) => firstTeam.name.localeCompare(secondTeam.name));
  }, [matches, teams]);

  const groupsForMatchesFilter = useMemo(() => {
    return resolveBracketGroupFilterOptions(matchBracketContextByMatchId);
  }, [matchBracketContextByMatchId]);

  const championshipBracketGroupStageOptions = useMemo(() => {
    return resolveChampionshipBracketGroupStageOptions(championshipBracketView);
  }, [championshipBracketView]);

  const createMatchGroupOptions = useMemo(() => {
    const resolvedDivision = championshipUsesDivisions ? division : null;

    return championshipBracketGroupStageOptions.filter((groupOption) => {
      return groupOption.sport_id == sportId && groupOption.naipe == naipe && groupOption.division == resolvedDivision;
    });
  }, [championshipBracketGroupStageOptions, championshipUsesDivisions, division, naipe, sportId]);

  const selectedCreateGroupOption = useMemo(() => {
    if (!selectedGroupOptionValue) {
      return null;
    }

    return createMatchGroupOptions.find((groupOption) => groupOption.value == selectedGroupOptionValue) ?? null;
  }, [createMatchGroupOptions, selectedGroupOptionValue]);

  const eligibleTeams = useMemo(() => {
    if (selectedCreateGroupOption) {
      const selectedCreateGroupTeamIdSet = new Set(selectedCreateGroupOption.team_ids);

      return teamsAllowedForMatches.filter((team) => selectedCreateGroupTeamIdSet.has(team.id));
    }

    if (!championshipUsesDivisions) {
      return teamsAllowedForMatches;
    }

    return teamsAllowedForMatches.filter((team) => team.division === division);
  }, [championshipUsesDivisions, division, selectedCreateGroupOption, teamsAllowedForMatches]);

  const groupStageMatchBracketBindingByMatchId = useMemo(() => {
    return resolveGroupStageMatchBindingByMatchId(championshipBracketView);
  }, [championshipBracketView]);

  const editingMatch = useMemo(() => {
    if (!editingMatchId) {
      return null;
    }

    return matches.find((match) => match.id == editingMatchId) ?? null;
  }, [editingMatchId, matches]);

  const editingMatchBracketBinding = useMemo(() => {
    if (!editingMatchId) {
      return null;
    }

    return groupStageMatchBracketBindingByMatchId[editingMatchId] ?? null;
  }, [editingMatchId, groupStageMatchBracketBindingByMatchId]);

  const editingMatchGroupOptions = useMemo(() => {
    if (!editingMatchDraft) {
      return [];
    }

    const resolvedDivision = championshipUsesDivisions ? editingMatchDraft.division : null;

    return championshipBracketGroupStageOptions.filter((groupOption) => {
      return (
        groupOption.sport_id == editingMatchDraft.sportId &&
        groupOption.naipe == editingMatchDraft.naipe &&
        groupOption.division == resolvedDivision
      );
    });
  }, [championshipBracketGroupStageOptions, championshipUsesDivisions, editingMatchDraft]);

  const selectedEditingGroupOption = useMemo(() => {
    if (!editingMatchDraft?.selectedGroupOptionValue) {
      return null;
    }

    return (
      editingMatchGroupOptions.find((groupOption) => groupOption.value == editingMatchDraft.selectedGroupOptionValue) ?? null
    );
  }, [editingMatchDraft, editingMatchGroupOptions]);

  const eligibleTeamsForEditingMatch = useMemo(() => {
    if (!editingMatchDraft) {
      return teamsAllowedForMatches;
    }

    if (selectedEditingGroupOption) {
      const selectedGroupTeamIdSet = new Set(selectedEditingGroupOption.team_ids);

      return teamsAllowedForMatches.filter((team) => selectedGroupTeamIdSet.has(team.id));
    }

    if (!championshipUsesDivisions) {
      return teamsAllowedForMatches;
    }

    return teamsAllowedForMatches.filter((team) => team.division === editingMatchDraft.division);
  }, [championshipUsesDivisions, editingMatchDraft, selectedEditingGroupOption, teamsAllowedForMatches]);

  const pendingTieBreakTeamNameByContextKeyAndTeamId = useMemo(() => {
    return pendingTieBreakContexts.reduce<Record<string, Record<string, string>>>((carry, pendingTieBreakContext) => {
      carry[pendingTieBreakContext.context_key] = pendingTieBreakContext.teams.reduce<Record<string, string>>((teamCarry, team) => {
        teamCarry[team.team_id] = team.team_name;
        return teamCarry;
      }, {});
      return carry;
    }, {});
  }, [pendingTieBreakContexts]);

  const isTieBreakResolutionReady = useMemo(() => {
    if (pendingTieBreakContexts.length == 0) {
      return false;
    }

    return pendingTieBreakContexts.every((pendingTieBreakContext) => {
      return draftTieBreakTeamIdsByContextKey[pendingTieBreakContext.context_key]?.length == pendingTieBreakContext.teams.length;
    });
  }, [draftTieBreakTeamIdsByContextKey, pendingTieBreakContexts]);

  const shouldShowTieBreakBanner = useMemo(() => {
    return (
      pendingTieBreakContexts.length > 0 &&
      championshipBracketView.edition?.status == BracketEditionStatus.GROUPS_GENERATED &&
      bracketGroupMatchesProgress.total > 0 &&
      bracketGroupMatchesProgress.pending == 0
    );
  }, [
    bracketGroupMatchesProgress.pending,
    bracketGroupMatchesProgress.total,
    championshipBracketView.edition?.status,
    pendingTieBreakContexts.length,
  ]);

  const filteredAndSortedMatches = useMemo(() => {
    return [...matches]
      .filter((match) => {
        if (matchesSportFilter !== ALL_MATCHES_SPORT_FILTER && match.sport_id != matchesSportFilter) {
          return false;
        }

        if (matchesStatusFilter == MATCHES_STATUS_FILTER_LIVE && match.status != MatchStatus.LIVE) {
          return false;
        }

        if (matchesStatusFilter == MATCHES_STATUS_FILTER_FINISHED && match.status != MatchStatus.FINISHED) {
          return false;
        }

        if (matchesStatusFilter == MATCHES_STATUS_FILTER_OPEN && match.status != MatchStatus.SCHEDULED) {
          return false;
        }

        if (matchesTeamFilter !== ALL_MATCHES_TEAM_FILTER) {
          const isHomeTeamMatch = match.home_team_id == matchesTeamFilter;
          const isAwayTeamMatch = match.away_team_id == matchesTeamFilter;

          if (!isHomeTeamMatch && !isAwayTeamMatch) {
            return false;
          }
        }

        if (matchesNaipeFilter !== ALL_MATCHES_NAIPE_FILTER && match.naipe != matchesNaipeFilter) {
          return false;
        }

        if (
          championshipUsesDivisions &&
          matchesDivisionFilter != ALL_MATCHES_DIVISION_FILTER &&
          match.division != matchesDivisionFilter
        ) {
          return false;
        }

        if (matchesGroupFilter != ALL_MATCHES_GROUP_FILTER) {
          const matchBracketContext = matchBracketContextByMatchId[match.id];

          if (!matchBracketContext || matchBracketContext.groupFilterValue != matchesGroupFilter) {
            return false;
          }
        }

        return true;
      })
      .sort((firstMatch, secondMatch) => {
        const statusOrderDifference = MATCH_STATUS_SORT_ORDER[firstMatch.status] - MATCH_STATUS_SORT_ORDER[secondMatch.status];

        if (statusOrderDifference != 0) {
          return statusOrderDifference;
        }

        if (firstMatch.status == MatchStatus.SCHEDULED && secondMatch.status == MatchStatus.SCHEDULED) {
          const firstScheduledDate = resolveMatchScheduledDateValue(firstMatch) ?? "9999-12-31";
          const secondScheduledDate = resolveMatchScheduledDateValue(secondMatch) ?? "9999-12-31";

          if (firstScheduledDate != secondScheduledDate) {
            return firstScheduledDate.localeCompare(secondScheduledDate);
          }

          return (firstMatch.queue_position ?? Number.MAX_SAFE_INTEGER) - (secondMatch.queue_position ?? Number.MAX_SAFE_INTEGER);
        }

        if (firstMatch.status == MatchStatus.FINISHED && secondMatch.status == MatchStatus.FINISHED) {
          const firstTimestamp = new Date(firstMatch.end_time ?? firstMatch.start_time ?? firstMatch.created_at).getTime();
          const secondTimestamp = new Date(secondMatch.end_time ?? secondMatch.start_time ?? secondMatch.created_at).getTime();

          return secondTimestamp - firstTimestamp;
        }

        const firstTimestamp = new Date(firstMatch.start_time ?? firstMatch.created_at).getTime();
        const secondTimestamp = new Date(secondMatch.start_time ?? secondMatch.created_at).getTime();

        return secondTimestamp - firstTimestamp;
      });
  }, [
    championshipUsesDivisions,
    matchBracketContextByMatchId,
    matches,
    matchesDivisionFilter,
    matchesGroupFilter,
    matchesNaipeFilter,
    matchesSportFilter,
    matchesStatusFilter,
    matchesTeamFilter,
  ]);

  const filteredMatchIds = useMemo(() => {
    return filteredAndSortedMatches.map((match) => match.id);
  }, [filteredAndSortedMatches]);

  const matchesTotalPages = Math.max(1, Math.ceil(filteredAndSortedMatches.length / matchesItemsPerPage));

  const paginatedMatches = useMemo(() => {
    const rangeStart = (matchesCurrentPage - 1) * matchesItemsPerPage;
    const rangeEnd = rangeStart + matchesItemsPerPage;

    return filteredAndSortedMatches.slice(rangeStart, rangeEnd);
  }, [filteredAndSortedMatches, matchesCurrentPage, matchesItemsPerPage]);

  const selectedFilteredMatchCount = useMemo(() => {
    const filteredMatchIdSet = new Set(filteredMatchIds);

    return selectedMatchIds.filter((selectedMatchId) => filteredMatchIdSet.has(selectedMatchId)).length;
  }, [filteredMatchIds, selectedMatchIds]);

  const selectAllMatchesChecked: CheckedState =
    filteredMatchIds.length == 0
      ? false
      : selectedFilteredMatchCount == filteredMatchIds.length
        ? true
        : selectedFilteredMatchCount > 0
          ? "indeterminate"
          : false;

  useEffect(() => {
    setMatchesCurrentPage(1);
    setSelectedMatchIds([]);
  }, [
    matchesDivisionFilter,
    matchesGroupFilter,
    matchesItemsPerPage,
    matchesNaipeFilter,
    matchesSportFilter,
    matchesStatusFilter,
    matchesTeamFilter,
  ]);

  useEffect(() => {
    if (matchesCurrentPage > matchesTotalPages) {
      setMatchesCurrentPage(matchesTotalPages);
    }
  }, [matchesCurrentPage, matchesTotalPages]);

  useEffect(() => {
    const validGroupFilterValues = new Set(groupsForMatchesFilter.map((groupOption) => groupOption.value));

    if (matchesGroupFilter != ALL_MATCHES_GROUP_FILTER && !validGroupFilterValues.has(matchesGroupFilter)) {
      setMatchesGroupFilter(ALL_MATCHES_GROUP_FILTER);
    }
  }, [groupsForMatchesFilter, matchesGroupFilter]);

  useEffect(() => {
    const matchIds = new Set(matches.map((match) => match.id));

    setSelectedMatchIds((currentSelectedMatchIds) => {
      return currentSelectedMatchIds.filter((selectedMatchId) => matchIds.has(selectedMatchId));
    });
  }, [matches]);

  useEffect(() => {
    if (!shouldShowTieBreakBanner) {
      setShowTieBreakDialog(false);
    }
  }, [shouldShowTieBreakBanner]);

  useEffect(() => {
    if (!editingMatchDraft || editingMatchBracketBinding == null) {
      return;
    }

    if (!editingMatchDraft.selectedGroupOptionValue) {
      return;
    }

    const validGroupOptionValueSet = new Set(editingMatchGroupOptions.map((groupOption) => groupOption.value));

    if (validGroupOptionValueSet.has(editingMatchDraft.selectedGroupOptionValue)) {
      return;
    }

    setEditingMatchDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      if (!currentDraft.selectedGroupOptionValue) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        selectedGroupOptionValue: "",
      };
    });
  }, [editingMatchBracketBinding, editingMatchDraft, editingMatchGroupOptions]);

  useEffect(() => {
    if (!editingMatchDraft || !selectedEditingGroupOption) {
      return;
    }

    const selectedGroupTeamIdSet = new Set(selectedEditingGroupOption.team_ids);

    if (
      selectedGroupTeamIdSet.has(editingMatchDraft.homeTeamId) &&
      selectedGroupTeamIdSet.has(editingMatchDraft.awayTeamId)
    ) {
      return;
    }

    setEditingMatchDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      const nextHomeTeamId = selectedGroupTeamIdSet.has(currentDraft.homeTeamId) ? currentDraft.homeTeamId : "";
      const nextAwayTeamId = selectedGroupTeamIdSet.has(currentDraft.awayTeamId) ? currentDraft.awayTeamId : "";

      if (nextHomeTeamId == currentDraft.homeTeamId && nextAwayTeamId == currentDraft.awayTeamId) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        homeTeamId: nextHomeTeamId,
        awayTeamId: nextAwayTeamId,
      };
    });
  }, [editingMatchDraft, selectedEditingGroupOption]);

  useEffect(() => {
    if (!selectedGroupOptionValue) {
      return;
    }

    const validGroupOptionValueSet = new Set(createMatchGroupOptions.map((groupOption) => groupOption.value));

    if (validGroupOptionValueSet.has(selectedGroupOptionValue)) {
      return;
    }

    setSelectedGroupOptionValue("");
  }, [createMatchGroupOptions, selectedGroupOptionValue]);

  useEffect(() => {
    if (!selectedCreateGroupOption) {
      return;
    }

    const selectedGroupTeamIdSet = new Set(selectedCreateGroupOption.team_ids);

    if (selectedGroupTeamIdSet.has(homeTeamId) && selectedGroupTeamIdSet.has(awayTeamId)) {
      return;
    }

    setHomeTeamId((currentHomeTeamId) => {
      return selectedGroupTeamIdSet.has(currentHomeTeamId) ? currentHomeTeamId : "";
    });
    setAwayTeamId((currentAwayTeamId) => {
      return selectedGroupTeamIdSet.has(currentAwayTeamId) ? currentAwayTeamId : "";
    });
  }, [awayTeamId, homeTeamId, selectedCreateGroupOption]);

  const resolveNextGroupStageSlotNumber = async (competitionId: string) => {
    const { data: competitionBracketMatches, error: fetchBracketSlotError } = await supabase
      .from("championship_bracket_matches")
      .select("slot_number")
      .eq("competition_id", competitionId)
      .eq("phase", BracketPhase.GROUP_STAGE)
      .order("slot_number", { ascending: false })
      .limit(1);

    if (fetchBracketSlotError) {
      return {
        slotNumber: null,
        errorMessage: fetchBracketSlotError.message,
      };
    }

    return {
      slotNumber: (competitionBracketMatches?.[0]?.slot_number ?? 0) + 1,
      errorMessage: null,
    };
  };

  const createGroupStageBracketBinding = async (params: {
    matchId: string;
    homeTeamId: string;
    awayTeamId: string;
    groupOptionValue: string;
  }) => {
    if (!championshipBracketView.edition?.id) {
      return {
        errorMessage: "Não há edição de chaveamento configurada para vincular este jogo a uma chave.",
      };
    }

    const selectedGroupOption = championshipBracketGroupStageOptions.find((groupOption) => {
      return groupOption.value == params.groupOptionValue;
    });

    if (!selectedGroupOption) {
      return {
        errorMessage: "Selecione uma chave válida antes de salvar.",
      };
    }

    const nextSlotNumberResponse = await resolveNextGroupStageSlotNumber(selectedGroupOption.competition_id);

    if (nextSlotNumberResponse.errorMessage || nextSlotNumberResponse.slotNumber == null) {
      return {
        errorMessage: nextSlotNumberResponse.errorMessage ?? "Não foi possível definir a posição do jogo na chave.",
      };
    }

    const { error: bracketInsertError } = await supabase.from("championship_bracket_matches").insert({
      bracket_edition_id: championshipBracketView.edition.id,
      competition_id: selectedGroupOption.competition_id,
      group_id: selectedGroupOption.group_id,
      phase: BracketPhase.GROUP_STAGE,
      round_number: 1,
      slot_number: nextSlotNumberResponse.slotNumber,
      match_id: params.matchId,
      home_team_id: params.homeTeamId,
      away_team_id: params.awayTeamId,
    });

    return {
      errorMessage: bracketInsertError?.message ?? null,
    };
  };

  const moveMatchesToNextChampionshipDay = async (matchesToMove: Match[], emptySelectionMessage: string) => {
    if (!canManageMatches) {
      return;
    }

    if (matchesToMove.length == 0) {
      toast.error(emptySelectionMessage);
      return;
    }

    if (championshipDayDates.length < 2) {
      toast.error("Cadastre pelo menos dois dias de campeonato para mover jogos para o próximo dia.");
      return;
    }

    const orderedMatchesToMove = [...matchesToMove]
      .sort((firstMatch, secondMatch) => {
        const firstScheduledDate = resolveMatchScheduledDateValue(firstMatch) ?? "9999-12-31";
        const secondScheduledDate = resolveMatchScheduledDateValue(secondMatch) ?? "9999-12-31";

        if (firstScheduledDate != secondScheduledDate) {
          return firstScheduledDate.localeCompare(secondScheduledDate);
        }

        return (firstMatch.queue_position ?? Number.MAX_SAFE_INTEGER) - (secondMatch.queue_position ?? Number.MAX_SAFE_INTEGER);
      });

    setApplyingBulkAction(true);

    let movedMatchesCount = 0;
    let skippedMatchesCount = 0;

    for (const selectedMatch of orderedMatchesToMove) {
      if (selectedMatch.status != MatchStatus.SCHEDULED) {
        skippedMatchesCount += 1;
        continue;
      }

      const currentScheduledDate = resolveMatchScheduledDateValue(selectedMatch);

      if (!currentScheduledDate) {
        skippedMatchesCount += 1;
        continue;
      }

      const nextScheduledDate = championshipDayDates.find((championshipDayDate) => championshipDayDate > currentScheduledDate);

      if (!nextScheduledDate) {
        skippedMatchesCount += 1;
        continue;
      }

      const { error } = await supabase
        .from("matches")
        .update({
          scheduled_date: nextScheduledDate,
          queue_position: null,
        })
        .eq("id", selectedMatch.id);

      if (error) {
        setApplyingBulkAction(false);
        toast.error(error.message);
        return;
      }

      movedMatchesCount += 1;
    }

    setApplyingBulkAction(false);

    if (movedMatchesCount == 0) {
      toast.error("Nenhum jogo selecionado pôde ser movido para o próximo dia.");
      return;
    }

    await Promise.all([onRefetch(), onRefetchChampionshipBracket()]);

    if (skippedMatchesCount > 0) {
      toast.success(`${movedMatchesCount} jogo(s) movido(s). ${skippedMatchesCount} não tinham próximo dia disponível.`);
      return;
    }

    toast.success(`${movedMatchesCount} jogo(s) movido(s) para o próximo dia.`);
  };

  const handleMoveSelectedMatchesToNextChampionshipDay = async () => {
    const matchesById = matches.reduce<Record<string, Match>>((carry, match) => {
      carry[match.id] = match;
      return carry;
    }, {});

    const selectedMatches = selectedMatchIds
      .map((selectedMatchId) => matchesById[selectedMatchId] ?? null)
      .filter((match): match is Match => match != null);

    await moveMatchesToNextChampionshipDay(selectedMatches, "Selecione ao menos um jogo.");
  };

  const handleMoveFilteredMatchesToNextChampionshipDay = async () => {
    await moveMatchesToNextChampionshipDay(filteredAndSortedMatches, "Nenhum jogo filtrado disponível para mover.");
  };

  const handleAdd = async () => {
    if (!canManageMatches) {
      return;
    }

    const resolvedLocation = location.trim();

    if (!sportId || !homeTeamId || !awayTeamId || !resolvedLocation || !scheduledDate) {
      toast.error("Preencha todos os campos.");
      return;
    }

    if (homeTeamId === awayTeamId) {
      toast.error("Times devem ser diferentes.");
      return;
    }

    const { data: insertedMatch, error } = await supabase
      .from("matches")
      .insert({
        championship_id: selectedChampionship.id,
        season_year: selectedChampionship.current_season_year,
        naipe,
        sport_id: sportId,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        location: resolvedLocation,
        scheduled_date: resolveDateOnlyString(scheduledDate),
        queue_position: null,
        start_time: null,
        end_time: null,
        division: championshipUsesDivisions ? division : null,
      })
      .select("id")
      .single();

    if (error || !insertedMatch) {
      toast.error(error?.message ?? "Não foi possível criar o jogo.");
      return;
    }

    if (selectedGroupOptionValue) {
      const bracketBindingResponse = await createGroupStageBracketBinding({
        matchId: insertedMatch.id,
        homeTeamId,
        awayTeamId,
        groupOptionValue: selectedGroupOptionValue,
      });

      if (bracketBindingResponse.errorMessage) {
        await supabase.from("matches").delete().eq("id", insertedMatch.id);
        toast.error(bracketBindingResponse.errorMessage);
        return;
      }
    }

    toast.success("Jogo criado!");
    setShowCreateMatchModal(false);
    resetCreateMatchForm();
    await Promise.all([onRefetch(), onRefetchChampionshipBracket()]);
  };

  const handleDelete = async (matchId: string) => {
    if (!canManageMatches) {
      return;
    }

    setDeletingMatches(true);

    const { error } = await supabase.from("matches").delete().eq("id", matchId);

    setDeletingMatches(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Jogo removido.");
    setSelectedMatchIds((currentSelectedMatchIds) => currentSelectedMatchIds.filter((selectedMatchId) => selectedMatchId != matchId));
    onRefetch();
    onRefetchChampionshipBracket();
  };

  const handleToggleSelectAllMatches = (checked: CheckedState) => {
    if (checked == true) {
      setSelectedMatchIds(filteredMatchIds);
      return;
    }

    setSelectedMatchIds([]);
  };

  const handleToggleSelectedMatch = (matchId: string, checked: CheckedState) => {
    setSelectedMatchIds((currentSelectedMatchIds) => {
      if (checked == true) {
        if (currentSelectedMatchIds.includes(matchId)) {
          return currentSelectedMatchIds;
        }

        return [...currentSelectedMatchIds, matchId];
      }

      return currentSelectedMatchIds.filter((selectedMatchId) => selectedMatchId != matchId);
    });
  };

  const handleDeleteSelectedMatches = async () => {
    if (!canManageMatches) {
      return;
    }

    if (selectedMatchIds.length == 0) {
      toast.error("Selecione ao menos um jogo.");
      return;
    }

    const confirmed = window.confirm(`Excluir ${selectedMatchIds.length} jogo(s) selecionado(s)?`);

    if (!confirmed) {
      return;
    }

    setDeletingMatches(true);

    const { error } = await supabase.from("matches").delete().in("id", selectedMatchIds);

    setDeletingMatches(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Jogos removidos.");
    setSelectedMatchIds([]);
    onRefetch();
    onRefetchChampionshipBracket();
  };

  const handleStartEditingMatch = (match: Match) => {
    if (!canManageMatches) {
      return;
    }

    const matchBracketBinding = groupStageMatchBracketBindingByMatchId[match.id];

    setEditingMatchId(match.id);
    setEditingMatchDraft({
      sportId: match.sport_id,
      homeTeamId: match.home_team_id,
      awayTeamId: match.away_team_id,
      location: match.location,
      scheduledDate: resolveScheduledDateDraftValue(match),
      division: match.division ?? TeamDivision.DIVISAO_PRINCIPAL,
      naipe: match.naipe,
      status: match.status,
      selectedGroupOptionValue: matchBracketBinding ? `${matchBracketBinding.competition_id}:${matchBracketBinding.group_id}` : "",
      resolvedTieBreakerRule: match.resolved_tie_breaker_rule ?? "",
    });
  };

  const handleCancelEditingMatch = () => {
    setSavingEditingMatch(false);
    setEditingMatchId(null);
    setEditingMatchDraft(null);
  };

  const handleSaveEditingMatch = async () => {
    if (!canManageMatches) {
      return;
    }

    if (!editingMatchId || !editingMatchDraft) {
      return;
    }

    const normalizedLocation = editingMatchDraft.location.trim();

    if (
      !editingMatchDraft.sportId ||
      !editingMatchDraft.homeTeamId ||
      !editingMatchDraft.awayTeamId ||
      !normalizedLocation ||
      !editingMatchDraft.scheduledDate
    ) {
      toast.error("Preencha todos os campos da edição.");
      return;
    }

    if (editingMatchDraft.homeTeamId === editingMatchDraft.awayTeamId) {
      toast.error("Times devem ser diferentes.");
      return;
    }

    if (editingMatchBracketBinding && !selectedEditingGroupOption) {
      toast.error("Selecione o grupo do jogo antes de salvar.");
      return;
    }

    setSavingEditingMatch(true);

    const editingMatch = matches.find((match) => match.id == editingMatchId) ?? null;
    const shouldResetMatchToScheduled =
      editingMatchDraft.status == MatchStatus.SCHEDULED && editingMatch?.status == MatchStatus.FINISHED;

    const { error } = await supabase
      .from("matches")
      .update({
        naipe: editingMatchDraft.naipe,
        sport_id: editingMatchDraft.sportId,
        home_team_id: editingMatchDraft.homeTeamId,
        away_team_id: editingMatchDraft.awayTeamId,
        location: normalizedLocation,
        scheduled_date: resolveDateOnlyString(editingMatchDraft.scheduledDate),
        queue_position: null,
        court_name: shouldResetMatchToScheduled || editingMatch?.status == MatchStatus.SCHEDULED ? null : editingMatch?.court_name ?? null,
        start_time: shouldResetMatchToScheduled || editingMatch?.status == MatchStatus.SCHEDULED ? null : editingMatch?.start_time ?? null,
        end_time: shouldResetMatchToScheduled || editingMatch?.status == MatchStatus.SCHEDULED ? null : editingMatch?.end_time ?? null,
        current_set_home_score: shouldResetMatchToScheduled ? null : editingMatch?.current_set_home_score ?? null,
        current_set_away_score: shouldResetMatchToScheduled ? null : editingMatch?.current_set_away_score ?? null,
        home_score: editingMatch?.home_score ?? 0,
        away_score: editingMatch?.away_score ?? 0,
        home_yellow_cards: editingMatch?.home_yellow_cards ?? 0,
        home_red_cards: editingMatch?.home_red_cards ?? 0,
        away_yellow_cards: editingMatch?.away_yellow_cards ?? 0,
        away_red_cards: editingMatch?.away_red_cards ?? 0,
        resolved_tie_breaker_rule: shouldResetMatchToScheduled ? null : editingMatchDraft.resolvedTieBreakerRule || null,
        resolved_tie_break_winner_team_id: shouldResetMatchToScheduled ? null : editingMatch?.resolved_tie_break_winner_team_id ?? null,
        status: editingMatchDraft.status,
        division: championshipUsesDivisions ? editingMatchDraft.division : null,
      })
      .eq("id", editingMatchId);

    if (error) {
      setSavingEditingMatch(false);
      toast.error(error.message);
      return;
    }

    if (editingMatchBracketBinding && selectedEditingGroupOption) {
      const nextBracketMatchPayload: {
        competition_id: string;
        group_id: string;
        home_team_id: string;
        away_team_id: string;
        slot_number?: number;
      } = {
        competition_id: selectedEditingGroupOption.competition_id,
        group_id: selectedEditingGroupOption.group_id,
        home_team_id: editingMatchDraft.homeTeamId,
        away_team_id: editingMatchDraft.awayTeamId,
      };

      if (editingMatchBracketBinding.competition_id != selectedEditingGroupOption.competition_id) {
        const nextSlotNumberResponse = await resolveNextGroupStageSlotNumber(selectedEditingGroupOption.competition_id);

        if (nextSlotNumberResponse.errorMessage || nextSlotNumberResponse.slotNumber == null) {
          setSavingEditingMatch(false);
          toast.error(nextSlotNumberResponse.errorMessage ?? "Não foi possível atualizar a chave do jogo.");
          return;
        }

        nextBracketMatchPayload.slot_number = nextSlotNumberResponse.slotNumber;
      }

      const { error: bracketMatchError } = await supabase
        .from("championship_bracket_matches")
        .update(nextBracketMatchPayload)
        .eq("match_id", editingMatchId);

      if (bracketMatchError) {
        setSavingEditingMatch(false);
        toast.error(bracketMatchError.message);
        return;
      }
    } else if (!editingMatchBracketBinding && selectedEditingGroupOption) {
      const bracketBindingResponse = await createGroupStageBracketBinding({
        matchId: editingMatchId,
        homeTeamId: editingMatchDraft.homeTeamId,
        awayTeamId: editingMatchDraft.awayTeamId,
        groupOptionValue: selectedEditingGroupOption.value,
      });

      if (bracketBindingResponse.errorMessage) {
        setSavingEditingMatch(false);
        toast.error(bracketBindingResponse.errorMessage);
        return;
      }
    }

    toast.success("Jogo atualizado.");
    setSavingEditingMatch(false);
    handleCancelEditingMatch();
    await Promise.all([onRefetch(), onRefetchChampionshipBracket()]);
  };

  const handleShuffleTieBreakContext = (pendingTieBreakContext: ChampionshipBracketTieBreakPendingContext) => {
    const orderedTeamIds = pendingTieBreakContext.teams.map((team) => team.team_id);
    let shuffledTeamIds = shuffleTeamIds(orderedTeamIds);

    if (
      orderedTeamIds.length > 1 &&
      orderedTeamIds.every((teamId, teamIndex) => teamId == shuffledTeamIds[teamIndex])
    ) {
      shuffledTeamIds = shuffleTeamIds(orderedTeamIds);
    }

    setDraftTieBreakTeamIdsByContextKey((currentDraftTieBreakTeamIdsByContextKey) => ({
      ...currentDraftTieBreakTeamIdsByContextKey,
      [pendingTieBreakContext.context_key]: shuffledTeamIds,
    }));
  };

  const handleSaveTieBreakResolutions = async () => {
    if (pendingTieBreakContexts.length == 0 || !championshipBracketView.edition?.id) {
      return;
    }

    if (!isTieBreakResolutionReady) {
      toast.error("Realize o sorteio de todos os desempates pendentes antes de confirmar.");
      return;
    }

    setSavingTieBreakResolutions(true);

    for (const pendingTieBreakContext of pendingTieBreakContexts) {
      const orderedTeamIds = draftTieBreakTeamIdsByContextKey[pendingTieBreakContext.context_key] ?? [];

      const response = await saveChampionshipBracketTieBreakResolution({
        context_key: pendingTieBreakContext.context_key,
        competition_id: pendingTieBreakContext.competition_id,
        context_type: pendingTieBreakContext.context_type,
        group_id: pendingTieBreakContext.group_id,
        qualification_rank: pendingTieBreakContext.qualification_rank,
        team_ids: orderedTeamIds,
      });

      if (response.error) {
        setSavingTieBreakResolutions(false);
        toast.error(resolveAdminMatchesOperationalErrorMessage(response.error));
        return;
      }
    }

    const knockoutResponse = await generateChampionshipKnockout(
      selectedChampionship.id,
      championshipBracketView.edition.id,
    );

    if (knockoutResponse.error) {
      setSavingTieBreakResolutions(false);
      toast.error(resolveAdminMatchesOperationalErrorMessage(knockoutResponse.error));
      await loadPendingTieBreakContexts();
      return;
    }

    await Promise.all([
      onRefetch(),
      onRefetchChampionshipBracket(),
      loadPendingTieBreakContexts(),
    ]);

    setSavingTieBreakResolutions(false);
    setShowTieBreakDialog(false);
    toast.success("Sorteio salvo e mata-mata atualizado.");
  };

  const handleOpenCreateMatchModal = () => {
    resetCreateMatchForm();
    setShowCreateMatchModal(true);
  };

  return (
    <div className="space-y-6">
      {shouldShowTieBreakBanner ? (
        <div className="glass-card enter-section border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span>Sorteio manual pendente para liberar o mata-mata</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {pendingTieBreakContexts.length} empate(s) chegaram ao último critério. Resolva o sorteio manual para liberar a geração do mata-mata desta edição.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setShowTieBreakDialog(true)}
              disabled={loadingPendingTieBreakContexts || savingTieBreakResolutions}
            >
              Resolver sorteios
            </Button>
          </div>
        </div>
      ) : null}

      <div className="enter-section space-y-3">
        <SportFilter
          sports={sportsForMatchesFilter}
          selected={matchesSportFilter == ALL_MATCHES_SPORT_FILTER ? null : matchesSportFilter}
          onSelect={(sportFilterValue) => setMatchesSportFilter(sportFilterValue ?? ALL_MATCHES_SPORT_FILTER)}
        />

        <div className="glass-card enter-section space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-6 xl:items-center">
            <div className="xl:min-w-0">
              <Select value={matchesStatusFilter} onValueChange={setMatchesStatusFilter}>
                <SelectTrigger className="glass-input w-full">
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MATCHES_STATUS_FILTER}>Geral</SelectItem>
                  <SelectItem value={MATCHES_STATUS_FILTER_LIVE}>Ao vivo</SelectItem>
                  <SelectItem value={MATCHES_STATUS_FILTER_FINISHED}>Encerrados</SelectItem>
                  <SelectItem value={MATCHES_STATUS_FILTER_OPEN}>Em aberto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="xl:min-w-0">
              <Select value={matchesNaipeFilter} onValueChange={setMatchesNaipeFilter}>
                <SelectTrigger className="glass-input w-full">
                  <SelectValue placeholder="Filtrar por naipe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MATCHES_NAIPE_FILTER}>Todos os naipes</SelectItem>
                  {NAIPE_OPTIONS.map((naipeOption) => (
                    <SelectItem key={naipeOption} value={naipeOption}>
                      {MATCH_NAIPE_LABELS[naipeOption]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="xl:min-w-0">
              {championshipUsesDivisions ? (
                <Select value={matchesDivisionFilter} onValueChange={setMatchesDivisionFilter}>
                  <SelectTrigger className="glass-input w-full">
                    <SelectValue placeholder="Filtrar por divisão" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_MATCHES_DIVISION_FILTER}>Todas as divisões</SelectItem>
                    <SelectItem value={TeamDivision.DIVISAO_PRINCIPAL}>
                      {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_PRINCIPAL]}
                    </SelectItem>
                    <SelectItem value={TeamDivision.DIVISAO_ACESSO}>
                      {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_ACESSO]}
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="glass-panel-muted flex h-10 w-full items-center rounded-xl px-3 py-2 text-sm text-muted-foreground">
                  Divisão unificada
                </div>
              )}
            </div>

            <div className="xl:min-w-0">
              <Select value={matchesGroupFilter} onValueChange={setMatchesGroupFilter}>
                <SelectTrigger className="glass-input w-full">
                  <SelectValue placeholder="Filtrar por grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MATCHES_GROUP_FILTER}>Todos os grupos</SelectItem>
                  {groupsForMatchesFilter.map((groupOption) => (
                    <SelectItem key={groupOption.value} value={groupOption.value}>
                      {groupOption.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="xl:min-w-0">
              <Select value={matchesTeamFilter} onValueChange={setMatchesTeamFilter}>
                <SelectTrigger className="glass-input w-full">
                  <SelectValue placeholder="Filtrar por atlética" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MATCHES_TEAM_FILTER}>Todas as atléticas</SelectItem>
                  {teamsForMatchesFilter.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {canManageMatches ? (
              <Button type="button" onClick={handleOpenCreateMatchModal} className="w-full xl:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Criar jogo
              </Button>
            ) : null}
          </div>
        </div>

        {!canManageMatches ? (
          <p className="text-sm text-muted-foreground">Perfil em visualização: sem permissão para criar, editar ou remover jogos.</p>
        ) : null}

        {filteredAndSortedMatches.length > 0 ? (
          <>
            <div className="glass-card enter-section flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                {canManageMatches ? (
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox checked={selectAllMatchesChecked} onCheckedChange={handleToggleSelectAllMatches} />
                    <span>Selecionar todos os jogos filtrados</span>
                  </label>
                ) : null}

                {canManageMatches && selectedFilteredMatchCount > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleMoveSelectedMatchesToNextChampionshipDay()}
                      disabled={deletingMatches || applyingBulkAction || selectedMatchIds.length == 0}
                    >
                      Mover selecionados para o próximo dia
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleMoveFilteredMatchesToNextChampionshipDay()}
                      disabled={deletingMatches || applyingBulkAction || filteredAndSortedMatches.length == 0}
                    >
                      Mover todos os jogos filtrados
                    </Button>

                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void handleDeleteSelectedMatches()}
                      disabled={deletingMatches || applyingBulkAction || selectedMatchIds.length == 0}
                    >
                      Excluir selecionados
                    </Button>
                  </div>
                ) : null}

                <p className="text-sm text-muted-foreground">
                  {filteredAndSortedMatches.length} jogo(s) encontrado(s)
                </p>
              </div>

            </div>

            {paginatedMatches.map((match) => {
              const matchBracketContext = matchBracketContextByMatchId[match.id];
              const startedAtLabel = resolveMatchStartedAtLabel(match.start_time);
              const tieBreakRuleLabel = resolveMatchTieBreakRuleLabel(match.resolved_tie_breaker_rule);
              const isSetMatch = match.result_rule == ChampionshipSportResultRule.SETS;
              const setSummary = isSetMatch ? resolveMatchSetSummary(match) : [];
              const displayedHomeScore =
                isSetMatch && match.status == MatchStatus.LIVE ? match.current_set_home_score ?? 0 : match.home_score;
              const displayedAwayScore =
                isSetMatch && match.status == MatchStatus.LIVE ? match.current_set_away_score ?? 0 : match.away_score;

              return (
                <div key={match.id} className="list-item-card list-item-card-hover space-y-3 px-4 py-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <div className="flex w-full items-center gap-2 overflow-x-auto pb-1">
                          {canManageMatches ? (
                            <Checkbox
                              checked={selectedMatchIds.includes(match.id)}
                              onCheckedChange={(checked) => handleToggleSelectedMatch(match.id, checked)}
                            />
                          ) : null}

                          <span className="shrink-0 text-xs font-medium uppercase text-muted-foreground">{match.sports?.name}</span>

                          <AppBadge tone={resolveMatchNaipeBadgeTone(String(match.naipe))} className="shrink-0 whitespace-nowrap">
                            {resolveMatchNaipeLabel(String(match.naipe))}
                          </AppBadge>

                          <AppBadge tone={resolveMatchStatusBadgeTone(match.status)} className="shrink-0 whitespace-nowrap">
                            {resolveMatchStatusLabel(match.status)}
                          </AppBadge>

                          {match.division ? (
                            <AppBadge tone={TEAM_DIVISION_BADGE_TONES[match.division]} className="shrink-0 whitespace-nowrap">
                              {TEAM_DIVISION_LABELS[match.division]}
                            </AppBadge>
                          ) : null}

                          {matchBracketContext ? (
                            <AppBadge tone={AppBadgeTone.NEUTRAL} className="shrink-0 whitespace-nowrap">
                              {matchBracketContext.badgeLabel}
                            </AppBadge>
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex min-h-9 items-center gap-2 text-sm font-display font-semibold">
                            <span className="truncate">{match.home_team?.name}</span>
                            <span className="shrink-0 text-base font-bold score-text">
                              {displayedHomeScore} × {displayedAwayScore}
                            </span>
                            <span className="truncate">{match.away_team?.name}</span>
                          </div>

                          <div className="space-y-0.5 text-xs text-muted-foreground">
                            <p>Local: {match.location}</p>
                            <p>Fila: {resolveScheduledQueueSummary(match)}</p>
                            {startedAtLabel ? <p>{startedAtLabel}</p> : null}
                            {isSetMatch && match.status != MatchStatus.SCHEDULED ? (
                              <p>Sets ganhos: {match.home_score} × {match.away_score}</p>
                            ) : null}
                            {setSummary.length > 0 ? (
                              <div className="space-y-0.5 rounded-lg border border-border/40 bg-background/40 p-2">
                                {setSummary.map((matchSetItem) => (
                                  <p key={`${match.id}-admin-set-${matchSetItem.setNumber}`}>{matchSetItem.text}</p>
                                ))}
                              </div>
                            ) : null}
                            {tieBreakRuleLabel ? (
                              <p className="inline-flex items-center gap-1 font-medium text-amber-500">
                                <AlertTriangle className="h-3 w-3" />
                                Desempate por {tieBreakRuleLabel}.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {canManageMatches ? (
                        <div className="flex shrink-0 flex-col items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Editar jogo ${match.home_team?.name ?? "casa"} x ${match.away_team?.name ?? "visitante"}`}
                            onClick={() => handleStartEditingMatch(match)}
                            disabled={deletingMatches}
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Excluir jogo ${match.home_team?.name ?? "casa"} x ${match.away_team?.name ?? "visitante"}`}
                            onClick={() => handleDelete(match.id)}
                            disabled={deletingMatches}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}

            <AppPaginationControls
              currentPage={matchesCurrentPage}
              totalPages={matchesTotalPages}
              onPageChange={setMatchesCurrentPage}
              itemsPerPage={matchesItemsPerPage}
              onItemsPerPageChange={setMatchesItemsPerPage}
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum jogo encontrado para os filtros selecionados.</p>
        )}
      </div>

      <Dialog open={showTieBreakDialog} onOpenChange={setShowTieBreakDialog}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Resolver sorteios de desempate</DialogTitle>
            <DialogDescription>
              Quando a classificação chega ao último critério, o mata-mata fica bloqueado até você confirmar a ordem manual desses empates.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
            {pendingTieBreakContexts.map((pendingTieBreakContext) => {
              const orderedTeamIds = draftTieBreakTeamIdsByContextKey[pendingTieBreakContext.context_key] ?? [];
              const teamNameByTeamId = pendingTieBreakTeamNameByContextKeyAndTeamId[pendingTieBreakContext.context_key] ?? {};
              const displayedTieBreakSlots = pendingTieBreakContext.teams.map((_, teamIndex) => ({
                position: teamIndex + 1,
                teamId: orderedTeamIds[teamIndex] ?? null,
              }));

              return (
                <div key={pendingTieBreakContext.context_key} className="glass-card space-y-3 border border-border/60 p-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">{pendingTieBreakContext.title}</h3>
                    <p className="text-sm text-muted-foreground">{pendingTieBreakContext.description}</p>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    {displayedTieBreakSlots.map((displayedTieBreakSlot) => (
                        <div
                          key={`${pendingTieBreakContext.context_key}:${displayedTieBreakSlot.position}`}
                          className="glass-panel-muted flex items-center justify-between rounded-xl px-3 py-2"
                        >
                          <span className="text-sm font-medium text-muted-foreground">{displayedTieBreakSlot.position}º</span>
                          <span className="flex-1 truncate px-3 text-sm font-medium text-foreground">
                            {displayedTieBreakSlot.teamId ? teamNameByTeamId[displayedTieBreakSlot.teamId] ?? "Atlética" : ""}
                          </span>
                        </div>
                      ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleShuffleTieBreakContext(pendingTieBreakContext)}
                      disabled={savingTieBreakResolutions}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {orderedTeamIds.length > 0 ? "Refazer sorteio" : "Sortear ordem"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowTieBreakDialog(false)}
              disabled={savingTieBreakResolutions}
            >
              Fechar
            </Button>
            <Button
              type="button"
              onClick={handleSaveTieBreakResolutions}
              disabled={!isTieBreakResolutionReady || savingTieBreakResolutions}
            >
              Confirmar sorteios e gerar mata-mata
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingMatchId != null && editingMatchDraft != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            handleCancelEditingMatch();
          }
        }}
      >
        {editingMatch && editingMatchDraft ? (
          <DialogContent className="sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>Editar jogo - {selectedChampionship.name}</DialogTitle>
              <DialogDescription>Atualize naipe, modalidade, grupo, times, local e o dia da fila do confronto.</DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Naipe</p>
                <RadioGroup
                  value={editingMatchDraft.naipe}
                  onValueChange={(value) => {
                    if (!isMatchNaipe(value)) {
                      return;
                    }

                    setEditingMatchDraft((currentDraft) =>
                      currentDraft
                        ? {
                            ...currentDraft,
                            naipe: value,
                            sportId: "",
                            selectedGroupOptionValue: "",
                            homeTeamId: "",
                            awayTeamId: "",
                          }
                        : currentDraft,
                    );
                  }}
                  className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-5"
                >
                  {NAIPE_OPTIONS.map((naipeOption) => (
                    <Label
                      key={naipeOption}
                      htmlFor={`edit-match-naipe-${naipeOption}`}
                      className="flex cursor-pointer items-center gap-2 p-0 text-sm font-medium text-foreground"
                    >
                      <RadioGroupItem id={`edit-match-naipe-${naipeOption}`} value={naipeOption} />
                      <span>{MATCH_NAIPE_LABELS[naipeOption]}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contexto do jogo</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Select
                    value={editingMatchDraft.sportId}
                    onValueChange={(value) =>
                      setEditingMatchDraft((currentDraft) =>
                        currentDraft
                          ? {
                              ...currentDraft,
                              sportId: value,
                              selectedGroupOptionValue: "",
                              homeTeamId: "",
                              awayTeamId: "",
                            }
                          : currentDraft,
                      )
                    }
                  >
                    <SelectTrigger aria-label="Modalidade do jogo" className="glass-input">
                      <SelectValue placeholder="Modalidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSportsForEditing.map((sport) => (
                        <SelectItem key={sport.id} value={sport.id}>
                          {sport.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {championshipUsesDivisions ? (
                    <Select
                      value={editingMatchDraft.division}
                      onValueChange={(value) => {
                        if (!isTeamDivision(value)) {
                          return;
                        }

                        setEditingMatchDraft((currentDraft) =>
                          currentDraft
                            ? {
                                ...currentDraft,
                                division: value,
                                homeTeamId: "",
                                awayTeamId: "",
                                selectedGroupOptionValue: "",
                              }
                            : currentDraft,
                        );
                      }}
                    >
                      <SelectTrigger aria-label="Divisão do jogo" className="glass-input">
                        <SelectValue placeholder="Divisão" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={TeamDivision.DIVISAO_PRINCIPAL}>
                          {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_PRINCIPAL]}
                        </SelectItem>
                        <SelectItem value={TeamDivision.DIVISAO_ACESSO}>
                          {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_ACESSO]}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="glass-panel-muted flex items-center rounded-xl px-3 py-2 text-sm text-muted-foreground">
                      Divisão unificada
                    </div>
                  )}

                  {hasConfiguredBracket ? (
                    <Select
                      value={editingMatchDraft.selectedGroupOptionValue || EMPTY_GROUP_OPTION_VALUE}
                      onValueChange={(value) =>
                        setEditingMatchDraft((currentDraft) =>
                          currentDraft
                            ? {
                                ...currentDraft,
                                selectedGroupOptionValue: value == EMPTY_GROUP_OPTION_VALUE ? "" : value,
                              }
                            : currentDraft,
                        )
                      }
                      disabled={loadingChampionshipBracket}
                    >
                      <SelectTrigger aria-label="Grupo do jogo" className="glass-input">
                        <SelectValue placeholder="Chave" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_GROUP_OPTION_VALUE}>Sem chave vinculada</SelectItem>
                        {editingMatchGroupOptions.map((groupOption) => (
                          <SelectItem key={groupOption.value} value={groupOption.value}>
                            {resolveChampionshipGroupLabel(groupOption.group_number)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="glass-panel-muted flex items-center rounded-xl px-3 py-2 text-sm text-muted-foreground">
                      Sem chave vinculada
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Operação do dia</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Select
                    value={editingMatchDraft.location}
                    onValueChange={(value) =>
                      setEditingMatchDraft((currentDraft) =>
                        currentDraft
                          ? {
                              ...currentDraft,
                              location: value,
                            }
                          : currentDraft,
                      )
                    }
                    disabled={editingLocationOptions.length == 0}
                  >
                    <SelectTrigger aria-label="Local do jogo" className="glass-input">
                      <SelectValue placeholder={loadingLocationTemplates ? "Carregando locais" : "Local"} />
                    </SelectTrigger>
                    <SelectContent>
                      {editingLocationOptions.map((locationOption) => (
                        <SelectItem key={locationOption} value={locationOption}>
                          {locationOption}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <DateTimePicker
                    value={editingMatchDraft.scheduledDate}
                    onChange={(value) =>
                      setEditingMatchDraft((currentDraft) =>
                        currentDraft
                          ? {
                              ...currentDraft,
                              scheduledDate: value,
                            }
                          : currentDraft,
                      )
                    }
                    placeholder="Dia da fila"
                    showTime={false}
                  />
                </div>

                {editingMatch.status == MatchStatus.FINISHED ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Select
                      value={editingMatchDraft.status}
                      onValueChange={(value) => {
                        if (value == MatchStatus.SCHEDULED || value == MatchStatus.FINISHED) {
                          setEditingMatchDraft((currentDraft) =>
                            currentDraft
                              ? {
                                  ...currentDraft,
                                  status: value,
                                  resolvedTieBreakerRule:
                                    value == MatchStatus.SCHEDULED ? "" : currentDraft.resolvedTieBreakerRule,
                                }
                              : currentDraft,
                          );
                        }
                      }}
                    >
                      <SelectTrigger aria-label="Status do jogo" className="glass-input">
                        <SelectValue placeholder="Status do jogo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={MatchStatus.FINISHED}>Encerrado</SelectItem>
                        <SelectItem value={MatchStatus.SCHEDULED}>Voltar para agendado mantendo resultado</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={editingMatchDraft.resolvedTieBreakerRule || EMPTY_TIE_BREAKER_RULE_OPTION_VALUE}
                      onValueChange={(value) =>
                        setEditingMatchDraft((currentDraft) =>
                          currentDraft
                            ? {
                                ...currentDraft,
                                resolvedTieBreakerRule:
                                  value == EMPTY_TIE_BREAKER_RULE_OPTION_VALUE
                                    ? ""
                                    : (value as ChampionshipSportTieBreakerRule),
                              }
                            : currentDraft,
                        )
                      }
                      disabled={editingMatchDraft.status != MatchStatus.FINISHED}
                    >
                      <SelectTrigger aria-label="Critério de desempate" className="glass-input">
                        <SelectValue placeholder="Critério de desempate" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_TIE_BREAKER_RULE_OPTION_VALUE}>Sem critério extra</SelectItem>
                        {Object.entries(CHAMPIONSHIP_SPORT_TIE_BREAKER_RULE_LABELS).map(([tieBreakerRule, label]) => (
                          <SelectItem key={tieBreakerRule} value={tieBreakerRule}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Participantes</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Select
                    value={editingMatchDraft.homeTeamId}
                    onValueChange={(value) =>
                      setEditingMatchDraft((currentDraft) =>
                        currentDraft
                          ? {
                              ...currentDraft,
                              homeTeamId: value,
                            }
                          : currentDraft,
                      )
                    }
                  >
                    <SelectTrigger aria-label="Time Casa" className="glass-input">
                      <SelectValue placeholder="Time Casa" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleTeamsForEditingMatch.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={editingMatchDraft.awayTeamId}
                    onValueChange={(value) =>
                      setEditingMatchDraft((currentDraft) =>
                        currentDraft
                          ? {
                              ...currentDraft,
                              awayTeamId: value,
                            }
                          : currentDraft,
                      )
                    }
                  >
                    <SelectTrigger aria-label="Time Visitante" className="glass-input">
                      <SelectValue placeholder="Time Visitante" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleTeamsForEditingMatch.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {hasConfiguredBracket && loadingChampionshipBracket ? (
                <p className="text-xs text-muted-foreground">Carregando dados das chaves desta edição.</p>
              ) : null}

              {hasConfiguredBracket && !loadingChampionshipBracket && editingMatchGroupOptions.length == 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhuma chave disponível para a combinação atual de modalidade, naipe e divisão.
                </p>
              ) : null}

              {editingLocationOptions.length == 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum local cadastrado para seleção. Cadastre um local antes de editar o jogo.</p>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCancelEditingMatch} disabled={savingEditingMatch}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleSaveEditingMatch} disabled={savingEditingMatch || deletingMatches}>
                Salvar alterações
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog
        open={showCreateMatchModal}
        onOpenChange={(isOpen) => {
          setShowCreateMatchModal(isOpen);

          if (!isOpen) {
            resetCreateMatchForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Novo jogo - {selectedChampionship.name}</DialogTitle>
            <DialogDescription>Defina naipe, modalidade, chave, times, local e o dia da fila do confronto.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Naipe</p>
              <RadioGroup
                value={naipe}
                onValueChange={(value) => {
                  if (isMatchNaipe(value)) {
                    setNaipe(value);
                  }
                }}
                className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-5"
              >
                {NAIPE_OPTIONS.map((naipeOption) => {
                  return (
                    <Label
                      key={naipeOption}
                      htmlFor={`create-match-naipe-${naipeOption}`}
                      className="flex cursor-pointer items-center gap-2 p-0 text-sm font-medium text-foreground"
                    >
                      <RadioGroupItem id={`create-match-naipe-${naipeOption}`} value={naipeOption} />
                      <span>{MATCH_NAIPE_LABELS[naipeOption]}</span>
                    </Label>
                  );
                })}
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contexto do jogo</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Select
                  value={sportId}
                  onValueChange={(value) => {
                    setSportId(value);
                    setSelectedGroupOptionValue("");
                    setHomeTeamId("");
                    setAwayTeamId("");
                  }}
                >
                  <SelectTrigger className="glass-input">
                    <SelectValue placeholder="Modalidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSportsForCreate.map((sport) => (
                      <SelectItem key={sport.id} value={sport.id}>
                        {sport.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {championshipUsesDivisions ? (
                  <Select
                    value={division}
                    onValueChange={(value) => {
                      if (isTeamDivision(value)) {
                        setDivision(value);
                        setSelectedGroupOptionValue("");
                        setHomeTeamId("");
                        setAwayTeamId("");
                      }
                    }}
                  >
                    <SelectTrigger className="glass-input">
                      <SelectValue placeholder="Divisão" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TeamDivision.DIVISAO_PRINCIPAL}>
                        {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_PRINCIPAL]}
                      </SelectItem>
                      <SelectItem value={TeamDivision.DIVISAO_ACESSO}>
                        {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_ACESSO]}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="glass-panel-muted flex items-center rounded-xl px-3 py-2 text-sm text-muted-foreground">
                    Divisão unificada
                  </div>
                )}

                {hasConfiguredBracket ? (
                  <Select
                    value={selectedGroupOptionValue || EMPTY_GROUP_OPTION_VALUE}
                    onValueChange={(value) => {
                      setSelectedGroupOptionValue(value == EMPTY_GROUP_OPTION_VALUE ? "" : value);
                    }}
                    disabled={loadingChampionshipBracket}
                  >
                    <SelectTrigger className="glass-input">
                      <SelectValue placeholder="Chave" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_GROUP_OPTION_VALUE}>Sem chave vinculada</SelectItem>
                      {createMatchGroupOptions.map((groupOption) => (
                        <SelectItem key={groupOption.value} value={groupOption.value}>
                          {resolveChampionshipGroupLabel(groupOption.group_number)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="glass-panel-muted flex items-center rounded-xl px-3 py-2 text-sm text-muted-foreground">
                    Sem chave vinculada
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Operação do dia</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Select value={location} onValueChange={setLocation} disabled={createLocationOptions.length == 0}>
                  <SelectTrigger className="glass-input">
                    <SelectValue placeholder={loadingLocationTemplates ? "Carregando locais" : "Local"} />
                  </SelectTrigger>
                  <SelectContent>
                    {createLocationOptions.map((locationOption) => (
                      <SelectItem key={locationOption} value={locationOption}>
                        {locationOption}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <DateTimePicker value={scheduledDate} onChange={setScheduledDate} placeholder="Dia da fila" showTime={false} />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Participantes</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Select value={homeTeamId} onValueChange={setHomeTeamId}>
                  <SelectTrigger className="glass-input">
                    <SelectValue placeholder="Time Casa" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleTeams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={awayTeamId} onValueChange={setAwayTeamId}>
                  <SelectTrigger className="glass-input">
                    <SelectValue placeholder="Time Visitante" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleTeams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {availableSportsForCreate.length == 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma modalidade vinculada ao campeonato para este naipe.</p>
            ) : null}

            {hasConfiguredBracket && !loadingChampionshipBracket && createMatchGroupOptions.length == 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma chave disponível para a combinação atual de modalidade, naipe e divisão.
              </p>
            ) : null}

            {createLocationOptions.length == 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum local cadastrado para seleção. Cadastre um local antes de criar o jogo.</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowCreateMatchModal(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={loadingLocationTemplates || createLocationOptions.length == 0}
            >
              <Plus className="mr-2 h-4 w-4" />
              Criar jogo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
