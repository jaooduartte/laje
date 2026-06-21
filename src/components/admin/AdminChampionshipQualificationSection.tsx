import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AppBadge } from "@/components/ui/app-badge";
import { AppBadgeTone } from "@/lib/enums";
import { MATCH_NAIPE_LABELS, TEAM_DIVISION_LABELS } from "@/lib/championship";
import { cn } from "@/lib/utils";
import {
  QUALIFICATION_MODE_OPTIONS,
  resolveCompetitionConfigByQualificationMode,
  resolveQualificationModeOption,
  type QualificationModeOption,
} from "@/domain/championship-brackets/championshipBracketQualification";
import {
  CHAMPIONSHIP_KNOCKOUT_PAIRING_MODE_OPTIONS,
  resolveCompetitionKnockoutPairingModeControlValue,
  resolveIsCrossGroupKnockoutPairingAvailable,
  resolveIsLegacyKnockoutPairingMode,
  type ChampionshipKnockoutPairingMode,
} from "@/domain/championship-brackets/championshipBracketPairing";
import { updateBracketCompetitionSettings } from "@/domain/championship-brackets/championshipBracket.repository";
import type { ChampionshipBracketCompetition } from "@/lib/types";

interface Props {
  competitions: ChampionshipBracketCompetition[];
  isEditable: boolean;
  onSaved: () => void;
}

function resolveCompetitionLabel(competition: ChampionshipBracketCompetition): string {
  const divisionSuffix = competition.division
    ? ` • ${TEAM_DIVISION_LABELS[competition.division]}`
    : "";

  return `${competition.sport_name} • ${MATCH_NAIPE_LABELS[competition.naipe]}${divisionSuffix}`;
}

export function AdminChampionshipQualificationSection({ competitions, isEditable, onSaved }: Props) {
  const [selectedModeByCompetitionId, setSelectedModeByCompetitionId] = useState<
    Record<string, QualificationModeOption>
  >({});
  const [selectedPairingModeByCompetitionId, setSelectedPairingModeByCompetitionId] = useState<
    Record<string, ChampionshipKnockoutPairingMode>
  >({});
  const [savingCompetitionId, setSavingCompetitionId] = useState<string | null>(null);

  if (competitions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Nenhuma competição configurada nesta edição.
      </p>
    );
  }

  async function saveCompetition(competition: ChampionshipBracketCompetition, mode: QualificationModeOption) {
    const nextConfig = resolveCompetitionConfigByQualificationMode(
      {
        qualifiers_per_group: competition.qualifiers_per_group,
        should_complete_knockout_with_best_second_placed_teams:
          competition.should_complete_knockout_with_best_second_placed_teams ?? false,
      },
      mode,
    );
    const nextKnockoutPairingMode =
      selectedPairingModeByCompetitionId[competition.id] ??
      competition.knockout_pairing_mode ??
      "LINEAR";

    setSavingCompetitionId(competition.id);

    const { error } = await updateBracketCompetitionSettings(
      competition.id,
      nextConfig.qualifiers_per_group,
      nextConfig.should_complete_knockout_with_best_second_placed_teams,
      nextKnockoutPairingMode,
    );

    setSavingCompetitionId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Configuração de classificação e cruzamento atualizada.");
    setSelectedModeByCompetitionId((prev) => {
      const next = { ...prev };
      delete next[competition.id];
      return next;
    });
    setSelectedPairingModeByCompetitionId((prev) => {
      const next = { ...prev };
      delete next[competition.id];
      return next;
    });
    onSaved();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {competitions.map((competition) => {
        const persistedMode = resolveQualificationModeOption({
          qualifiers_per_group: competition.qualifiers_per_group,
          should_complete_knockout_with_best_second_placed_teams:
            competition.should_complete_knockout_with_best_second_placed_teams ?? false,
        });
        const selectedMode = selectedModeByCompetitionId[competition.id] ?? persistedMode;
        const persistedPairingMode = competition.knockout_pairing_mode ?? "LINEAR";
        const selectedPairingMode =
          selectedPairingModeByCompetitionId[competition.id] ?? persistedPairingMode;
        const selectedPairingControlValue =
          resolveCompetitionKnockoutPairingModeControlValue(selectedPairingMode);
        const isKnockoutGenerated = competition.knockout_matches.length > 0;
        const isCompetitionEditable = isEditable && !isKnockoutGenerated;
        const isSaving = savingCompetitionId === competition.id;
        const hasPendingChange =
          selectedMode !== persistedMode || selectedPairingMode !== persistedPairingMode;
        const isCrossGroupAvailable = resolveIsCrossGroupKnockoutPairingAvailable({
          sport_name: competition.sport_name,
          naipe: competition.naipe,
          division: competition.division,
        });
        const showsLegacyHint = resolveIsLegacyKnockoutPairingMode(persistedPairingMode);

        return (
          <div key={competition.id} className="glass-card flex h-full flex-col space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium">{resolveCompetitionLabel(competition)}</h4>
              {isKnockoutGenerated ? (
                <AppBadge tone={AppBadgeTone.AMBER}>Mata-mata já gerado</AppBadge>
              ) : null}
            </div>

            <RadioGroup
              value={selectedMode}
              disabled={!isCompetitionEditable || isSaving}
              onValueChange={(value) =>
                setSelectedModeByCompetitionId((prev) => ({
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
                  <RadioGroupItem value={modeOption.value} className="mt-0.5" />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">{modeOption.label}</span>
                    <span className="block text-xs text-muted-foreground">{modeOption.helper}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>

            <div className="space-y-2">
              <p className="text-sm font-medium">Tipo de cruzamento</p>
              <RadioGroup
                value={selectedPairingControlValue}
                disabled={!isCompetitionEditable || isSaving}
                onValueChange={(value) =>
                  setSelectedPairingModeByCompetitionId((prev) => ({
                    ...prev,
                    [competition.id]: value as ChampionshipKnockoutPairingMode,
                  }))
                }
                className="space-y-2"
              >
                {CHAMPIONSHIP_KNOCKOUT_PAIRING_MODE_OPTIONS.map((modeOption) => {
                  const isCrossGroupOption =
                    modeOption.value == "FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS";
                  const isOptionEnabled =
                    !isCrossGroupOption || isCrossGroupAvailable;

                  return (
                    <label
                      key={modeOption.value}
                      className={cn(
                        "app-card-muted flex items-start gap-3 p-3",
                        isOptionEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                      )}
                    >
                      <RadioGroupItem
                        value={modeOption.value}
                        className="mt-0.5"
                        disabled={!isOptionEnabled}
                      />
                      <span className="space-y-0.5">
                        <span className="block text-sm font-medium">{modeOption.label}</span>
                        <span className="block text-xs text-muted-foreground">{modeOption.helper}</span>
                      </span>
                    </label>
                  );
                })}
              </RadioGroup>
              {showsLegacyHint ? (
                <p className="text-xs text-muted-foreground">
                  Esta competição está com um modo legado preservado. Ele só será trocado se você salvar um novo tipo de cruzamento.
                </p>
              ) : null}
            </div>

            {isCompetitionEditable ? (
              <div className="mt-auto flex justify-end pt-1">
                <Button
                  type="button"
                  size="sm"
                  disabled={!hasPendingChange || isSaving}
                  onClick={() => saveCompetition(competition, selectedMode)}
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Salvar classificação e cruzamento
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
