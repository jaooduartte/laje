import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AppBadge } from "@/components/ui/app-badge";
import { AppBadgeTone } from "@/lib/enums";
import {
  MATCH_NAIPE_LABELS,
  TEAM_DIVISION_LABELS,
} from "@/lib/championship";
import {
  QUALIFICATION_MODE_OPTIONS,
  resolveCompetitionConfigByQualificationMode,
  resolveQualificationModeOption,
  type QualificationModeOption,
} from "@/domain/championship-brackets/championshipBracketQualification";
import { AdminChampionshipKnockoutPairingPreview } from "@/components/admin/AdminChampionshipKnockoutPairingPreview";
import type { ChampionshipKnockoutPairingMode } from "@/domain/championship-brackets/championshipBracketPairing";
import type { ChampionshipBracketReconfigurationRequest } from "@/domain/championship-brackets/championshipBracket.types";
import type { ChampionshipBracketCompetition } from "@/lib/types";

interface Props {
  competitions: ChampionshipBracketCompetition[];
  isEditable: boolean;
  onRequestReconfiguration: (
    request: ChampionshipBracketReconfigurationRequest,
  ) => Promise<boolean>;
}

const KNOCKOUT_PAIRING_MODE_OPTIONS = [
  {
    value: "CLASSIC_SEEDED",
    label: "Clássico por cabeça de chave",
  },
  {
    value: "RANKING_ALTERNATING",
    label: "Ranking alternado",
  },
  {
    value: "LINEAR",
    label: "Linear",
  },
] satisfies ReadonlyArray<{
  value: ChampionshipKnockoutPairingMode;
  label: string;
}>;

function resolveCompetitionLabel(
  competition: ChampionshipBracketCompetition,
): string {
  const divisionSuffix = competition.division
    ? ` • ${TEAM_DIVISION_LABELS[competition.division]}`
    : "";

  return `${competition.sport_name} • ${
    MATCH_NAIPE_LABELS[competition.naipe]
  }${divisionSuffix}`;
}

function resolveQualificationModeLabel(
  mode: QualificationModeOption,
): string {
  return (
    QUALIFICATION_MODE_OPTIONS.find(
      (option) => option.value == mode,
    )?.label ?? "Classificação não definida"
  );
}

function resolvePairingModeLabel(
  mode: ChampionshipKnockoutPairingMode,
): string {
  return (
    KNOCKOUT_PAIRING_MODE_OPTIONS.find(
      (option) => option.value == mode,
    )?.label ?? "Pareamento não definido"
  );
}

