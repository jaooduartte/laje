import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo, useState } from "react";
import { AdminListSkeleton } from "@/components/skeletons/AdminListSkeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { updateBracketLocationSportPriorities } from "@/domain/championship-brackets/championshipBracket.repository";
import { resolveInterlajeClassificationPolicySections } from "@/domain/interlaje/interlajeOverallStandings.repository";
import type { Championship, ChampionshipSport, Sport } from "@/lib/types";
import {
  ChampionshipCode,
  ChampionshipSportResultRule,
} from "@/lib/enums";
import { resolveNormalizedSportName } from "@/lib/championship";
import { resolveChampionshipSportSupportsAwards } from "@/lib/championshipAwards";
import {
  CHAMPIONSHIP_SPORT_RESULT_RULE_LABELS,
  CHAMPIONSHIP_SPORT_NAIPE_MODE_LABELS,
} from "@/lib/championship";
import { PLATFORM_SPORT_RULES_BY_CHAMPIONSHIP_CODE } from "@/domain/sport-rules/sportRules.constants";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  sports: Sport[];
  championshipSports: ChampionshipSport[];
  isLoading?: boolean;
  selectedChampionship: Championship;
  bracketEditionId?: string | null;
  canManageSports?: boolean;
  onRefetchMatches?: (options?: {
    showLoading?: boolean;
    showFetching?: boolean;
  }) => void | Promise<void>;
  onRefetchSports?: () => void | Promise<void>;
  onSeasonSportRemoved?: () => void | Promise<void>;
  hiddenSportIds?: string[];
}

interface SeasonSportRemovalPreview {
  sport_name: string;
  has_live_items: boolean;
  matches_count: number;
  individual_sessions_count: number;
  individual_events_count: number;
  individual_entries_count: number;
  standings_count: number;
  individual_standings_count: number;
  bracket_competitions_count: number;
  configured_teams_count: number;
  athletes_count: number;
  disqualifications_count: number;
}

type SupabaseRemovalClient = {
  rpc: (
    functionName: string,
    argumentsValue: Record<string, unknown>,
  ) => Promise<{ data: SeasonSportRemovalPreview | null; error: { message: string } | null }>;
};

const supabaseRemovalClient = supabase as unknown as SupabaseRemovalClient;

interface PendingWalkoverConfiguration {
  championshipSport: ChampionshipSport;
  sportId: string;
  isSetRule: boolean;
  winnerPoints: number | null;
  winnerSetCount: number | null;
}

