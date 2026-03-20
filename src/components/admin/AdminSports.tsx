import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Championship, ChampionshipSport, Sport } from "@/lib/types";
import {
  ChampionshipCode,
} from "@/lib/enums";
import {
  CHAMPIONSHIP_SPORT_RESULT_RULE_LABELS,
  CHAMPIONSHIP_SPORT_NAIPE_MODE_LABELS,
} from "@/lib/championship";
import { CLV_PLATFORM_SPORT_RULES } from "@/domain/sport-rules/sportRules.constants";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface Props {
  sports: Sport[];
  championshipSports: ChampionshipSport[];
  selectedChampionship: Championship;
  canManageSports?: boolean;
}

function normalizeSportName(sportName: string): string {
  return sportName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function AdminSports({
  sports,
  championshipSports,
  selectedChampionship,
  canManageSports = true,
}: Props) {
  const [savingSportIdById, setSavingSportIdById] = useState<Record<string, boolean>>({});
  const [optimisticEstimatedStartTimeBySportId, setOptimisticEstimatedStartTimeBySportId] = useState<
    Record<string, boolean | undefined>
  >({});

  const sportsByNormalizedName = useMemo(() => {
    const map = new Map<string, Sport>();

    sports.forEach((sport) => {
      map.set(normalizeSportName(sport.name), sport);
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

  useEffect(() => {
    const nextOptimisticEstimatedStartTimeBySportId = championshipSports.reduce<
      Record<string, boolean | undefined>
    >((carry, championshipSport) => {
      carry[championshipSport.sport_id] = championshipSport.show_estimated_start_time_on_cards;
      return carry;
    }, {});

    setOptimisticEstimatedStartTimeBySportId(nextOptimisticEstimatedStartTimeBySportId);
  }, [championshipSports]);

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

  if (selectedChampionship.code != ChampionshipCode.CLV) {
    return (
      <div className="space-y-6">
        <div className="enter-section space-y-3 glass-card p-4">
          <h2 className="text-2xl font-display font-bold">Modalidades oficiais</h2>
          <p className="text-sm text-muted-foreground">
            As regras padronizadas foram definidas para a Copa Laje de Verão (CLV). Selecione o campeonato CLV para visualizar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="enter-section space-y-5 glass-card p-4">
        <h2 className="text-2xl font-display font-bold">Modalidades oficiais da Copa Laje de Verão</h2>
        <p className="text-sm text-muted-foreground">
          Configuração fixa conforme regulamento: naipe, pontuação e critérios de desempate.
        </p>

        <div className="space-y-2">
          {CLV_PLATFORM_SPORT_RULES.map((platformSportRule) => {
            const sport = sportsByNormalizedName.get(normalizeSportName(platformSportRule.sportName));
            const championshipSport = sport ? championshipSportBySportId.get(sport.id) : undefined;
            const isLinkedToChampionship = !!championshipSport;

            const resolvedNaipeMode = championshipSport?.naipe_mode ?? platformSportRule.naipeMode;
            const resolvedPointsWin = championshipSport?.points_win ?? platformSportRule.pointsWin;
            const resolvedPointsDraw = championshipSport?.points_draw ?? platformSportRule.pointsDraw;
            const resolvedPointsLoss = championshipSport?.points_loss ?? platformSportRule.pointsLoss;
            const resolvedSupportsCards = championshipSport?.supports_cards ?? platformSportRule.supportsCards;
            const resolvedResultRule = championshipSport?.result_rule ?? platformSportRule.resultRule;
            const resolvedDefaultMatchDurationMinutes =
              championshipSport?.default_match_duration_minutes ?? platformSportRule.defaultMatchDurationMinutes;
            const isBeachSoccer = normalizeSportName(platformSportRule.sportName) == "beach soccer";
            const shouldShowEstimatedStartTimeOnCards =
              optimisticEstimatedStartTimeBySportId[sport?.id ?? ""] ??
              championshipSport?.show_estimated_start_time_on_cards ??
              false;
            const isSavingSport = championshipSport
              ? savingSportIdById[championshipSport.id] == true
              : false;

            return (
              <div key={platformSportRule.sportName} className="list-item-card space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display font-semibold">{platformSportRule.sportName}</p>
                </div>

                <p className="text-xs font-medium text-muted-foreground">
                  {isLinkedToChampionship ? "Vinculada ao campeonato selecionado." : "Não vinculada ao campeonato selecionado."}
                </p>

                <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div className="glass-panel-muted px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">Tipo de naipe</p>
                    <p className="font-medium">{CHAMPIONSHIP_SPORT_NAIPE_MODE_LABELS[resolvedNaipeMode]}</p>
                  </div>

                  <div className="glass-panel-muted px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">Pontuação</p>
                    <p className="font-medium">V {resolvedPointsWin} • E {resolvedPointsDraw} • D {resolvedPointsLoss}</p>
                  </div>

                  <div className="glass-panel-muted px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">Cartões</p>
                    <p className="font-medium">{resolvedSupportsCards ? "Sim" : "Não"}</p>
                  </div>

                  <div className="glass-panel-muted px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">Regra de resultado</p>
                    <p className="font-medium">{CHAMPIONSHIP_SPORT_RESULT_RULE_LABELS[resolvedResultRule]}</p>
                    <p className="text-xs text-muted-foreground">{resolvedDefaultMatchDurationMinutes} min por jogo</p>
                  </div>
                </div>

                <div className="glass-panel-muted px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground">Critérios de desempate (ordem de prioridade)</p>
                  <ol className="mt-1 space-y-1 text-sm font-medium">
                    {platformSportRule.tieBreakerPriority.map((tieBreakerPriorityItem, tieBreakerPriorityIndex) => (
                      <li key={tieBreakerPriorityItem}>
                        {tieBreakerPriorityIndex + 1}. {tieBreakerPriorityItem}
                      </li>
                    ))}
                  </ol>
                </div>

                {isBeachSoccer ? (
                  <div className="glass-panel-muted space-y-2 px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">Horário estimado nos cards (Beach Soccer)</p>
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
                        Vincule Beach Soccer ao campeonato para editar esta configuração.
                      </p>
                    ) : null}

                    {!canManageSports ? (
                      <p className="text-xs text-muted-foreground">
                        Perfil em visualização: sem permissão para editar a aba de modalidades.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
