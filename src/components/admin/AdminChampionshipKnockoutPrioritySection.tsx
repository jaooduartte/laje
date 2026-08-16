import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BRACKET_KNOCKOUT_PRIORITY_PHASE_LABELS,
  resolveBracketKnockoutPriorityCardTitle,
  resolveBracketKnockoutPriorityDivisionScopeLabel,
  resolveBracketKnockoutPriorityHelperText,
} from "@/components/admin/adminKnockoutCourtPriority.utils";
import {
  getBracketKnockoutCourtPriorities,
} from "@/domain/championship-brackets/championshipBracket.repository";
import type { BracketKnockoutCourtPriorityGroup, ChampionshipBracketReconfigurationRequest } from "@/domain/championship-brackets/championshipBracket.types";

interface Props {
  bracketEditionId: string;
  isEditable: boolean;
  sportNameBySportId: Record<string, string>;
  onRequestReconfiguration: (request: ChampionshipBracketReconfigurationRequest) => Promise<boolean>;
}

interface PriorityGroupDraft extends BracketKnockoutCourtPriorityGroup {
  saving: boolean;
  selectedCourtGroupId: string;
}

const AUTOMATIC_COURT_SELECTION_VALUE = "AUTO";

export function AdminChampionshipKnockoutPrioritySection({
  bracketEditionId,
  isEditable,
  sportNameBySportId,
  onRequestReconfiguration,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [priorityGroups, setPriorityGroups] = useState<PriorityGroupDraft[]>([]);
  const [savedSnapshotByKey, setSavedSnapshotByKey] = useState<Record<string, BracketKnockoutCourtPriorityGroup>>({});

  const loadPriorityGroups = useCallback(async () => {
    setLoading(true);

    const { data, error } = await getBracketKnockoutCourtPriorities(bracketEditionId);

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    setPriorityGroups(
      data.map((group) => ({
        ...group,
        saving: false,
        selectedCourtGroupId: group.court_group_id ?? AUTOMATIC_COURT_SELECTION_VALUE,
      })),
    );
    setSavedSnapshotByKey(
      data.reduce<Record<string, BracketKnockoutCourtPriorityGroup>>((carry, group) => {
        carry[resolvePriorityKey(group)] = group;
        return carry;
      }, {}),
    );
    setLoading(false);
  }, [bracketEditionId]);

  useEffect(() => {
    void loadPriorityGroups();
  }, [loadPriorityGroups]);

  const orderedGroups = useMemo(() => {
    return [...priorityGroups].sort((leftGroup, rightGroup) => {
      const sportNameDifference = (sportNameBySportId[leftGroup.sport_id] ?? leftGroup.sport_id).localeCompare(
        sportNameBySportId[rightGroup.sport_id] ?? rightGroup.sport_id,
        "pt-BR",
        { sensitivity: "base" },
      );

      if (sportNameDifference !== 0) {
        return sportNameDifference;
      }

      if (leftGroup.phase !== rightGroup.phase) {
        return leftGroup.phase === "SEMIFINAL" ? -1 : 1;
      }

      return resolveDivisionSortValue(leftGroup.division_scope) - resolveDivisionSortValue(rightGroup.division_scope);
    });
  }, [priorityGroups, sportNameBySportId]);

  function updatePriorityGroup(
    groupKey: string,
    updater: (group: PriorityGroupDraft) => PriorityGroupDraft,
  ) {
    setPriorityGroups((previousGroups) =>
      previousGroups.map((group) => (resolvePriorityKey(group) === groupKey ? updater(group) : group)),
    );
  }

  function isDirty(group: PriorityGroupDraft): boolean {
    const savedGroup = savedSnapshotByKey[resolvePriorityKey(group)];
    const selectedCourtGroupId = group.selectedCourtGroupId === AUTOMATIC_COURT_SELECTION_VALUE ? null : group.selectedCourtGroupId;
    const selectedLocationGroupId = resolveSelectedLocationGroupId(group, selectedCourtGroupId);

    return (
      (savedGroup?.court_group_id ?? null) !== selectedCourtGroupId
      || (savedGroup?.location_group_id ?? null) !== selectedLocationGroupId
    );
  }

  async function savePriorityGroup(group: PriorityGroupDraft) {
    const groupKey = resolvePriorityKey(group);
    const selectedCourtGroupId = group.selectedCourtGroupId === AUTOMATIC_COURT_SELECTION_VALUE ? null : group.selectedCourtGroupId;
    const selectedLocationGroupId = resolveSelectedLocationGroupId(group, selectedCourtGroupId);

    updatePriorityGroup(groupKey, (currentGroup) => ({ ...currentGroup, saving: true }));

    const priorityUpdates = [
      {
        sport_id: group.sport_id,
        phase: group.phase,
        division_scope: group.division_scope,
        location_group_id: selectedLocationGroupId,
        court_group_id: selectedCourtGroupId,
      },
    ];
    const previewCreated = await onRequestReconfiguration({
      action: "KNOCKOUT_COURT_PRIORITIES",
      label: "Prioridade do mata-mata",
      payload: { priority_updates: priorityUpdates },
    });

    if (!previewCreated) {
      updatePriorityGroup(groupKey, (currentGroup) => ({ ...currentGroup, saving: false }));
      return;
    }

  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (orderedGroups.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        Nenhuma combinação elegível de semifinal/final foi encontrada nesta edição.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Configure a quadra prioritária das semifinais e finais por modalidade. Sem seleção manual, a agenda usa o fallback automático da edição.
      </p>

      {orderedGroups.map((group) => {
        const sportName = sportNameBySportId[group.sport_id] ?? "Modalidade";
        const helperText = resolveBracketKnockoutPriorityHelperText({
          phase: group.phase,
          divisionScope: group.division_scope,
        });
        const selectedCourt = group.courts.find((court) => court.court_group_id === group.selectedCourtGroupId) ?? null;
        const currentSelectionLabel =
          group.selectedCourtGroupId === AUTOMATIC_COURT_SELECTION_VALUE
            ? "Fallback automático"
            : selectedCourt
                ? `${selectedCourt.location_name} • ${selectedCourt.court_name}`
                : "Quadra selecionada";

        return (
          <div key={resolvePriorityKey(group)} className="glass-card space-y-4 p-4">
            <div className="flex items-start gap-3">
              <Trophy className="mt-0.5 h-4 w-4 text-muted-foreground" />

              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">{sportName}</p>
                <p className="text-xs text-muted-foreground">
                  {resolveBracketKnockoutPriorityCardTitle({
                    phase: group.phase,
                    divisionScope: group.division_scope,
                  })}
                  {" • "}
                  {BRACKET_KNOCKOUT_PRIORITY_PHASE_LABELS[group.phase]}
                  {group.phase === "SEMIFINAL" ? ` • ${resolveBracketKnockoutPriorityDivisionScopeLabel(group.division_scope)}` : ""}
                </p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="space-y-2 rounded-2xl app-card-muted p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Quadra prioritária
                </p>
                <Select
                  value={group.selectedCourtGroupId}
                  onValueChange={(value) =>
                    updatePriorityGroup(resolvePriorityKey(group), (currentGroup) => ({
                      ...currentGroup,
                      selectedCourtGroupId: value,
                    }))
                  }
                  disabled={!isEditable || group.saving}
                >
                  <SelectTrigger className="app-input-field">
                    <SelectValue placeholder="Selecione uma quadra" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTOMATIC_COURT_SELECTION_VALUE}>Fallback automático</SelectItem>
                    {group.courts.map((court) => (
                      <SelectItem key={court.court_group_id} value={court.court_group_id}>
                        {court.location_name} • {court.court_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{helperText}</p>
              </div>

              <div className="space-y-2 rounded-2xl app-card-muted p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Seleção atual
                </p>
                <p className="text-sm font-medium text-foreground">{currentSelectionLabel}</p>
                <p className="text-xs text-muted-foreground">
                  {group.phase === "FINAL"
                    ? "A final sempre respeita esta quadra quando houver configuração."
                    : "As semifinais desta combinação priorizam esta quadra antes da redistribuição geral."}
                </p>
              </div>
            </div>

            {isEditable ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  disabled={!isDirty(group) || group.saving}
                  onClick={() => void savePriorityGroup(group)}
                >
                  {group.saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  Salvar prioridade
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function resolvePriorityKey(group: Pick<BracketKnockoutCourtPriorityGroup, "sport_id" | "phase" | "division_scope">) {
  return `${group.sport_id}:${group.phase}:${group.division_scope}`;
}

function resolveDivisionSortValue(divisionScope: BracketKnockoutCourtPriorityGroup["division_scope"]) {
  if (divisionScope === "ALL") {
    return 3;
  }

  return divisionScope === "DIVISAO_PRINCIPAL" ? 1 : 2;
}

function resolveSelectedLocationGroupId(group: PriorityGroupDraft, selectedCourtGroupId: string | null) {
  if (!selectedCourtGroupId) {
    return null;
  }

  return group.courts.find((court) => court.court_group_id === selectedCourtGroupId)?.location_group_id ?? null;
}
