import { AdminListSkeleton } from "@/components/skeletons/AdminListSkeleton";
import { resolveBracketKnockoutPriorityDivisionScopeLabel } from "@/components/admin/adminKnockoutCourtPriority.utils";
import { Button } from "@/components/ui/button";
import { getBracketKnockoutCourtPriorities } from "@/domain/championship-brackets/championshipBracket.repository";
import type {
  BracketKnockoutCourtPriorityGroup,
  ChampionshipBracketReconfigurationRequest,
} from "@/domain/championship-brackets/championshipBracket.types";
import { ChevronDown, ChevronUp, Loader2, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  bracketEditionId: string;
  isEditable: boolean;
  sportNameBySportId: Record<string, string>;
  onRequestReconfiguration: (request: ChampionshipBracketReconfigurationRequest) => Promise<boolean>;
}

interface PriorityGroupDraft extends BracketKnockoutCourtPriorityGroup {
  selectedCourtGroupId: string;
}

interface SportPriorityGroup {
  sport_id: string;
  groups: PriorityGroupDraft[];
}

const AUTOMATIC_COURT_SELECTION_VALUE = "AUTO";

export function AdminChampionshipKnockoutPrioritySection({ bracketEditionId, isEditable, sportNameBySportId, onRequestReconfiguration }: Props) {
  const [loading, setLoading] = useState(true);
  const [priorityGroups, setPriorityGroups] = useState<PriorityGroupDraft[]>([]);
  const [savedSnapshotByKey, setSavedSnapshotByKey] = useState<Record<string, BracketKnockoutCourtPriorityGroup>>({});
  const [expandedSportIds, setExpandedSportIds] = useState<Set<string>>(new Set());
  const [savingSportId, setSavingSportId] = useState<string | null>(null);

  const loadPriorityGroups = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getBracketKnockoutCourtPriorities(bracketEditionId);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setPriorityGroups(data.map((group) => {
      const selectedLogicalCourt = group.court_group_id
        ? (group.courts.find((court) => court.court_group_ids.includes(group.court_group_id!)) ?? null)
        : null;
      return { ...group, selectedCourtGroupId: selectedLogicalCourt?.court_group_id ?? AUTOMATIC_COURT_SELECTION_VALUE };
    }));
    setSavedSnapshotByKey(data.reduce<Record<string, BracketKnockoutCourtPriorityGroup>>((carry, group) => {
      carry[resolvePriorityKey(group)] = group;
      return carry;
    }, {}));
    setLoading(false);
  }, [bracketEditionId]);

  useEffect(() => { void loadPriorityGroups(); }, [loadPriorityGroups]);

  const groupedSports = useMemo<SportPriorityGroup[]>(() => {
    const orderedGroups = [...priorityGroups].sort((left, right) => {
      const sportDifference = (sportNameBySportId[left.sport_id] ?? left.sport_id).localeCompare(
        sportNameBySportId[right.sport_id] ?? right.sport_id,
        "pt-BR",
        { sensitivity: "base" },
      );
      if (sportDifference !== 0) return sportDifference;
      if (left.phase !== right.phase) return left.phase === "SEMIFINAL" ? -1 : 1;
      return resolveDivisionSortValue(left.division_scope) - resolveDivisionSortValue(right.division_scope);
    });
    const groupsBySport = new Map<string, PriorityGroupDraft[]>();
    orderedGroups.forEach((group) => groupsBySport.set(group.sport_id, [...(groupsBySport.get(group.sport_id) ?? []), group]));
    return [...groupsBySport.entries()].map(([sport_id, groups]) => ({ sport_id, groups }));
  }, [priorityGroups, sportNameBySportId]);

  function hasExplicitFinalProgram(group: PriorityGroupDraft) {
    return group.phase === "FINAL" && group.programmed_finals.length > 0;
  }

  function resolveSavedLogicalSelection(group: PriorityGroupDraft) {
    const savedCourtGroupId = savedSnapshotByKey[resolvePriorityKey(group)]?.court_group_id;
    if (!savedCourtGroupId) return AUTOMATIC_COURT_SELECTION_VALUE;
    return group.courts.find((court) => court.court_group_ids.includes(savedCourtGroupId))?.court_group_id ?? AUTOMATIC_COURT_SELECTION_VALUE;
  }

  function isDirty(group: PriorityGroupDraft) {
    return !hasExplicitFinalProgram(group) && resolveSavedLogicalSelection(group) !== group.selectedCourtGroupId;
  }

  function updatePriorityGroup(groupKey: string, updater: (group: PriorityGroupDraft) => PriorityGroupDraft) {
    setPriorityGroups((groups) => groups.map((group) => resolvePriorityKey(group) === groupKey ? updater(group) : group));
  }

  function resolveSelectionLabel(group: PriorityGroupDraft, selectedCourtGroupId: string) {
    if (selectedCourtGroupId === AUTOMATIC_COURT_SELECTION_VALUE) {
      return group.automatic_court ? `Automático • ${group.automatic_court.location_name} • ${group.automatic_court.court_name}` : "Automático";
    }
    const selectedCourt = group.courts.find((court) => court.court_group_id === selectedCourtGroupId);
    return selectedCourt ? `${selectedCourt.location_name} • ${selectedCourt.court_name}` : "Quadra selecionada";
  }

  async function saveSportPriorities(sportGroup: SportPriorityGroup) {
    const dirtyGroups = sportGroup.groups.filter(isDirty);
    if (dirtyGroups.length === 0) return;
    const sportName = sportNameBySportId[sportGroup.sport_id] ?? "Modalidade";
    const priorityUpdates = dirtyGroups.map((group) => {
      const courtGroupId = group.selectedCourtGroupId === AUTOMATIC_COURT_SELECTION_VALUE ? null : group.selectedCourtGroupId;
      return { sport_id: group.sport_id, phase: group.phase, division_scope: group.division_scope, location_group_id: resolveSelectedLocationGroupId(group, courtGroupId), court_group_id: courtGroupId };
    });
    const priorityChanges = dirtyGroups.map((group) => ({
      phase: group.phase,
      phase_label: resolvePriorityConfigurationLabel(group),
      division_scope: group.division_scope,
      current_label: resolveSelectionLabel(group, resolveSavedLogicalSelection(group)),
      target_label: resolveSelectionLabel(group, group.selectedCourtGroupId),
    }));
    setSavingSportId(sportGroup.sport_id);
    await onRequestReconfiguration({
      action: "KNOCKOUT_COURT_PRIORITIES",
      label: `Prioridades do mata-mata • ${sportName}`,
      payload: { sport_id: sportGroup.sport_id, sport_name: sportName, priority_updates: priorityUpdates, priority_changes: priorityChanges, change_count: priorityUpdates.length },
    });
    setSavingSportId(null);
  }

  function renderPriorityEditor(group: PriorityGroupDraft) {
    const selectedCourt = group.courts.find((court) => court.court_group_id === group.selectedCourtGroupId) ?? null;
    const controlsDisabled = !isEditable || savingSportId != null;
    return (
      <div key={resolvePriorityKey(group)} className="app-card-muted space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{resolvePriorityConfigurationLabel(group)}</p>
            <p className="text-xs text-muted-foreground">Escolha uma quadra somente quando quiser substituir a decisão automática.</p>
          </div>
          {isDirty(group) ? <span className="text-xs font-medium text-amber-600">Alteração pendente</span> : null}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium">Quadra</p>
          <Select value={group.selectedCourtGroupId} onValueChange={(value) => updatePriorityGroup(resolvePriorityKey(group), (current) => ({ ...current, selectedCourtGroupId: value }))} disabled={controlsDisabled}>
            <SelectTrigger className="app-input-field"><SelectValue placeholder="Selecione uma quadra" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTOMATIC_COURT_SELECTION_VALUE}>Automático</SelectItem>
              {group.courts.map((court) => <SelectItem key={court.logical_key} value={court.court_group_id}>{court.location_name} • {court.court_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {group.selectedCourtGroupId === AUTOMATIC_COURT_SELECTION_VALUE ? (
          group.automatic_court ? <div className="rounded-lg border border-border/50 bg-background/30 px-3 py-2"><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Previsão automática</p><p className="mt-0.5 text-sm font-medium text-foreground">{group.automatic_court.location_name} • {group.automatic_court.court_name}</p></div> : <p className="text-xs text-muted-foreground">Nenhuma quadra compatível foi encontrada para a seleção automática.</p>
        ) : selectedCourt ? <p className="text-xs text-muted-foreground">Esta quadra será priorizada para esta fase do mata-mata durante uma futura redistribuição.</p> : null}
      </div>
    );
  }

  function renderProgrammedFinal(group: PriorityGroupDraft) {
    return <div key={resolvePriorityKey(group)} className="app-card-muted space-y-3 p-4">
      <div><p className="text-sm font-semibold text-foreground">Final</p><p className="text-xs text-muted-foreground">A quadra da final já está definida pela programação do mata-mata.</p></div>
      <div className="space-y-2">{group.programmed_finals.map((programmedFinal) => <div key={[programmedFinal.scheduled_date, programmedFinal.location_group_id, programmedFinal.court_group_id].join(":")} className="rounded-lg border border-border/50 bg-background/30 px-3 py-2"><p className="text-sm font-medium text-foreground">{programmedFinal.location_name} • {programmedFinal.court_name}</p><p className="text-xs text-muted-foreground">{formatProgrammedFinalDate(programmedFinal.scheduled_date)}</p></div>)}</div>
    </div>;
  }

  if (loading) return <AdminListSkeleton count={4} showActions />;
  if (groupedSports.length === 0) return <p className="py-2 text-sm text-center text-muted-foreground">Nenhuma combinação elegível de semifinal/final foi encontrada nesta edição.</p>;

  return <div className="space-y-4">
    <p className="text-xs text-muted-foreground">Revise a quadra utilizada nas fases decisivas. O modo automático já escolhe uma quadra compatível; configure uma prioridade manual somente quando quiser substituir essa escolha.</p>
    {groupedSports.map((sportGroup) => {
      const sportName = sportNameBySportId[sportGroup.sport_id] ?? "Modalidade";
      const isExpanded = expandedSportIds.has(sportGroup.sport_id);
      const dirtyCount = sportGroup.groups.filter(isDirty).length;
      const semifinalGroups = sportGroup.groups.filter((group) => group.phase === "SEMIFINAL");
      const finalGroups = sportGroup.groups.filter((group) => group.phase === "FINAL");
      const editableCount = sportGroup.groups.filter((group) => !hasExplicitFinalProgram(group)).length;
      const hasProgrammedFinal = finalGroups.some(hasExplicitFinalProgram);
      const isSaving = savingSportId === sportGroup.sport_id;
      return <div key={sportGroup.sport_id} className="glass-card overflow-hidden">
        <button type="button" className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/20" aria-expanded={isExpanded} onClick={() => setExpandedSportIds((ids) => { const next = new Set(ids); if (next.has(sportGroup.sport_id)) { next.delete(sportGroup.sport_id); } else { next.add(sportGroup.sport_id); } return next; })}>
          <div className="flex min-w-0 items-start gap-3"><Trophy className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0 space-y-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-foreground">{sportName}</p>{dirtyCount > 0 ? <span className="text-xs font-medium text-amber-600">{dirtyCount === 1 ? "1 alteração pendente" : `${dirtyCount} alterações pendentes`}</span> : null}</div><p className="text-xs text-muted-foreground">{editableCount === 1 ? "1 prioridade configurável" : `${editableCount} prioridades configuráveis`}{hasProgrammedFinal ? " • Final programada" : ""}</p></div></div>
          {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </button>
        {isExpanded ? <div className="space-y-5 border-t border-border/40 p-4">
          <div className="grid items-start gap-4 xl:grid-cols-2">
            {semifinalGroups.length > 0 ? <section className="min-w-0 space-y-3"><div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Semifinais</p><p className="mt-1 text-xs text-muted-foreground">Defina apenas overrides para a escolha automática de quadra.</p></div><div className="grid gap-3">{semifinalGroups.map(renderPriorityEditor)}</div></section> : <div />}
            {finalGroups.length > 0 ? <section className="min-w-0 space-y-3"><div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Final</p><p className="mt-1 text-xs text-muted-foreground">Consulte a quadra definida para a final desta modalidade.</p></div><div className="grid gap-3">{finalGroups.map((group) => hasExplicitFinalProgram(group) ? renderProgrammedFinal(group) : renderPriorityEditor(group))}</div></section> : null}
          </div>
          {isEditable && editableCount > 0 ? <div className="flex justify-end border-t border-border/40 pt-4"><Button type="button" size="sm" disabled={dirtyCount === 0 || savingSportId != null} onClick={() => void saveSportPriorities(sportGroup)}>{isSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Salvar prioridades</Button></div> : null}
        </div> : null}
      </div>;
    })}
  </div>;
}

function resolvePriorityKey(group: Pick<BracketKnockoutCourtPriorityGroup, "sport_id" | "phase" | "division_scope">) { return [group.sport_id, group.phase, group.division_scope].join(":"); }

function resolveDivisionSortValue(divisionScope: BracketKnockoutCourtPriorityGroup["division_scope"]) { return divisionScope === "ALL" ? 3 : divisionScope === "DIVISAO_PRINCIPAL" ? 1 : 2; }

function resolveSelectedLocationGroupId(group: PriorityGroupDraft, selectedCourtGroupId: string | null) { return selectedCourtGroupId ? (group.courts.find((court) => court.court_group_id === selectedCourtGroupId)?.location_group_id ?? null) : null; }

function resolvePriorityConfigurationLabel(group: Pick<BracketKnockoutCourtPriorityGroup, "phase" | "division_scope">) { if (group.phase === "FINAL") return "Final"; if (group.division_scope === "ALL") return "Todas as divisões"; return resolveBracketKnockoutPriorityDivisionScopeLabel(group.division_scope); }

function formatProgrammedFinalDate(value: string) { const [year, month, day] = value.slice(0, 10).split("-"); return year && month && day ? `${day}/${month}` : value; }
