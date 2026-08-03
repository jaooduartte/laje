import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { updateBracketLocationSportPriorities } from "@/domain/championship-brackets/championshipBracket.repository";
import type { Championship, ChampionshipSport, Sport } from "@/lib/types";
import {
  ChampionshipCode,
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

interface Props {
  sports: Sport[];
  championshipSports: ChampionshipSport[];
  selectedChampionship: Championship;
  bracketEditionId?: string | null;
  canManageSports?: boolean;
  onRefetchMatches?: (options?: { showLoading?: boolean; showFetching?: boolean }) => void | Promise<void>;
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
  selectedChampionship,
  bracketEditionId = null,
  canManageSports = true,
  onRefetchMatches,
}: Props) {
  const [savingSportIdById, setSavingSportIdById] = useState<Record<string, boolean>>({});
  const [optimisticEstimatedStartTimeBySportId, setOptimisticEstimatedStartTimeBySportId] = useState<
    Record<string, boolean | undefined>
  >({});
  const [optimisticDurationBySportId, setOptimisticDurationBySportId] = useState<Record<string, number | undefined>>(
    {},
  );
  const [optimisticWalkoverWinnerPointsBySportId, setOptimisticWalkoverWinnerPointsBySportId] = useState<
    Record<string, number | null | undefined>
  >({});
  const [walkoverDraftBySportId, setWalkoverDraftBySportId] = useState<Record<string, string>>({});
  const [durationDraftBySportId, setDurationDraftBySportId] = useState<Record<string, string>>({});
  const [optimisticAwardsIncludeKnockoutBySportId, setOptimisticAwardsIncludeKnockoutBySportId] = useState<
    Record<string, boolean | undefined>
  >({});
  const [optimisticSupportsIndividualAwardsBySportId, setOptimisticSupportsIndividualAwardsBySportId] = useState<
    Record<string, boolean | undefined>
  >({});

  const sportsByNormalizedName = useMemo(() => {
    const map = new Map<string, Sport>();

    sports.forEach((sport) => {
      map.set(resolveNormalizedSportName(sport.name), sport);
    });

    return map;
  }, [sports]);

  const championshipSportBySportId = useMemo(() => {
    const map = new Map<string, ChampionshipSport>();

    championshipSports.forEach((championshipSport) => {
      map.set(championshipSport.sport_id, championshipSport);
    });

    return map;
  }, [championshipSports]);

  const championshipPlatformSportRules = useMemo(() => {
    return PLATFORM_SPORT_RULES_BY_CHAMPIONSHIP_CODE[selectedChampionship.code] ?? [];
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
      carry[championshipSport.sport_id] = championshipSport.show_estimated_start_time_on_cards;
      return carry;
    }, {});

    setOptimisticEstimatedStartTimeBySportId(nextOptimisticEstimatedStartTimeBySportId);

    const nextWalkoverDraftBySportId = championshipSports.reduce<Record<string, string>>(
      (carry, championshipSport) => {
        carry[championshipSport.sport_id] =
          championshipSport.walkover_winner_points != null
            ? String(championshipSport.walkover_winner_points)
            : "";
        return carry;
      },
      {},
    );

    setWalkoverDraftBySportId(nextWalkoverDraftBySportId);

    const nextOptimisticWalkoverWinnerPointsBySportId = championshipSports.reduce<
      Record<string, number | null | undefined>
    >((carry, championshipSport) => {
      carry[championshipSport.sport_id] = championshipSport.walkover_winner_points ?? null;
      return carry;
    }, {});

    setOptimisticWalkoverWinnerPointsBySportId(nextOptimisticWalkoverWinnerPointsBySportId);

    const nextDurationDraftBySportId = sports.reduce<Record<string, string>>((carry, sport) => {
      carry[sport.id] =
        sport.default_match_duration_minutes != null
          ? String(sport.default_match_duration_minutes)
          : "";
      return carry;
    }, {});

    championshipSports.forEach((championshipSport) => {
      if ((nextDurationDraftBySportId[championshipSport.sport_id] ?? "") !== "") {
        return;
      }

      nextDurationDraftBySportId[championshipSport.sport_id] = String(
        championshipSport.default_match_duration_minutes ?? "",
      );
    });

    setDurationDraftBySportId(nextDurationDraftBySportId);

    const nextOptimisticDurationBySportId = sports.reduce<Record<string, number | undefined>>((carry, sport) => {
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

    const nextOptimisticAwardsIncludeKnockoutBySportId = championshipSports.reduce<
      Record<string, boolean | undefined>
    >((carry, championshipSport) => {
      carry[championshipSport.sport_id] = championshipSport.awards_include_knockout_phase;
      return carry;
    }, {});

    setOptimisticAwardsIncludeKnockoutBySportId(nextOptimisticAwardsIncludeKnockoutBySportId);

    const nextOptimisticSupportsIndividualAwardsBySportId = championshipSports.reduce<
      Record<string, boolean | undefined>
    >((carry, championshipSport) => {
      carry[championshipSport.sport_id] = championshipSport.supports_individual_awards;
      return carry;
    }, {});

    setOptimisticSupportsIndividualAwardsBySportId(nextOptimisticSupportsIndividualAwardsBySportId);
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

    setOptimisticEstimatedStartTimeBySportId((currentOptimisticEstimatedStartTimeBySportId) => ({
      ...currentOptimisticEstimatedStartTimeBySportId,
      [championshipSport.sport_id]: shouldShowEstimatedStartTimeOnCards,
    }));

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
      setOptimisticEstimatedStartTimeBySportId((currentOptimisticEstimatedStartTimeBySportId) => ({
        ...currentOptimisticEstimatedStartTimeBySportId,
        [championshipSport.sport_id]: championshipSport.show_estimated_start_time_on_cards,
      }));
      toast.error(error.message || "Não foi possível salvar a configuração de horário estimado.");
      return;
    }

    toast.success("Configuração de horário estimado atualizada.");
  };

  const handleSaveWalkoverWinnerPoints = async (championshipSport: ChampionshipSport, sportId: string) => {
    if (!canManageSports) {
      return;
    }

    const draftValue = walkoverDraftBySportId[sportId] ?? "";
    const parsedValue = draftValue.trim() === "" ? null : parseInt(draftValue, 10);

    if (parsedValue !== null && (isNaN(parsedValue) || parsedValue <= 0)) {
      toast.error("Informe um número inteiro positivo ou deixe vazio para desabilitar o W.O.");
      return;
    }

    setSavingSportIdById((current) => ({ ...current, [championshipSport.id]: true }));

    const { error } = await supabase
      .from("championship_sports")
      .update({ walkover_winner_points: parsedValue })
      .eq("id", championshipSport.id);

    setSavingSportIdById((current) => ({ ...current, [championshipSport.id]: false }));

    if (error) {
      toast.error(error.message || "Não foi possível salvar a configuração de W.O.");
      return;
    }

    setOptimisticWalkoverWinnerPointsBySportId((current) => ({
      ...current,
      [sportId]: parsedValue,
    }));
    setWalkoverDraftBySportId((current) => ({
      ...current,
      [sportId]: parsedValue != null ? String(parsedValue) : "",
    }));

    toast.success(parsedValue != null ? "Pontuação de W.O. atualizada." : "W.O. desabilitado para esta modalidade.");
  };

  const handleSaveDefaultMatchDuration = async (sport: Sport, championshipSport?: ChampionshipSport) => {
    if (!canManageSports) {
      return;
    }

    const draftValue = durationDraftBySportId[sport.id] ?? "";
    const parsedValue = parseInt(draftValue, 10);
    const savingKey = championshipSport?.id ?? sport.id;

    if (draftValue.trim() == "" || Number.isNaN(parsedValue) || parsedValue <= 0) {
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
      toast.error(updateError.message || "Não foi possível salvar a duração da modalidade.");
      return;
    }

    if (bracketEditionId && championshipSport) {
      const { error: redistributeError } = await updateBracketLocationSportPriorities(bracketEditionId, []);

      if (redistributeError) {
        setSavingSportIdById((current) => ({ ...current, [savingKey]: false }));
        toast.error(
          redistributeError.message ||
            "A duração foi salva, mas não foi possível recalcular os horários dos jogos.",
        );
        return;
      }
    }

    setSavingSportIdById((current) => ({ ...current, [savingKey]: false }));
    setOptimisticDurationBySportId((current) => ({
      ...current,
      [sport.id]: parsedValue,
    }));
    setDurationDraftBySportId((current) => ({
      ...current,
      [sport.id]: String(parsedValue),
    }));

    await onRefetchMatches?.({ showFetching: true });

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

    setSavingSportIdById((current) => ({ ...current, [championshipSport.id]: true }));

    setOptimisticSupportsIndividualAwardsBySportId((current) => ({
      ...current,
      [championshipSport.sport_id]: shouldSupport,
    }));

    const { error } = await supabase
      .from("championship_sports")
      .update({ supports_individual_awards: shouldSupport })
      .eq("id", championshipSport.id);

    setSavingSportIdById((current) => ({ ...current, [championshipSport.id]: false }));

    if (error) {
      setOptimisticSupportsIndividualAwardsBySportId((current) => ({
        ...current,
        [championshipSport.sport_id]: championshipSport.supports_individual_awards,
      }));
      toast.error(error.message || "Não foi possível salvar a configuração de premiações.");
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

    setSavingSportIdById((current) => ({ ...current, [championshipSport.id]: true }));

    setOptimisticAwardsIncludeKnockoutBySportId((current) => ({
      ...current,
      [championshipSport.sport_id]: shouldIncludeKnockout,
    }));

    const { error } = await supabase
      .from("championship_sports")
      .update({ awards_include_knockout_phase: shouldIncludeKnockout })
      .eq("id", championshipSport.id);

    setSavingSportIdById((current) => ({ ...current, [championshipSport.id]: false }));

    if (error) {
      setOptimisticAwardsIncludeKnockoutBySportId((current) => ({
        ...current,
        [championshipSport.sport_id]: championshipSport.awards_include_knockout_phase,
      }));
      toast.error(error.message || "Não foi possível salvar a configuração de prêmios.");
      return;
    }

    toast.success("Configuração de contabilização de prêmios atualizada.");
  };

  if (championshipPlatformSportRules.length == 0) {
    return (
      <div className="space-y-6">
        <div className="enter-section space-y-3 glass-card p-4">
          <h2 className="text-2xl font-display font-bold">Modalidades oficiais</h2>
          <p className="text-sm text-muted-foreground">
            Não há regras oficiais configuradas para este campeonato.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="enter-section space-y-5 glass-card p-4">
        <h2 className="text-2xl font-display font-bold">
          Modalidades oficiais da {championshipNameByCode[selectedChampionship.code]}
        </h2>
        <p className="text-sm text-muted-foreground">
          Configuração fixa conforme regulamento: naipe, pontuação e critérios de desempate.
        </p>

        <div className="space-y-2">
          {championshipPlatformSportRules.map((platformSportRule) => {
            const sport = sportsByNormalizedName.get(resolveNormalizedSportName(platformSportRule.sportName));
            const championshipSport = sport ? championshipSportBySportId.get(sport.id) : undefined;
            const supportsAwards = resolveChampionshipSportSupportsAwards(
              selectedChampionship.code,
              platformSportRule.sportName,
            );

            const resolvedNaipeMode = championshipSport?.naipe_mode ?? platformSportRule.naipeMode;
            const resolvedPointsWin = championshipSport?.points_win ?? platformSportRule.pointsWin;
            const resolvedPointsDraw = championshipSport?.points_draw ?? platformSportRule.pointsDraw;
            const resolvedPointsLoss = championshipSport?.points_loss ?? platformSportRule.pointsLoss;
            const resolvedSupportsCards = championshipSport?.supports_cards ?? platformSportRule.supportsCards;
            const resolvedResultRule = championshipSport?.result_rule ?? platformSportRule.resultRule;
            const resolvedDefaultMatchDurationMinutes =
              optimisticDurationBySportId[sport?.id ?? ""] ??
              sport?.default_match_duration_minutes ??
              championshipSport?.default_match_duration_minutes ??
              null;
            const shouldShowEstimatedStartTimeOnCards =
              optimisticEstimatedStartTimeBySportId[sport?.id ?? ""] ??
              championshipSport?.show_estimated_start_time_on_cards ??
              false;
            const savingKey = championshipSport?.id ?? sport?.id ?? platformSportRule.sportName;
            const isSavingSport = savingSportIdById[savingKey] == true;
            const draftDurationValue = sport ? (durationDraftBySportId[sport.id] ?? "") : "";
            const normalizedDraftDurationValue = normalizePositiveIntegerDraftValue(draftDurationValue);
            const hasDurationChanges =
              !!sport &&
              normalizedDraftDurationValue != null &&
              normalizedDraftDurationValue !== resolvedDefaultMatchDurationMinutes;
            const draftWalkoverValue = sport ? (walkoverDraftBySportId[sport.id] ?? "") : "";
            const normalizedDraftWalkoverValue = normalizePositiveIntegerDraftValue(draftWalkoverValue);
            const currentWalkoverWinnerPoints =
              optimisticWalkoverWinnerPointsBySportId[sport?.id ?? ""] ??
              championshipSport?.walkover_winner_points ??
              null;
            const hasWalkoverChanges =
              !!sport &&
              !!championshipSport &&
              (draftWalkoverValue.trim() == ""
                ? currentWalkoverWinnerPoints !== null
                : normalizedDraftWalkoverValue != null &&
                  normalizedDraftWalkoverValue !== currentWalkoverWinnerPoints);
            const awardsIncludeKnockout =
              optimisticAwardsIncludeKnockoutBySportId[sport?.id ?? ""] ??
              championshipSport?.awards_include_knockout_phase ??
              false;
            const supportsIndividualAwards =
              optimisticSupportsIndividualAwardsBySportId[sport?.id ?? ""] ??
              championshipSport?.supports_individual_awards ??
              false;

            return (
              <div key={platformSportRule.sportName} className="list-item-card space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display font-semibold">{platformSportRule.sportName}</p>
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
                    <p className="text-xs font-medium text-muted-foreground">Tipo de naipe</p>
                    <p className="font-medium">{CHAMPIONSHIP_SPORT_NAIPE_MODE_LABELS[resolvedNaipeMode]}</p>
                  </div>

                  <div className="app-card-muted px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">Pontuação</p>
                    <p className="font-medium">V {resolvedPointsWin} • E {resolvedPointsDraw} • D {resolvedPointsLoss}</p>
                  </div>

                  <div className="app-card-muted px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">Cartões</p>
                    <p className="font-medium">{resolvedSupportsCards ? "Sim" : "Não"}</p>
                  </div>

                  <div className="app-card-muted px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">Regra de resultado</p>
                    <p className="font-medium">{CHAMPIONSHIP_SPORT_RESULT_RULE_LABELS[resolvedResultRule]}</p>
                  </div>
                </div>

                <div className="app-card-muted space-y-2 px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground">Duração padrão da partida</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      placeholder="Minutos"
                      className="h-8 w-32 text-sm"
                      disabled={!canManageSports || !sport || isSavingSport}
                      value={sport ? (durationDraftBySportId[sport.id] ?? "") : ""}
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
                      disabled={!canManageSports || !sport || isSavingSport || !hasDurationChanges}
                      onClick={() => {
                        if (!sport) return;
                        void handleSaveDefaultMatchDuration(sport, championshipSport);
                      }}
                    >
                      {isSavingSport ? "Salvando…" : "Salvar"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ao salvar, a agenda da edição atual é redistribuída com a nova duração da modalidade.
                  </p>
                  {!sport ? (
                    <p className="text-xs text-muted-foreground">
                      A modalidade precisa existir no banco para editar esta configuração.
                    </p>
                  ) : null}
                </div>

                <div className="app-card-muted px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground">Critérios de desempate (ordem de prioridade)</p>
                  <ol className="mt-1 space-y-1 text-sm font-medium">
                    {platformSportRule.tieBreakerPriority.map((tieBreakerPriorityItem, tieBreakerPriorityIndex) => (
                      <li key={tieBreakerPriorityItem}>
                        {tieBreakerPriorityIndex + 1}. {tieBreakerPriorityItem}
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="app-card-muted space-y-2 px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground">Horário estimado nos cards</p>
                  <RadioGroup
                    value={shouldShowEstimatedStartTimeOnCards ? "YES" : "NO"}
                    onValueChange={(value) => {
                      if (!championshipSport) {
                        return;
                      }

                      const nextShouldShowEstimatedStartTimeOnCards = value == "YES";

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
                      <RadioGroupItem value="YES" disabled={!canManageSports || !championshipSport || isSavingSport} />
                      Sim
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="NO" disabled={!canManageSports || !championshipSport || isSavingSport} />
                      Não
                    </label>
                  </RadioGroup>

                  {!championshipSport ? (
                    <p className="text-xs text-muted-foreground">
                      Vincule a modalidade ao campeonato para editar esta configuração.
                    </p>
                  ) : null}

                  {!canManageSports ? (
                    <p className="text-xs text-muted-foreground">
                      Perfil em visualização: sem permissão para editar a aba de modalidades.
                    </p>
                  ) : null}
                </div>

                <div className="app-card-muted space-y-2 px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground">Pontuação máxima (W.O.)</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      placeholder="Desabilitado"
                      className="h-8 w-32 text-sm"
                      disabled={!canManageSports || !championshipSport || isSavingSport}
                      value={sport ? (walkoverDraftBySportId[sport.id] ?? "") : ""}
                      onChange={(e) => {
                        if (!sport) return;
                        setWalkoverDraftBySportId((current) => ({
                          ...current,
                          [sport.id]: e.target.value,
                        }));
                      }}
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={!canManageSports || !championshipSport || isSavingSport || !hasWalkoverChanges}
                      onClick={() => {
                        if (!championshipSport || !sport) return;
                        void handleSaveWalkoverWinnerPoints(championshipSport, sport.id);
                      }}
                    >
                      {isSavingSport ? "Salvando…" : "Salvar"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {sport && walkoverDraftBySportId[sport.id]
                      ? `Vencedor recebe ${walkoverDraftBySportId[sport.id]} ponto(s) em caso de W.O.`
                      : "W.O. desabilitado — deixe o campo vazio para desabilitar."}
                  </p>
                  {!championshipSport ? (
                    <p className="text-xs text-muted-foreground">
                      Vincule a modalidade ao campeonato para editar esta configuração.
                    </p>
                  ) : null}
                </div>

                {supportsAwards ? (
                  <>
                    <div className="app-card-muted space-y-2 px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground">Cadastro de atletas na súmula</p>
                      <RadioGroup
                        value={supportsIndividualAwards ? "YES" : "NO"}
                        onValueChange={(value) => {
                          if (!championshipSport) {
                            return;
                          }

                          const nextValue = value == "YES";

                          if (nextValue == championshipSport.supports_individual_awards) {
                            return;
                          }

                          void handleToggleSupportsIndividualAwards(championshipSport, nextValue);
                        }}
                        className="flex items-center gap-4"
                      >
                        <label className="flex items-center gap-2 text-sm">
                          <RadioGroupItem value="NO" disabled={!canManageSports || !championshipSport || isSavingSport} />
                          Desabilitado
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <RadioGroupItem value="YES" disabled={!canManageSports || !championshipSport || isSavingSport} />
                          Habilitado
                        </label>
                      </RadioGroup>

                      {!championshipSport ? (
                        <p className="text-xs text-muted-foreground">
                          Vincule a modalidade ao campeonato para editar esta configuração.
                        </p>
                      ) : null}

                      {!canManageSports ? (
                        <p className="text-xs text-muted-foreground">
                          Perfil em visualização: sem permissão para editar a aba de modalidades.
                        </p>
                      ) : null}
                    </div>

                    <div className="app-card-muted space-y-2 px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground">Contabilização de prêmios (artilheiro e melhor defesa)</p>
                      <RadioGroup
                        value={awardsIncludeKnockout ? "YES" : "NO"}
                        onValueChange={(value) => {
                          if (!championshipSport) {
                            return;
                          }

                          const nextValue = value == "YES";

                          if (nextValue == championshipSport.awards_include_knockout_phase) {
                            return;
                          }

                          void handleToggleAwardsIncludeKnockout(championshipSport, nextValue);
                        }}
                        className="flex items-center gap-4"
                      >
                        <label className="flex items-center gap-2 text-sm">
                          <RadioGroupItem value="NO" disabled={!canManageSports || !championshipSport || isSavingSport} />
                          Somente fase de grupos
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <RadioGroupItem value="YES" disabled={!canManageSports || !championshipSport || isSavingSport} />
                          Fase de grupos + Eliminatória
                        </label>
                      </RadioGroup>

                      {!championshipSport ? (
                        <p className="text-xs text-muted-foreground">
                          Vincule a modalidade ao campeonato para editar esta configuração.
                        </p>
                      ) : null}

                      {!canManageSports ? (
                        <p className="text-xs text-muted-foreground">
                          Perfil em visualização: sem permissão para editar a aba de modalidades.
                        </p>
                      ) : null}

                      <p className="text-xs text-muted-foreground">
                        Com a opção desligada, a apuração considera somente a fase de grupos. Com a opção ligada, soma fase
                        de grupos + eliminatória, mas só entram no ranking atléticas e jogadores de atléticas que
                        disputaram ao menos um jogo eliminatório válido.
                      </p>
                    </div>

                    <div className="app-card-muted space-y-2 px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground">Critérios de premiação</p>
                      <div className="space-y-2 text-sm">
                        <p>
                          <span className="font-medium">Artilheiro:</span> maior número de gols, equipe que avançou mais longe no campeonato e, se o empate persistir, sorteio.
                        </p>
                        <p>
                          <span className="font-medium">Melhor defesa:</span> menor média de gols sofridos por jogo, menor total de gols sofridos, maior número de jogos e, se necessário, sorteio.
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        A plataforma define a atlética vencedora da melhor defesa. A própria atlética indica internamente qual goleiro deve receber o prêmio.
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