export function AdminChampionshipQualificationSection({
  competitions,
  isEditable,
  onRequestReconfiguration,
}: Props) {
  const [selectedQualificationModeByCompetitionId, setSelectedQualificationModeByCompetitionId] =
    useState<Record<string, QualificationModeOption>>({});

  const [selectedPairingModeByCompetitionId, setSelectedPairingModeByCompetitionId] =
    useState<Record<string, ChampionshipKnockoutPairingMode>>({});

  const [savingCompetitionId, setSavingCompetitionId] = useState<string | null>(
    null,
  );

  const [expandedCompetitionIds, setExpandedCompetitionIds] =
    useState<Set<string>>(new Set());

  function toggleCompetitionExpanded(competitionId: string) {
    setExpandedCompetitionIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(competitionId)) {
        nextIds.delete(competitionId);
      } else {
        nextIds.add(competitionId);
      }

      return nextIds;
    });
  }

  if (competitions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Nenhuma competição configurada nesta edição.
      </p>
    );
  }

  async function saveCompetition(
    competition: ChampionshipBracketCompetition,
    qualificationMode: QualificationModeOption,
    pairingMode: ChampionshipKnockoutPairingMode,
  ) {
    const nextConfig = resolveCompetitionConfigByQualificationMode(
      {
        qualifiers_per_group: competition.qualifiers_per_group,
        should_complete_knockout_with_best_second_placed_teams:
          competition.should_complete_knockout_with_best_second_placed_teams ??
          false,
      },
      qualificationMode,
    );

    const currentQualificationMode =
      resolveQualificationModeOption({
        qualifiers_per_group:
          competition.qualifiers_per_group,
        should_complete_knockout_with_best_second_placed_teams:
          competition.should_complete_knockout_with_best_second_placed_teams ??
          false,
      });

    const currentPairingMode =
      competition.knockout_pairing_mode ?? "LINEAR";

    setSavingCompetitionId(competition.id);

    const previewCreated = await onRequestReconfiguration({
      action: "COMPETITION_SETTINGS",
      label: `Classificação e pareamento de ${resolveCompetitionLabel(
        competition,
      )}`,
      payload: {
        competition_id: competition.id,
        qualifiers_per_group: nextConfig.qualifiers_per_group,
        should_complete_knockout_with_best_second_placed_teams:
          nextConfig.should_complete_knockout_with_best_second_placed_teams,
        knockout_pairing_mode: pairingMode,
        competition_label:
          resolveCompetitionLabel(competition),
        current_qualification_mode:
          currentQualificationMode,
        current_qualification_label:
          resolveQualificationModeLabel(
            currentQualificationMode,
          ),
        target_qualification_mode:
          qualificationMode,
        target_qualification_label:
          resolveQualificationModeLabel(
            qualificationMode,
          ),
        current_pairing_mode:
          currentPairingMode,
        current_pairing_label:
          resolvePairingModeLabel(
            currentPairingMode,
          ),
        target_pairing_mode:
          pairingMode,
        target_pairing_label:
          resolvePairingModeLabel(
            pairingMode,
          ),
      },
    });

    setSavingCompetitionId(null);

    if (!previewCreated) {
      return;
    }
  }

  return (
    <div className="space-y-3">
      {competitions.map((competition) => {
        const persistedQualificationMode =
          resolveQualificationModeOption({
            qualifiers_per_group:
              competition.qualifiers_per_group,
            should_complete_knockout_with_best_second_placed_teams:
              competition.should_complete_knockout_with_best_second_placed_teams ??
              false,
          });

        const persistedPairingMode =
          competition.knockout_pairing_mode ?? "LINEAR";

        const selectedQualificationMode =
          selectedQualificationModeByCompetitionId[
            competition.id
          ] ?? persistedQualificationMode;

        const selectedPairingMode =
          selectedPairingModeByCompetitionId[
            competition.id
          ] ?? persistedPairingMode;

        const isKnockoutStructured =
          competition.knockout_matches.length > 0;

        const isKnockoutMaterialized =
          competition.knockout_matches.some(
            (knockoutMatch) =>
              knockoutMatch.match_id != null ||
              knockoutMatch.home_team_id != null ||
              knockoutMatch.away_team_id != null ||
              knockoutMatch.winner_team_id != null,
          );

        const canEditQualification =
          isEditable && !isKnockoutStructured;

        const canEditPairing =
          isEditable && !isKnockoutMaterialized;

        const isSaving =
          savingCompetitionId === competition.id;

        const hasQualificationChange =
          canEditQualification &&
          selectedQualificationMode !==
            persistedQualificationMode;

        const hasPairingChange =
          canEditPairing &&
          selectedPairingMode !== persistedPairingMode;

        const hasPendingChange =
          hasQualificationChange || hasPairingChange;

        const isExpanded =
          expandedCompetitionIds.has(competition.id);

        return (
          <div
            key={competition.id}
            className="glass-card overflow-hidden"
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/20"
              aria-expanded={isExpanded}
              onClick={() =>
                toggleCompetitionExpanded(competition.id)
              }
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold">
                    {resolveCompetitionLabel(competition)}
                  </h4>

                  {isKnockoutMaterialized ? (
                    <AppBadge tone={AppBadgeTone.AMBER}>
                      Mata-mata materializado
                    </AppBadge>
                  ) : isKnockoutStructured ? (
                    <AppBadge tone={AppBadgeTone.SILVER}>
                      Mata-mata estruturado
                    </AppBadge>
                  ) : null}

                  {hasPendingChange ? (
                    <AppBadge tone={AppBadgeTone.AMBER}>
                      Alterações pendentes
                    </AppBadge>
                  ) : null}
                </div>

                <p className="text-xs text-muted-foreground">
                  {resolveQualificationModeLabel(
                    selectedQualificationMode,
                  )}
                  {" • "}
                  {resolvePairingModeLabel(
                    selectedPairingMode,
                  )}
                </p>
              </div>

              <div className="shrink-0 text-muted-foreground">
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </div>
            </button>

            {isExpanded ? (
              <div className="border-t border-border/40 p-4">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold">
                        Classificação para o mata-mata
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        Define quantas equipes avançam da fase
                        classificatória para o mata-mata.
                      </p>

                      {isKnockoutStructured ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          A quantidade de classificados não pode
                          mais ser alterada porque a estrutura
                          eliminatória já foi criada.
                        </p>
                      ) : null}
                    </div>

                    <RadioGroup
                      value={selectedQualificationMode}
                      disabled={
                        !canEditQualification || isSaving
                      }
                      onValueChange={(value) =>
                        setSelectedQualificationModeByCompetitionId(
                          (previousValues) => ({
                            ...previousValues,
                            [competition.id]:
                              value as QualificationModeOption,
                          }),
                        )
                      }
                      className="space-y-2"
                    >
                      {QUALIFICATION_MODE_OPTIONS.map(
                        (modeOption) => (
                          <label
                            key={modeOption.value}
                            className="app-card-muted flex cursor-pointer items-start gap-3 p-3 has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5"
                          >
                            <RadioGroupItem
                              value={modeOption.value}
                              className="mt-0.5"
                            />

                            <span className="space-y-0.5">
                              <span className="block text-sm font-medium">
                                {modeOption.label}
                              </span>

                              <span className="block text-xs text-muted-foreground">
                                {modeOption.helper}
                              </span>
                            </span>
                          </label>
                        ),
                      )}
                    </RadioGroup>
                  </div>

                  <div className="space-y-3 lg:border-l lg:border-border/40 lg:pl-6">
                    <div>
                      <p className="text-sm font-semibold">
                        Pareamento do mata-mata
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        Define a distribuição dos classificados na
                        primeira rodada eliminatória.
                      </p>
                    </div>

                    <RadioGroup
                      value={selectedPairingMode}
                      disabled={!canEditPairing || isSaving}
                      onValueChange={(value) =>
                        setSelectedPairingModeByCompetitionId(
                          (previousValues) => ({
                            ...previousValues,
                            [competition.id]:
                              value as ChampionshipKnockoutPairingMode,
                          }),
                        )
                      }
                      className="space-y-2"
                    >
                      {KNOCKOUT_PAIRING_MODE_OPTIONS.map(
                        (modeOption) => (
                          <label
                            key={modeOption.value}
                            className="app-card-muted flex cursor-pointer items-start gap-3 p-3 has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5"
                          >
                            <RadioGroupItem
                              value={modeOption.value}
                              className="mt-0.5 shrink-0"
                            />

                            <div className="min-w-0 flex-1 space-y-2">
                              <span className="block text-sm font-medium">
                                {modeOption.label}
                              </span>

                              <AdminChampionshipKnockoutPairingPreview
                                competition={competition}
                                qualificationMode={
                                  selectedQualificationMode
                                }
                                pairingMode={modeOption.value}
                              />
                            </div>
                          </label>
                        ),
                      )}
                    </RadioGroup>

                    {isKnockoutMaterialized ? (
                      <p className="text-xs text-muted-foreground">
                        O pareamento não pode mais ser alterado
                        porque os confrontos eliminatórios já foram
                        materializados.
                      </p>
                    ) : null}
                  </div>
                </div>

                {isEditable &&
                (canEditQualification || canEditPairing) ? (
                  <div className="mt-5 flex justify-end border-t border-border/40 pt-4">
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        !hasPendingChange || isSaving
                      }
                      onClick={() =>
                        saveCompetition(
                          competition,
                          selectedQualificationMode,
                          selectedPairingMode,
                        )
                      }
                    >
                      {isSaving ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : null}

                      Salvar configuração
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}