function normalizePositiveIntegerDraftValue(value: string): number | null {
  const trimmedValue = value.trim();

  if (trimmedValue == "") {
    return null;
  }

  const parsedValue = parseInt(trimmedValue, 10);

  if (Number.isNaN(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
}

export function AdminSports({
  sports,
  championshipSports,
  isLoading = false,
  selectedChampionship,
  bracketEditionId = null,
  canManageSports = true,
  onRefetchMatches,
  onRefetchSports,
  onSeasonSportRemoved,
  hiddenSportIds = [],
}: Props) {
  const [savingSportIdById, setSavingSportIdById] = useState<
    Record<string, boolean>
  >({});
  const [
    optimisticEstimatedStartTimeBySportId,
    setOptimisticEstimatedStartTimeBySportId,
  ] = useState<Record<string, boolean | undefined>>({});
  const [optimisticDurationBySportId, setOptimisticDurationBySportId] =
    useState<Record<string, number | undefined>>({});
  const [
    optimisticWalkoverWinnerPointsBySportId,
    setOptimisticWalkoverWinnerPointsBySportId,
  ] = useState<Record<string, number | null | undefined>>({});
  const [
    optimisticWalkoverWinnerSetCountBySportId,
    setOptimisticWalkoverWinnerSetCountBySportId,
  ] = useState<Record<string, number | undefined>>({});
  const [walkoverDraftBySportId, setWalkoverDraftBySportId] = useState<
    Record<string, string>
  >({});
  const [walkoverSetCountDraftBySportId, setWalkoverSetCountDraftBySportId] =
    useState<Record<string, string>>({});
  const [pendingWalkoverConfiguration, setPendingWalkoverConfiguration] =
    useState<PendingWalkoverConfiguration | null>(null);
  const [pendingSeasonSportRemoval, setPendingSeasonSportRemoval] = useState<{
    sport: Sport;
    preview: SeasonSportRemovalPreview;
  } | null>(null);
  const [seasonSportRemovalConfirmation, setSeasonSportRemovalConfirmation] =
    useState("");
  const [isRemovingSeasonSport, setIsRemovingSeasonSport] = useState(false);
  const [durationDraftBySportId, setDurationDraftBySportId] = useState<
    Record<string, string>
  >({});
  const [
    optimisticAwardsIncludeKnockoutBySportId,
    setOptimisticAwardsIncludeKnockoutBySportId,
  ] = useState<Record<string, boolean | undefined>>({});
  const [
    optimisticSupportsIndividualAwardsBySportId,
    setOptimisticSupportsIndividualAwardsBySportId,
  ] = useState<Record<string, boolean | undefined>>({});

  const sportsByNormalizedName = useMemo(() => {
    const map = new Map<string, Sport>();

    sports.forEach((sport) => {
      map.set(resolveNormalizedSportName(sport.name), sport);
    });

    return map;
  }, [sports]);
  const hiddenSportIdsSet = useMemo(() => new Set(hiddenSportIds), [hiddenSportIds]);

  const championshipSportBySportId = useMemo(() => {
    const map = new Map<string, ChampionshipSport>();

    championshipSports.forEach((championshipSport) => {
      map.set(championshipSport.sport_id, championshipSport);
    });

    return map;
  }, [championshipSports]);

  const championshipPlatformSportRules = useMemo(() => {
    return (
      PLATFORM_SPORT_RULES_BY_CHAMPIONSHIP_CODE[selectedChampionship.code] ?? []
    );
  }, [selectedChampionship.code]);

  const championshipNameByCode: Record<ChampionshipCode, string> = {
    [ChampionshipCode.CLV]: "Copa Laje de Verão",
    [ChampionshipCode.SOCIETY]: "Copa Laje Society",
    [ChampionshipCode.INTERLAJE]: "Interlaje",
  };

  useEffect(() => {
    const nextOptimisticEstimatedStartTimeBySportId = championshipSports.reduce<
      Record<string, boolean | undefined>
    >((carry, championshipSport) => {
      carry[championshipSport.sport_id] =
        championshipSport.show_estimated_start_time_on_cards;
      return carry;
    }, {});

    setOptimisticEstimatedStartTimeBySportId(
      nextOptimisticEstimatedStartTimeBySportId,
    );

    const nextWalkoverDraftBySportId = championshipSports.reduce<
      Record<string, string>
    >((carry, championshipSport) => {
      carry[championshipSport.sport_id] =
        championshipSport.walkover_winner_points != null
          ? String(championshipSport.walkover_winner_points)
          : "";
      return carry;
    }, {});

    setWalkoverDraftBySportId(nextWalkoverDraftBySportId);

    const nextWalkoverSetCountDraftBySportId = championshipSports.reduce<
      Record<string, string>
    >((carry, championshipSport) => {
      carry[championshipSport.sport_id] = String(
        championshipSport.walkover_winner_set_count ?? 1,
      );
      return carry;
    }, {});

    setWalkoverSetCountDraftBySportId(nextWalkoverSetCountDraftBySportId);

    const nextOptimisticWalkoverWinnerPointsBySportId =
      championshipSports.reduce<Record<string, number | null | undefined>>(
        (carry, championshipSport) => {
          carry[championshipSport.sport_id] =
            championshipSport.walkover_winner_points ?? null;
          return carry;
        },
        {},
      );

    setOptimisticWalkoverWinnerPointsBySportId(
      nextOptimisticWalkoverWinnerPointsBySportId,
    );

    const nextOptimisticWalkoverWinnerSetCountBySportId =
      championshipSports.reduce<Record<string, number | undefined>>(
        (carry, championshipSport) => {
          carry[championshipSport.sport_id] =
            championshipSport.walkover_winner_set_count ?? 1;
          return carry;
        },
        {},
      );

    setOptimisticWalkoverWinnerSetCountBySportId(
      nextOptimisticWalkoverWinnerSetCountBySportId,
    );

    const nextDurationDraftBySportId = sports.reduce<Record<string, string>>(
      (carry, sport) => {
        carry[sport.id] =
          sport.default_match_duration_minutes != null
            ? String(sport.default_match_duration_minutes)
            : "";
        return carry;
      },
      {},
    );

    championshipSports.forEach((championshipSport) => {
      if (
        (nextDurationDraftBySportId[championshipSport.sport_id] ?? "") !== ""
      ) {
        return;
      }

      nextDurationDraftBySportId[championshipSport.sport_id] = String(
        championshipSport.default_match_duration_minutes ?? "",
      );
    });

    setDurationDraftBySportId(nextDurationDraftBySportId);

    const nextOptimisticDurationBySportId = sports.reduce<
      Record<string, number | undefined>
    >((carry, sport) => {
      carry[sport.id] = sport.default_match_duration_minutes ?? undefined;
      return carry;
    }, {});

    championshipSports.forEach((championshipSport) => {
      if (nextOptimisticDurationBySportId[championshipSport.sport_id] != null) {
        return;
      }

      nextOptimisticDurationBySportId[championshipSport.sport_id] =
        championshipSport.default_match_duration_minutes;
    });

    setOptimisticDurationBySportId(nextOptimisticDurationBySportId);

    const nextOptimisticAwardsIncludeKnockoutBySportId =
      championshipSports.reduce<Record<string, boolean | undefined>>(
        (carry, championshipSport) => {
          carry[championshipSport.sport_id] =
            championshipSport.awards_include_knockout_phase;
          return carry;
        },
        {},
      );

    setOptimisticAwardsIncludeKnockoutBySportId(
      nextOptimisticAwardsIncludeKnockoutBySportId,
    );

    const nextOptimisticSupportsIndividualAwardsBySportId =
      championshipSports.reduce<Record<string, boolean | undefined>>(
        (carry, championshipSport) => {
          carry[championshipSport.sport_id] =
            championshipSport.supports_individual_awards;
          return carry;
        },
        {},
      );

    setOptimisticSupportsIndividualAwardsBySportId(
      nextOptimisticSupportsIndividualAwardsBySportId,
    );
  }, [championshipSports, sports]);

  const handleToggleEstimatedStartTimeOnCards = async (
    championshipSport: ChampionshipSport,
    shouldShowEstimatedStartTimeOnCards: boolean,
  ) => {
    if (!canManageSports) {
      return;
    }

    setSavingSportIdById((currentSavingSportIdById) => ({
      ...currentSavingSportIdById,
      [championshipSport.id]: true,
    }));

    setOptimisticEstimatedStartTimeBySportId(
      (currentOptimisticEstimatedStartTimeBySportId) => ({
        ...currentOptimisticEstimatedStartTimeBySportId,
        [championshipSport.sport_id]: shouldShowEstimatedStartTimeOnCards,
      }),
    );

    const { error } = await supabase
      .from("championship_sports")
      .update({
        show_estimated_start_time_on_cards: shouldShowEstimatedStartTimeOnCards,
      })
      .eq("id", championshipSport.id);

    setSavingSportIdById((currentSavingSportIdById) => ({
      ...currentSavingSportIdById,
      [championshipSport.id]: false,
    }));

    if (error) {
      setOptimisticEstimatedStartTimeBySportId(
        (currentOptimisticEstimatedStartTimeBySportId) => ({
          ...currentOptimisticEstimatedStartTimeBySportId,
          [championshipSport.sport_id]:
            championshipSport.show_estimated_start_time_on_cards,
        }),
      );
      toast.error(
        error.message ||
          "Não foi possível salvar a configuração de horário estimado.",
      );
      return;
    }

    toast.success("Configuração de horário estimado atualizada.");
  };

  const handleSaveWalkoverConfiguration = async (
    championshipSport: ChampionshipSport,
    sportId: string,
    isSetRule: boolean,
  ) => {
    if (!canManageSports) {
      return;
    }

    const draftValue = walkoverDraftBySportId[sportId] ?? "";
    const parsedValue =
      draftValue.trim() === "" ? null : parseInt(draftValue, 10);

    if (parsedValue !== null && (isNaN(parsedValue) || parsedValue <= 0)) {
      toast.error(
        "Informe um número inteiro positivo ou deixe vazio para desabilitar o W.O.",
      );
      return;
    }

    const setCountDraftValue = walkoverSetCountDraftBySportId[sportId] ?? "";
    const parsedSetCount = normalizePositiveIntegerDraftValue(setCountDraftValue);

    if (isSetRule && parsedSetCount == null) {
      toast.error("Informe uma quantidade positiva de sets para o W.O.");
      return;
    }

    setPendingWalkoverConfiguration({
      championshipSport,
      sportId,
      isSetRule,
      winnerPoints: parsedValue,
      winnerSetCount: parsedSetCount,
    });
  };

  const handleConfirmWalkoverConfiguration = async (
    shouldUpdateFinishedWalkovers: boolean,
  ) => {
    const configuration = pendingWalkoverConfiguration;

    if (!configuration) {
      return;
    }

    const {
      championshipSport,
      sportId,
      isSetRule,
      winnerPoints,
      winnerSetCount,
    } = configuration;

    setSavingSportIdById((current) => ({
      ...current,
      [championshipSport.id]: true,
    }));

    const { data, error } = await supabase.rpc(
      "save_championship_sport_walkover_configuration",
      {
        _championship_sport_id: championshipSport.id,
        _season_year: selectedChampionship.current_season_year,
        _walkover_winner_points: winnerPoints,
        _walkover_winner_set_count: isSetRule ? winnerSetCount : null,
        _update_finished_walkovers: shouldUpdateFinishedWalkovers,
      },
    );

    setSavingSportIdById((current) => ({
      ...current,
      [championshipSport.id]: false,
    }));

    if (error) {
      toast.error(
        error.message || "Não foi possível salvar a configuração de W.O.",
      );
      return;
    }

    setOptimisticWalkoverWinnerPointsBySportId((current) => ({
      ...current,
      [sportId]: winnerPoints,
    }));
    setWalkoverDraftBySportId((current) => ({
      ...current,
      [sportId]: winnerPoints != null ? String(winnerPoints) : "",
    }));
    if (isSetRule && winnerSetCount != null) {
      setOptimisticWalkoverWinnerSetCountBySportId((current) => ({
        ...current,
        [sportId]: winnerSetCount,
      }));
      setWalkoverSetCountDraftBySportId((current) => ({
        ...current,
        [sportId]: String(winnerSetCount),
      }));
    }

    setPendingWalkoverConfiguration(null);

    await Promise.all([
      onRefetchSports?.(),
      shouldUpdateFinishedWalkovers
        ? onRefetchMatches?.({ showFetching: true })
        : undefined,
    ]);

    const updatedMatchesCount =
      data &&
      typeof data == "object" &&
      !Array.isArray(data) &&
      typeof data.updated_matches_count == "number"
        ? data.updated_matches_count
        : 0;

    toast.success(
      shouldUpdateFinishedWalkovers
        ? `Configuração de W.O. atualizada e ${updatedMatchesCount} jogo(s) encerrado(s) recalculado(s).`
        : winnerPoints != null
          ? "Configuração de W.O. atualizada. Jogos encerrados foram preservados."
          : "W.O. desabilitado para esta modalidade. Jogos encerrados foram preservados.",
    );
  };

  const handleSaveDefaultMatchDuration = async (
    sport: Sport,
    championshipSport?: ChampionshipSport,
  ) => {
    if (!canManageSports) {
      return;
    }

    const draftValue = durationDraftBySportId[sport.id] ?? "";
    const parsedValue = parseInt(draftValue, 10);
    const savingKey = championshipSport?.id ?? sport.id;

    if (
      draftValue.trim() == "" ||
      Number.isNaN(parsedValue) ||
      parsedValue <= 0
    ) {
      toast.error("Informe uma duração válida em minutos para a modalidade.");
      return;
    }

    setSavingSportIdById((current) => ({ ...current, [savingKey]: true }));

    const { error: updateError } = await supabase
      .from("sports")
      .update({ default_match_duration_minutes: parsedValue })
      .eq("id", sport.id);

    if (updateError) {
      setSavingSportIdById((current) => ({ ...current, [savingKey]: false }));
      toast.error(
        updateError.message ||
          "Não foi possível salvar a duração da modalidade.",
      );
      return;
    }

    if (bracketEditionId && championshipSport) {
      const { error: redistributeError } =
        await updateBracketLocationSportPriorities(bracketEditionId, []);

      if (redistributeError) {
        setSavingSportIdById((current) => ({ ...current, [savingKey]: false }));
        toast.error(
          redistributeError.message ||
            "A duração foi salva, mas não foi possível recalcular os horários dos jogos.",
        );
        return;
      }
    }

    setOptimisticDurationBySportId((current) => ({
      ...current,
      [sport.id]: parsedValue,
    }));
    setDurationDraftBySportId((current) => ({
      ...current,
      [sport.id]: String(parsedValue),
    }));

    await Promise.all([
      onRefetchSports?.(),
      onRefetchMatches?.({ showFetching: true }),
    ]);

    setSavingSportIdById((current) => ({ ...current, [savingKey]: false }));

    toast.success(
      bracketEditionId
        ? "Duração da modalidade atualizada e horários dos jogos recalculados."
        : "Duração da modalidade atualizada.",
    );
  };

  const handleToggleSupportsIndividualAwards = async (
    championshipSport: ChampionshipSport,
    shouldSupport: boolean,
  ) => {
    if (!canManageSports) {
      return;
    }

    setSavingSportIdById((current) => ({
      ...current,
      [championshipSport.id]: true,
    }));

    setOptimisticSupportsIndividualAwardsBySportId((current) => ({
      ...current,
      [championshipSport.sport_id]: shouldSupport,
    }));

    const { error } = await supabase
      .from("championship_sports")
      .update({ supports_individual_awards: shouldSupport })
      .eq("id", championshipSport.id);

    setSavingSportIdById((current) => ({
      ...current,
      [championshipSport.id]: false,
    }));

    if (error) {
      setOptimisticSupportsIndividualAwardsBySportId((current) => ({
        ...current,
        [championshipSport.sport_id]:
          championshipSport.supports_individual_awards,
      }));
      toast.error(
        error.message ||
          "Não foi possível salvar a configuração de premiações.",
      );
      return;
    }

    toast.success("Configuração de premiações atualizada.");
  };

  const handleToggleAwardsIncludeKnockout = async (
    championshipSport: ChampionshipSport,
    shouldIncludeKnockout: boolean,
  ) => {
    if (!canManageSports) {
      return;
    }

    setSavingSportIdById((current) => ({
      ...current,
      [championshipSport.id]: true,
    }));

    setOptimisticAwardsIncludeKnockoutBySportId((current) => ({
      ...current,
      [championshipSport.sport_id]: shouldIncludeKnockout,
    }));

    const { error } = await supabase
      .from("championship_sports")
      .update({ awards_include_knockout_phase: shouldIncludeKnockout })
      .eq("id", championshipSport.id);

    setSavingSportIdById((current) => ({
      ...current,
      [championshipSport.id]: false,
    }));

    if (error) {
      setOptimisticAwardsIncludeKnockoutBySportId((current) => ({
        ...current,
        [championshipSport.sport_id]:
          championshipSport.awards_include_knockout_phase,
      }));
      toast.error(
        error.message || "Não foi possível salvar a configuração de prêmios.",
      );
      return;
    }

    toast.success("Configuração de contabilização de prêmios atualizada.");
  };

  const handleOpenSeasonSportRemoval = async (sport: Sport) => {
    if (!canManageSports) {
      return;
    }

    const { data, error } = await supabaseRemovalClient.rpc(
      "preview_championship_season_sport_removal",
      {
        _championship_id: selectedChampionship.id,
        _season_year: selectedChampionship.current_season_year,
        _sport_id: sport.id,
      },
    );

    if (error || !data) {
      toast.error(error?.message || "Não foi possível carregar o impacto da remoção.");
      return;
    }

    setSeasonSportRemovalConfirmation("");
    setPendingSeasonSportRemoval({ sport, preview: data });
  };

  const handleConfirmSeasonSportRemoval = async () => {
    if (!pendingSeasonSportRemoval) {
      return;
    }

    setIsRemovingSeasonSport(true);

    const { error } = await supabaseRemovalClient.rpc(
      "remove_championship_season_sport",
      {
        _championship_id: selectedChampionship.id,
        _season_year: selectedChampionship.current_season_year,
        _sport_id: pendingSeasonSportRemoval.sport.id,
        _confirmation_name: seasonSportRemovalConfirmation,
      },
    );

    setIsRemovingSeasonSport(false);

    if (error) {
      toast.error(error.message || "Não foi possível remover a modalidade.");
      return;
    }

    setPendingSeasonSportRemoval(null);
    setSeasonSportRemovalConfirmation("");
    await Promise.all([
      onRefetchMatches?.({ showFetching: true }),
      onRefetchSports?.(),
      onSeasonSportRemoved?.(),
    ]);
    toast.success("Modalidade removida desta temporada.");
  };

  const pendingWalkoverSportName = pendingWalkoverConfiguration
    ? sports.find(
        (sport) => sport.id == pendingWalkoverConfiguration.sportId,
      )?.name
    : null;
  const isSavingPendingWalkoverConfiguration =
    pendingWalkoverConfiguration != null &&
    savingSportIdById[
      pendingWalkoverConfiguration.championshipSport.id
    ] == true;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="enter-section space-y-5 glass-card p-4">
          <div className="space-y-2">
            <Skeleton className="h-7 w-64 max-w-full" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>

          <AdminListSkeleton count={6} showActions={false} />
        </div>
      </div>
    );
  }

  if (championshipPlatformSportRules.length == 0) {
    return (
      <div className="space-y-6">
        <div className="enter-section space-y-3 glass-card p-4">
          <h2 className="text-2xl font-display font-bold">
            Modalidades oficiais
          </h2>
          <p className="text-sm text-muted-foreground">
            Não há regras oficiais configuradas para este campeonato.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AlertDialog
        open={pendingSeasonSportRemoval != null}
        onOpenChange={(open) => {
          if (!open && !isRemovingSeasonSport) {
            setPendingSeasonSportRemoval(null);
            setSeasonSportRemovalConfirmation("");
          }
        }}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] sm:max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remover {pendingSeasonSportRemoval?.preview.sport_name} desta temporada?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A remoção é definitiva apenas para {selectedChampionship.current_season_year}. Dias, locais e quadras compartilhados não serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingSeasonSportRemoval ? (
            <div className="app-card-muted space-y-1 px-3 py-2 text-sm">
              <p className="font-medium">Dados que serão removidos</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {[
                  ["jogo(s)", pendingSeasonSportRemoval.preview.matches_count],
                  ["sessão(ões)", pendingSeasonSportRemoval.preview.individual_sessions_count],
                  ["prova(s)", pendingSeasonSportRemoval.preview.individual_events_count],
                  ["inscrição(ões)", pendingSeasonSportRemoval.preview.individual_entries_count],
                  ["classificação(ões)", pendingSeasonSportRemoval.preview.standings_count + pendingSeasonSportRemoval.preview.individual_standings_count],
                  ["chave(s)", pendingSeasonSportRemoval.preview.bracket_competitions_count],
                  ["atlética(s) participante(s)", pendingSeasonSportRemoval.preview.configured_teams_count],
                  ["atleta(s)", pendingSeasonSportRemoval.preview.athletes_count],
                  ["desclassificação(ões)", pendingSeasonSportRemoval.preview.disqualifications_count],
                ]
                  .filter(([, count]) => Number(count) > 0)
                  .map(([label, count]) => (
                    <li key={String(label)}>
                      {count} {label}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          {pendingSeasonSportRemoval?.preview.has_live_items ? (
            <p className="text-sm font-medium text-destructive">
              Há jogo ou sessão ao vivo nesta modalidade. Encerre ou retorne o item ao agendamento antes de remover.
            </p>
          ) : (
            <label className="space-y-1 text-sm">
              <span>Digite {pendingSeasonSportRemoval?.preview.sport_name} para confirmar</span>
              <Input
                value={seasonSportRemovalConfirmation}
                onChange={(event) => setSeasonSportRemovalConfirmation(event.target.value)}
                disabled={isRemovingSeasonSport}
              />
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemovingSeasonSport}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                isRemovingSeasonSport ||
                pendingSeasonSportRemoval?.preview.has_live_items ||
                seasonSportRemovalConfirmation.trim().toLocaleLowerCase() !=
                  pendingSeasonSportRemoval?.preview.sport_name.trim().toLocaleLowerCase()
              }
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmSeasonSportRemoval();
              }}
            >
              {isRemovingSeasonSport ? "Removendo…" : "Remover modalidade"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={pendingWalkoverConfiguration != null}
        onOpenChange={(open) => {
          if (!open && !isSavingPendingWalkoverConfiguration) {
            setPendingWalkoverConfiguration(null);
          }
        }}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] sm:max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Atualizar W.O.s já encerrados?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingWalkoverConfiguration?.winnerPoints != null
                ? `A nova configuração será salva de qualquer forma. Deseja aplicá-la aos W.O.s simples já encerrados de ${pendingWalkoverSportName ?? "esta modalidade"} na temporada atual (${selectedChampionship.current_season_year})? W.O.s duplos não serão alterados.`
                : "O W.O. será desabilitado para os próximos jogos. Os W.O.s já encerrados serão preservados para manter o histórico da temporada."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSavingPendingWalkoverConfiguration}>
              Cancelar
            </AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              disabled={isSavingPendingWalkoverConfiguration}
              onClick={() => {
                void handleConfirmWalkoverConfiguration(false);
              }}
            >
              Salvar sem atualizar jogos
            </Button>
            {pendingWalkoverConfiguration?.winnerPoints != null ? (
              <Button
                type="button"
                variant="destructive"
                disabled={isSavingPendingWalkoverConfiguration}
                onClick={() => {
                  void handleConfirmWalkoverConfiguration(true);
                }}
              >
                Salvar e atualizar jogos
              </Button>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="enter-section space-y-5 glass-card p-4">
        <h2 className="text-2xl font-display font-bold">
          Modalidades oficiais da{" "}
          {championshipNameByCode[selectedChampionship.code]}
        </h2>
        <p className="text-sm text-muted-foreground">
          Configuração fixa conforme regulamento: naipe, pontuação e critérios
          de desempate.
        </p>

        <div className="space-y-2">
          {championshipPlatformSportRules.map((platformSportRule) => {
            const sport = sportsByNormalizedName.get(
              resolveNormalizedSportName(platformSportRule.sportName),
            );
            if (sport && hiddenSportIdsSet.has(sport.id)) {
              return null;
            }
            const championshipSport = sport
              ? championshipSportBySportId.get(sport.id)
              : undefined;
            const supportsAwards = resolveChampionshipSportSupportsAwards(
              selectedChampionship.code,
              platformSportRule.sportName,
            );

            const resolvedNaipeMode =
              championshipSport?.naipe_mode ?? platformSportRule.naipeMode;
            const resolvedPointsWin =
              championshipSport?.points_win ?? platformSportRule.pointsWin;
            const resolvedPointsDraw =
              championshipSport?.points_draw ?? platformSportRule.pointsDraw;
            const resolvedPointsLoss =
              championshipSport?.points_loss ?? platformSportRule.pointsLoss;
            const resolvedSupportsCards =
              championshipSport?.supports_cards ??
              platformSportRule.supportsCards;
            const isInterlajeVolleyball =
              selectedChampionship.code == ChampionshipCode.INTERLAJE &&
              resolveNormalizedSportName(platformSportRule.sportName) ==
                "voleibol";
            const resolvedResultRule =
              championshipSport?.result_rule ?? platformSportRule.resultRule;
            const isIndividualSport =
              resolveNormalizedSportName(platformSportRule.sportName) ==
                "atletismo" ||
              resolveNormalizedSportName(platformSportRule.sportName) ==
                "natacao";
            const resolvedDefaultMatchDurationMinutes =
              optimisticDurationBySportId[sport?.id ?? ""] ??
              sport?.default_match_duration_minutes ??
              championshipSport?.default_match_duration_minutes ??
              null;
            const shouldShowEstimatedStartTimeOnCards =
              optimisticEstimatedStartTimeBySportId[sport?.id ?? ""] ??
              championshipSport?.show_estimated_start_time_on_cards ??
              false;
            const savingKey =
              championshipSport?.id ?? sport?.id ?? platformSportRule.sportName;
            const isSavingSport = savingSportIdById[savingKey] == true;
            const draftDurationValue = sport
              ? (durationDraftBySportId[sport.id] ?? "")
              : "";
            const normalizedDraftDurationValue =
              normalizePositiveIntegerDraftValue(draftDurationValue);
            const hasDurationChanges =
              !!sport &&
              normalizedDraftDurationValue != null &&
              normalizedDraftDurationValue !==
                resolvedDefaultMatchDurationMinutes;
            const draftWalkoverValue = sport
              ? (walkoverDraftBySportId[sport.id] ?? "")
              : "";
            const normalizedDraftWalkoverValue =
              normalizePositiveIntegerDraftValue(draftWalkoverValue);
            const currentWalkoverWinnerPoints =
              optimisticWalkoverWinnerPointsBySportId[sport?.id ?? ""] ??
              championshipSport?.walkover_winner_points ??
              null;
            const draftWalkoverSetCountValue = sport
              ? (walkoverSetCountDraftBySportId[sport.id] ?? "")
              : "";
            const normalizedDraftWalkoverSetCount =
              normalizePositiveIntegerDraftValue(draftWalkoverSetCountValue);
            const currentWalkoverWinnerSetCount =
              optimisticWalkoverWinnerSetCountBySportId[sport?.id ?? ""] ??
              championshipSport?.walkover_winner_set_count ??
              1;
            const hasWalkoverChanges =
              !!sport &&
              !!championshipSport &&
              ((draftWalkoverValue.trim() == ""
                ? currentWalkoverWinnerPoints !== null
                : normalizedDraftWalkoverValue != null &&
                  normalizedDraftWalkoverValue !== currentWalkoverWinnerPoints) ||
                (resolvedResultRule == ChampionshipSportResultRule.SETS &&
                  normalizedDraftWalkoverSetCount != null &&
                  normalizedDraftWalkoverSetCount !== currentWalkoverWinnerSetCount));
            const awardsIncludeKnockout =
              optimisticAwardsIncludeKnockoutBySportId[sport?.id ?? ""] ??
              championshipSport?.awards_include_knockout_phase ??
              false;
            const supportsIndividualAwards =
              optimisticSupportsIndividualAwardsBySportId[sport?.id ?? ""] ??
              championshipSport?.supports_individual_awards ??
              false;
            const interlajeClassificationPolicySections =
              selectedChampionship.code == ChampionshipCode.INTERLAJE
                ? resolveInterlajeClassificationPolicySections(
                    championshipSport?.classification_policy,
                  )
                : [];

            return (
              <div
                key={platformSportRule.sportName}
                className="list-item-card space-y-3 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display font-semibold">
                    {platformSportRule.sportName}
                  </p>
                  {sport && championshipSport ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!canManageSports || isSavingSport}
                      onClick={() => {
                        void handleOpenSeasonSportRemoval(sport);
                      }}
                    >
                      Remover da temporada
                    </Button>
                  ) : null}
                </div>

                <p className="text-xs font-medium text-muted-foreground">
                  {championshipSport
                    ? "Vinculada ao campeonato selecionado."
                    : sport
                      ? "Disponível na plataforma, mas ainda não vinculada ao campeonato selecionado."
                      : "Modalidade oficial ainda não cadastrada na plataforma."}
                </p>

                <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div className="app-card-muted px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Tipo de naipe
                    </p>
                    <p className="font-medium">
                      {CHAMPIONSHIP_SPORT_NAIPE_MODE_LABELS[resolvedNaipeMode]}
                    </p>
                  </div>

                  {isInterlajeVolleyball ? (
                    <div className="app-card-muted order-last space-y-2 px-3 py-2 sm:col-span-2 lg:col-span-4">
                      <p className="text-xs font-medium text-muted-foreground">
                        Pontuação por resultado
                      </p>
                      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                        {[
                          ["Vitória", "2 × 0", "3 pontos"],
                          ["Vitória", "2 × 1", "2 pontos"],
                          ["Derrota", "1 × 2", "1 ponto"],
                          ["Derrota", "0 × 2", "0 pontos"],
                        ].map(([outcome, score, points]) => (
                          <div
                            key={`${outcome}-${score}`}
                            className="rounded-md border border-border/70 bg-background/60 px-3 py-2"
                          >
                            <p className="text-xs text-muted-foreground">
                              {outcome} {score}
                            </p>
                            <p className="font-semibold">{points}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="app-card-muted px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Pontuação
                      </p>
                      <p className="font-medium">
                        {`V ${resolvedPointsWin} • E ${resolvedPointsDraw} • D ${resolvedPointsLoss}`}
                      </p>
                    </div>
                  )}

                  <div className="app-card-muted px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Cartões
                    </p>
                    <p className="font-medium">
                      {resolvedSupportsCards ? "Sim" : "Não"}
                    </p>
                  </div>

                  <div className="app-card-muted px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Regra de resultado
                    </p>
                    <p className="font-medium">
                      {
                        CHAMPIONSHIP_SPORT_RESULT_RULE_LABELS[
                          resolvedResultRule
                        ]
                      }
                    </p>
                  </div>
                </div>

                {!isIndividualSport ? (
                  <div className="app-card-muted space-y-2 px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Duração padrão da partida
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        placeholder="Minutos"
                        className="h-8 w-32 text-sm"
                        disabled={!canManageSports || !sport || isSavingSport}
                        value={
                          sport ? (durationDraftBySportId[sport.id] ?? "") : ""
                        }
                        onChange={(e) => {
                          if (!sport) return;
                          setDurationDraftBySportId((current) => ({
                            ...current,
                            [sport.id]: e.target.value,
                          }));
                        }}
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={
                          !canManageSports ||
                          !sport ||
                          isSavingSport ||
                          !hasDurationChanges
                        }
                        onClick={() => {
                          if (!sport) return;
                          void handleSaveDefaultMatchDuration(
                            sport,
                            championshipSport,
                          );
                        }}
                      >
                        {isSavingSport ? "Salvando…" : "Salvar"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Ao salvar, a agenda da edição atual é redistribuída com a
                      nova duração da modalidade.
                    </p>
                    {!sport ? (
                      <p className="text-xs text-muted-foreground">
                        A modalidade precisa existir no banco para editar esta
                        configuração.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {selectedChampionship.code == ChampionshipCode.INTERLAJE ? (
                  <div className="app-card-muted space-y-3 px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Critérios oficiais de classificação e desempate
                    </p>
                    {interlajeClassificationPolicySections.length > 0 ? (
                      interlajeClassificationPolicySections.map((section) => (
                        <div key={section.title}>
                          <p className="text-xs font-medium text-muted-foreground">
                            {section.title} (ordem de prioridade)
                          </p>
                          <ol className="mt-1 space-y-1 text-sm font-medium">
                            {section.criteria.map((criterion, criterionIndex) => (
                              <li key={criterion}>
                                {criterionIndex + 1}. {criterion}
                              </li>
                            ))}
                          </ol>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Política oficial ainda não disponível para esta modalidade.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="app-card-muted px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Critérios de desempate (ordem de prioridade)
                    </p>
                    <ol className="mt-1 space-y-1 text-sm font-medium">
                      {platformSportRule.tieBreakerPriority.map(
                        (tieBreakerPriorityItem, tieBreakerPriorityIndex) => (
                          <li key={tieBreakerPriorityItem}>
                            {tieBreakerPriorityIndex + 1}.{" "}
                            {tieBreakerPriorityItem}
                          </li>
                        ),
                      )}
                    </ol>
                  </div>
                )}

                <div className="app-card-muted space-y-2 px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Horário estimado nos cards
                  </p>
                  <RadioGroup
                    value={shouldShowEstimatedStartTimeOnCards ? "YES" : "NO"}
                    onValueChange={(value) => {
                      if (!championshipSport) {
                        return;
                      }

                      const nextShouldShowEstimatedStartTimeOnCards =
                        value == "YES";

                      if (
                        nextShouldShowEstimatedStartTimeOnCards ==
                        championshipSport.show_estimated_start_time_on_cards
                      ) {
                        return;
                      }

                      void handleToggleEstimatedStartTimeOnCards(
                        championshipSport,
                        nextShouldShowEstimatedStartTimeOnCards,
                      );
                    }}
                    className="flex items-center gap-4"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem
                        value="YES"
                        disabled={
                          !canManageSports ||
                          !championshipSport ||
                          isSavingSport
                        }
                      />
                      Sim
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem
                        value="NO"
                        disabled={
                          !canManageSports ||
                          !championshipSport ||
                          isSavingSport
                        }
                      />
                      Não
                    </label>
                  </RadioGroup>

                  {!championshipSport ? (
                    <p className="text-xs text-muted-foreground">
                      Vincule a modalidade ao campeonato para editar esta
                      configuração.
                    </p>
                  ) : null}

                  {!canManageSports ? (
                    <p className="text-xs text-muted-foreground">
                      Perfil em visualização: sem permissão para editar a aba de
                      modalidades.
                    </p>
                  ) : null}
                </div>

                {!isIndividualSport ? (
                  <div className="app-card-muted space-y-2 px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Configuração de W.O.
                    </p>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="space-y-1 text-xs text-muted-foreground">
                        <span>
                          {resolvedResultRule == ChampionshipSportResultRule.SETS
                            ? "Pontos por set no W.O."
                            : "Pontuação máxima (W.O.)"}
                        </span>
                        <Input
                          type="number"
                          min={1}
                          aria-label={
                            resolvedResultRule == ChampionshipSportResultRule.SETS
                              ? "Pontos por set no W.O."
                              : "Pontuação máxima (W.O.)"
                          }
                          placeholder="Desabilitado"
                          className="h-8 w-32 text-sm"
                          disabled={
                            !canManageSports ||
                            !championshipSport ||
                            isSavingSport
                          }
                          value={
                            sport ? (walkoverDraftBySportId[sport.id] ?? "") : ""
                          }
                          onChange={(e) => {
                            if (!sport) return;
                            setWalkoverDraftBySportId((current) => ({
                              ...current,
                              [sport.id]: e.target.value,
                            }));
                          }}
                        />
                      </label>
                      {resolvedResultRule == ChampionshipSportResultRule.SETS ? (
                        <label className="space-y-1 text-xs text-muted-foreground">
                          <span>Sets concedidos ao vencedor</span>
                          <Input
                            type="number"
                            min={1}
                            aria-label="Sets concedidos ao vencedor no W.O."
                            className="h-8 w-32 text-sm"
                            disabled={
                              !canManageSports ||
                              !championshipSport ||
                              isSavingSport
                            }
                            value={
                              sport
                                ? (walkoverSetCountDraftBySportId[sport.id] ?? "")
                                : ""
                            }
                            onChange={(e) => {
                              if (!sport) return;
                              setWalkoverSetCountDraftBySportId((current) => ({
                                ...current,
                                [sport.id]: e.target.value,
                              }));
                            }}
                          />
                        </label>
                      ) : null}
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={
                          !canManageSports ||
                          !championshipSport ||
                          isSavingSport ||
                          !hasWalkoverChanges
                        }
                        onClick={() => {
                          if (!championshipSport || !sport) return;
                          void handleSaveWalkoverConfiguration(
                            championshipSport,
                            sport.id,
                            resolvedResultRule == ChampionshipSportResultRule.SETS,
                          );
                        }}
                      >
                        {isSavingSport ? "Salvando…" : "Salvar"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {sport && walkoverDraftBySportId[sport.id]
                        ? resolvedResultRule == ChampionshipSportResultRule.SETS
                          ? `Vencedor recebe ${walkoverDraftBySportId[sport.id]} ponto(s) em cada um dos ${walkoverSetCountDraftBySportId[sport.id] ?? 1} set(s) do W.O.`
                          : `Vencedor recebe ${walkoverDraftBySportId[sport.id]} ponto(s) em caso de W.O.`
                        : "W.O. desabilitado — deixe o campo vazio para desabilitar."}
                    </p>
                    {!championshipSport ? (
                      <p className="text-xs text-muted-foreground">
                        Vincule a modalidade ao campeonato para editar esta
                        configuração.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {supportsAwards ? (
                  <>
                    <div className="app-card-muted space-y-2 px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Cadastro de atletas na súmula
                      </p>
                      <RadioGroup
                        value={supportsIndividualAwards ? "YES" : "NO"}
                        onValueChange={(value) => {
                          if (!championshipSport) {
                            return;
                          }

                          const nextValue = value == "YES";

                          if (
                            nextValue ==
                            championshipSport.supports_individual_awards
                          ) {
                            return;
                          }

                          void handleToggleSupportsIndividualAwards(
                            championshipSport,
                            nextValue,
                          );
                        }}
                        className="flex items-center gap-4"
                      >
                        <label className="flex items-center gap-2 text-sm">
                          <RadioGroupItem
                            value="NO"
                            disabled={
                              !canManageSports ||
                              !championshipSport ||
                              isSavingSport
                            }
                          />
                          Desabilitado
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <RadioGroupItem
                            value="YES"
                            disabled={
                              !canManageSports ||
                              !championshipSport ||
                              isSavingSport
                            }
                          />
                          Habilitado
                        </label>
                      </RadioGroup>

                      {!championshipSport ? (
                        <p className="text-xs text-muted-foreground">
                          Vincule a modalidade ao campeonato para editar esta
                          configuração.
                        </p>
                      ) : null}

                      {!canManageSports ? (
                        <p className="text-xs text-muted-foreground">
                          Perfil em visualização: sem permissão para editar a
                          aba de modalidades.
                        </p>
                      ) : null}
                    </div>

                    <div className="app-card-muted space-y-2 px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Contabilização de prêmios (artilheiro e melhor defesa)
                      </p>
                      <RadioGroup
                        value={awardsIncludeKnockout ? "YES" : "NO"}
                        onValueChange={(value) => {
                          if (!championshipSport) {
                            return;
                          }

                          const nextValue = value == "YES";

                          if (
                            nextValue ==
                            championshipSport.awards_include_knockout_phase
                          ) {
                            return;
                          }

                          void handleToggleAwardsIncludeKnockout(
                            championshipSport,
                            nextValue,
                          );
                        }}
                        className="flex items-center gap-4"
                      >
                        <label className="flex items-center gap-2 text-sm">
                          <RadioGroupItem
                            value="NO"
                            disabled={
                              !canManageSports ||
                              !championshipSport ||
                              isSavingSport
                            }
                          />
                          Somente fase de grupos
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <RadioGroupItem
                            value="YES"
                            disabled={
                              !canManageSports ||
                              !championshipSport ||
                              isSavingSport
                            }
                          />
                          Fase de grupos + Eliminatória
                        </label>
                      </RadioGroup>

                      {!championshipSport ? (
                        <p className="text-xs text-muted-foreground">
                          Vincule a modalidade ao campeonato para editar esta
                          configuração.
                        </p>
                      ) : null}

                      {!canManageSports ? (
                        <p className="text-xs text-muted-foreground">
                          Perfil em visualização: sem permissão para editar a
                          aba de modalidades.
                        </p>
                      ) : null}

                      <p className="text-xs text-muted-foreground">
                        Com a opção desligada, a apuração considera somente a
                        fase de grupos. Com a opção ligada, soma fase de grupos
                        + eliminatória, mas só entram no ranking atléticas e
                        jogadores de atléticas que disputaram ao menos um jogo
                        eliminatório válido.
                      </p>
                    </div>

                    <div className="app-card-muted space-y-2 px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Critérios de premiação
                      </p>
                      <div className="space-y-2 text-sm">
                        <p>
                          <span className="font-medium">Artilheiro:</span> maior
                          número de gols, equipe que avançou mais longe no
                          campeonato e, se o empate persistir, sorteio.
                        </p>
                        <p>
                          <span className="font-medium">Melhor defesa:</span>{" "}
                          menor média de gols sofridos por jogo, menor total de
                          gols sofridos, maior número de jogos e, se necessário,
                          sorteio.
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        A plataforma define a atlética vencedora da melhor
                        defesa. A própria atlética indica internamente qual
                        goleiro deve receber o prêmio.
                      </p>
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
