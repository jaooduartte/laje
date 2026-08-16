import { useState } from "react";
import { Loader2 } from "lucide-react";
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
    helper: "1º × 8º, 4º × 5º | 2º × 7º, 3º × 6º",
  },
  {
    value: "RANKING_ALTERNATING",
    label: "Ranking alternado",
    helper: "1º × 8º, 3º × 6º | 2º × 7º, 4º × 5º",
  },
  {
    value: "LINEAR",
    label: "Linear",
    helper: "1º × 8º, 2º × 7º | 3º × 6º, 4º × 5º",
  },
] satisfies ReadonlyArray<{
  value: ChampionshipKnockoutPairingMode;
  label: string;
  helper: string;
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
      },
    });

    setSavingCompetitionId(null);

    if (!previewCreated) {
      return;
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {competitions.map((competition) => {
        const persistedQualificationMode = resolveQualificationModeOption({
          qualifiers_per_group: competition.qualifiers_per_group,
          should_complete_knockout_with_best_second_placed_teams:
            competition.should_complete_knockout_with_best_second_placed_teams ??
            false,
        });

        const persistedPairingMode =
          competition.knockout_pairing_mode ?? "LINEAR";

        const selectedQualificationMode =
          selectedQualificationModeByCompetitionId[competition.id] ??
          persistedQualificationMode;

        const selectedPairingMode =
          selectedPairingModeByCompetitionId[competition.id] ??
          persistedPairingMode;

        const isKnockoutStructured = competition.knockout_matches.length > 0;

        const isKnockoutMaterialized = competition.knockout_matches.some(
          (knockoutMatch) =>
            knockoutMatch.match_id != null ||
            knockoutMatch.home_team_id != null ||
            knockoutMatch.away_team_id != null ||
            knockoutMatch.winner_team_id != null,
        );

        const canEditQualification = isEditable && !isKnockoutStructured;
        const canEditPairing = isEditable && !isKnockoutMaterialized;
        const isSaving = savingCompetitionId === competition.id;

        const hasQualificationChange =
          canEditQualification &&
          selectedQualificationMode !== persistedQualificationMode;

        const hasPairingChange =
          canEditPairing && selectedPairingMode !== persistedPairingMode;

        const hasPendingChange =
          hasQualificationChange || hasPairingChange;

        return (
          <div
            key={competition.id}
            className="glass-card flex h-full flex-col space-y-5 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium">
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
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">
                  Classificação para o mata-mata
                </p>
                {isKnockoutStructured ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    A quantidade de classificados não pode mais ser alterada
                    porque a estrutura eliminatória já foi criada.
                  </p>
                ) : null}
              </div>

              <RadioGroup
                value={selectedQualificationMode}
                disabled={!canEditQualification || isSaving}
                onValueChange={(value) =>
                  setSelectedQualificationModeByCompetitionId((prev) => ({
                    ...prev,
                    [competition.id]: value as QualificationModeOption,
                  }))
                }
                className="space-y-2"
              >
                {QUALIFICATION_MODE_OPTIONS.map((modeOption) => (
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
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-3 border-t border-border/40 pt-4">
              <div>
                <p className="text-sm font-semibold">
                  Pareamento do mata-mata
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Define a distribuição dos classificados na primeira rodada
                  eliminatória.
                </p>
              </div>

              <RadioGroup
                value={selectedPairingMode}
                disabled={!canEditPairing || isSaving}
                onValueChange={(value) =>
                  setSelectedPairingModeByCompetitionId((prev) => ({
                    ...prev,
                    [competition.id]:
                      value as ChampionshipKnockoutPairingMode,
                  }))
                }
                className="space-y-2"
              >
                {KNOCKOUT_PAIRING_MODE_OPTIONS.map((modeOption) => (
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
                ))}
              </RadioGroup>

              {isKnockoutMaterialized ? (
                <p className="text-xs text-muted-foreground">
                  O pareamento não pode mais ser alterado porque os confrontos
                  eliminatórios já foram materializados.
                </p>
              ) : null}
            </div>

            {isEditable && (canEditQualification || canEditPairing) ? (
              <div className="mt-auto flex justify-end pt-1">
                <Button
                  type="button"
                  size="sm"
                  disabled={!hasPendingChange || isSaving}
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
        );
      })}
    </div>
  );
}