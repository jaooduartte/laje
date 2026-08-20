import { AdminListSkeleton } from "@/components/skeletons/AdminListSkeleton";
import { AppBadge } from "@/components/ui/app-badge";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getBracketLocationSportPriorities } from "@/domain/championship-brackets/championshipBracket.repository";
import type { BracketCourtSequenceUpdate, BracketLocationSportPriorityGroup, ChampionshipBracketCourtSequenceMode, ChampionshipBracketReconfigurationRequest } from "@/domain/championship-brackets/championshipBracket.types";
import { MATCH_NAIPE_LABELS, TEAM_DIVISION_LABELS } from "@/lib/championship";
import { AppBadgeTone, MatchNaipe, TeamDivision } from "@/lib/enums";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface Props {
  bracketEditionId: string;
  isEditable: boolean;
  usesDivisions: boolean;
  sportNameBySportId: Record<string, string>;
  naipeOptionsBySportId: Record<string, MatchNaipe[]>;
  divisionOptionsBySportId: Record<string, TeamDivision[]>;
  onRequestReconfiguration: (request: ChampionshipBracketReconfigurationRequest) => Promise<boolean>;
}

interface CourtSequenceDraft {
  sequence_mode: ChampionshipBracketCourtSequenceMode;
  preferred_naipe: MatchNaipe | null;
  preferred_division: TeamDivision | null;
}

interface ConsolidatedPriorityGroup {
  key: string;
  location_name: string;
  sport_id: string;
  occurrences: BracketLocationSportPriorityGroup[];
  availableNaipeOptions: MatchNaipe[];
  availableDivisionOptions: TeamDivision[];
}

function normalizeLocationName(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
}

function formatPriorityEventDate(value: string): string {
  const [, month, day] = value.split("-");
  return month && day ? `${day}/${month}` : value;
}

function formatDateCount(count: number): string {
  return `${count} ${count === 1 ? "data" : "datas"}`;
}

function resolveCourtSequenceModeLabel(mode: ChampionshipBracketCourtSequenceMode): string {
  if (mode === "GROUP_NAIPE") return "Agrupar por naipe";
  if (mode === "ALTERNATE_NAIPE") return "Alternar naipes";
  if (mode === "GROUP_DIVISION") return "Agrupar por divisão";
  return "Flexível";
}

function resolveCourtSequenceModeTone(mode: ChampionshipBracketCourtSequenceMode): AppBadgeTone {
  if (mode === "GROUP_NAIPE") return AppBadgeTone.PRIMARY;
  if (mode === "ALTERNATE_NAIPE") return AppBadgeTone.SKY;
  if (mode === "GROUP_DIVISION") return AppBadgeTone.AMBER;
  return AppBadgeTone.NEUTRAL;
}

function resolveCourtSequenceKey(params: { bracketDayId: string; bracketCourtId: string; sportId: string }): string {
  return [params.bracketDayId, params.bracketCourtId, params.sportId].join(":");
}

export function AdminChampionshipCourtPrioritySection({
  bracketEditionId, isEditable, usesDivisions, sportNameBySportId, naipeOptionsBySportId, divisionOptionsBySportId, onRequestReconfiguration,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [savingGroupKey, setSavingGroupKey] = useState<string | null>(null);
  const [priorityGroups, setPriorityGroups] = useState<BracketLocationSportPriorityGroup[]>([]);
  const [sequenceDraftByKey, setSequenceDraftByKey] = useState<Record<string, CourtSequenceDraft>>({});
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());

  const loadPriorityGroups = useCallback(async (options?: { preserveDrafts?: boolean }) => {
    setLoading(true);
    const { data, error } = await getBracketLocationSportPriorities(bracketEditionId);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setPriorityGroups(data);
    if (!options?.preserveDrafts) setSequenceDraftByKey({});
    setLoading(false);
  }, [bracketEditionId]);

  useEffect(() => { void loadPriorityGroups(); }, [loadPriorityGroups]);

  const groupedCards = useMemo<ConsolidatedPriorityGroup[]>(() => {
    const groups = new Map<string, Omit<ConsolidatedPriorityGroup, "availableNaipeOptions" | "availableDivisionOptions">>();
    priorityGroups.forEach((occurrence) => {
      const key = `${normalizeLocationName(occurrence.location_name)}:${occurrence.sport_id}`;
      const existing = groups.get(key);
      if (existing) existing.occurrences.push(occurrence);
      else groups.set(key, { key, location_name: occurrence.location_name, sport_id: occurrence.sport_id, occurrences: [occurrence] });
    });
    return [...groups.values()].map((group) => ({
      ...group,
      occurrences: [...group.occurrences].sort((left, right) => left.event_date.localeCompare(right.event_date)),
      availableNaipeOptions: naipeOptionsBySportId[group.sport_id] ?? [],
      availableDivisionOptions: divisionOptionsBySportId[group.sport_id] ?? [],
    })).sort((left, right) => {
      const byLocation = left.location_name.localeCompare(right.location_name, "pt-BR", { sensitivity: "base" });
      if (byLocation !== 0) return byLocation;
      return (sportNameBySportId[left.sport_id] ?? "").localeCompare(sportNameBySportId[right.sport_id] ?? "", "pt-BR", { sensitivity: "base" });
    });
  }, [divisionOptionsBySportId, naipeOptionsBySportId, priorityGroups, sportNameBySportId]);

  function resolveOccurrenceCourt(occurrence: BracketLocationSportPriorityGroup) {
    return occurrence.courts.find((court) => court.is_primary_sport) ?? occurrence.courts[0] ?? null;
  }
  function resolveOccurrenceSequenceKey(occurrence: BracketLocationSportPriorityGroup): string | null {
    const court = resolveOccurrenceCourt(occurrence);
    if (!court) return null;
    return resolveCourtSequenceKey({ bracketDayId: occurrence.bracket_day_id, bracketCourtId: court.bracket_court_id, sportId: occurrence.sport_id });
  }
  function resolveOccurrenceSequenceDraft(occurrence: BracketLocationSportPriorityGroup): CourtSequenceDraft | null {
    const court = resolveOccurrenceCourt(occurrence);
    const key = resolveOccurrenceSequenceKey(occurrence);
    if (!court || !key) return null;
    return sequenceDraftByKey[key] ?? { sequence_mode: court.sequence_mode, preferred_naipe: court.preferred_naipe, preferred_division: court.preferred_division };
  }
  function updateOccurrenceSequenceMode(group: ConsolidatedPriorityGroup, occurrence: BracketLocationSportPriorityGroup, sequenceMode: ChampionshipBracketCourtSequenceMode) {
    const key = resolveOccurrenceSequenceKey(occurrence);
    const currentDraft = resolveOccurrenceSequenceDraft(occurrence);
    if (!key || !currentDraft) return;
    let preferredNaipe = currentDraft.preferred_naipe;
    let preferredDivision = currentDraft.preferred_division;
    if (sequenceMode === "FLEXIBLE") { preferredNaipe = null; preferredDivision = null; }
    if (sequenceMode === "GROUP_NAIPE" || sequenceMode === "ALTERNATE_NAIPE") {
      if (preferredNaipe == null || !group.availableNaipeOptions.includes(preferredNaipe)) preferredNaipe = group.availableNaipeOptions[0] ?? null;
      preferredDivision = null;
    }
    if (sequenceMode === "GROUP_DIVISION") {
      if (preferredDivision == null || !group.availableDivisionOptions.includes(preferredDivision)) preferredDivision = group.availableDivisionOptions[0] ?? null;
      preferredNaipe = null;
    }
    setSequenceDraftByKey((previous) => ({ ...previous, [key]: { sequence_mode: sequenceMode, preferred_naipe: preferredNaipe, preferred_division: preferredDivision } }));
  }
  function updateOccurrencePreferredNaipe(occurrence: BracketLocationSportPriorityGroup, naipe: MatchNaipe) {
    const key = resolveOccurrenceSequenceKey(occurrence);
    const currentDraft = resolveOccurrenceSequenceDraft(occurrence);
    if (!key || !currentDraft) return;
    setSequenceDraftByKey((previous) => ({ ...previous, [key]: { ...currentDraft, preferred_naipe: naipe, preferred_division: null } }));
  }
  function updateOccurrencePreferredDivision(occurrence: BracketLocationSportPriorityGroup, division: TeamDivision) {
    const key = resolveOccurrenceSequenceKey(occurrence);
    const currentDraft = resolveOccurrenceSequenceDraft(occurrence);
    if (!key || !currentDraft) return;
    setSequenceDraftByKey((previous) => ({ ...previous, [key]: { ...currentDraft, preferred_naipe: null, preferred_division: division } }));
  }
  function hasOccurrenceSequenceChanges(occurrence: BracketLocationSportPriorityGroup): boolean {
    const court = resolveOccurrenceCourt(occurrence);
    const draft = resolveOccurrenceSequenceDraft(occurrence);
    return Boolean(court && draft && (draft.sequence_mode !== court.sequence_mode || draft.preferred_naipe !== court.preferred_naipe || draft.preferred_division !== court.preferred_division));
  }
  function hasPendingChanges(group: ConsolidatedPriorityGroup): boolean {
    return group.occurrences.some(hasOccurrenceSequenceChanges);
  }
  async function saveGroup(group: ConsolidatedPriorityGroup) {
    const sequenceUpdates: BracketCourtSequenceUpdate[] = [];
    const sequenceChanges: Array<{
      bracket_day_id: string;
      bracket_court_id: string;
      event_date: string;
      event_date_label: string;
      court_name: string;
      current_sequence_mode: ChampionshipBracketCourtSequenceMode;
      current_sequence_label: string;
      target_sequence_mode: ChampionshipBracketCourtSequenceMode;
      target_sequence_label: string;
    }> = [];
    const changedOccurrences: BracketLocationSportPriorityGroup[] = [];
    group.occurrences.forEach((occurrence) => {
      if (!hasOccurrenceSequenceChanges(occurrence)) return;
      const court = resolveOccurrenceCourt(occurrence);
      const draft = resolveOccurrenceSequenceDraft(occurrence);
      if (!court || !draft) return;
      sequenceUpdates.push({ bracket_court_id: court.bracket_court_id, sport_id: occurrence.sport_id, sequence_mode: draft.sequence_mode, preferred_naipe: draft.preferred_naipe, preferred_division: draft.preferred_division });
      const resolveSequenceDescription = (
        sequenceMode: ChampionshipBracketCourtSequenceMode,
        preferredNaipe: MatchNaipe | null,
        preferredDivision: TeamDivision | null,
      ): string => {
        const baseLabel = resolveCourtSequenceModeLabel(sequenceMode);

        if (sequenceMode === "GROUP_NAIPE" || sequenceMode === "ALTERNATE_NAIPE") {
          const naipeLabel = preferredNaipe != null
            ? MATCH_NAIPE_LABELS[preferredNaipe]
            : null;

          return naipeLabel
            ? `${baseLabel} • inicia em ${naipeLabel}`
            : baseLabel;
        }

        if (sequenceMode === "GROUP_DIVISION") {
          const divisionLabel = preferredDivision != null
            ? TEAM_DIVISION_LABELS[preferredDivision]
            : null;

          return divisionLabel
            ? `${baseLabel} • inicia em ${divisionLabel}`
            : baseLabel;
        }

        return baseLabel;
      };

      sequenceChanges.push({
        bracket_day_id: occurrence.bracket_day_id,
        bracket_court_id: court.bracket_court_id,
        event_date: occurrence.event_date,
        event_date_label: formatPriorityEventDate(occurrence.event_date),
        court_name: court.court_name,
        current_sequence_mode: court.sequence_mode,
        current_sequence_label: resolveSequenceDescription(
          court.sequence_mode,
          court.preferred_naipe,
          court.preferred_division,
        ),
        target_sequence_mode: draft.sequence_mode,
        target_sequence_label: resolveSequenceDescription(
          draft.sequence_mode,
          draft.preferred_naipe,
          draft.preferred_division,
        ),
      });
      changedOccurrences.push(occurrence);
    });
    if (sequenceUpdates.length === 0) return;
    const sportName = sportNameBySportId[group.sport_id] ?? "Modalidade";
    const eventDates = changedOccurrences.map((occurrence) => occurrence.event_date).sort();
    setSavingGroupKey(group.key);
    const previewCreated = await onRequestReconfiguration({ action: "COURT_SPORT_SEQUENCE", label: `Sequenciamento em ${group.location_name} • ${sportName}`, payload: { sequence_updates: sequenceUpdates, sequence_changes: sequenceChanges, location_name: group.location_name, sport_id: group.sport_id, sport_name: sportName, event_dates: eventDates, event_date_labels: eventDates.map(formatPriorityEventDate), occurrence_count: sequenceUpdates.length } });
    setSavingGroupKey(null);
    if (!previewCreated) return;
  }
  function toggleGroupExpanded(groupKey: string) {
    setExpandedGroupKeys((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
      return next;
    });
  }
  if (loading) return <AdminListSkeleton count={3} showActions />;
  if (groupedCards.length === 0) return <p className="py-2 text-sm text-muted-foreground">Nenhuma modalidade coletiva possui jogos agendados para configurar.</p>;

  return <div className="space-y-4">{groupedCards.map((group) => {
    const isSaving = savingGroupKey === group.key;
    const isExpanded = expandedGroupKeys.has(group.key);
    const pendingChangesCount = group.occurrences.filter(hasOccurrenceSequenceChanges).length;
    return <div key={group.key} className="glass-card overflow-hidden">
      <button type="button" className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/20" aria-expanded={isExpanded} onClick={() => toggleGroupExpanded(group.key)}>
        <div className="min-w-0 space-y-1"><div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold">{group.location_name} • {sportNameBySportId[group.sport_id] ?? "Modalidade"}</h4>{pendingChangesCount > 0 ? <AppBadge tone={AppBadgeTone.AMBER}>{pendingChangesCount === 1 ? "1 alteração pendente" : `${pendingChangesCount} alterações pendentes`}</AppBadge> : null}</div><p className="text-xs text-muted-foreground">{formatDateCount(group.occurrences.length)} {" • "} Configuração por quadra</p></div>
        {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
      {isExpanded ? <div className="space-y-4 border-t border-border/40 p-4">
        <p className="text-xs text-muted-foreground">Configure o sequenciamento da modalidade na quadra definida para cada data.</p>
        <div className="grid gap-3">{group.occurrences.map((occurrence) => {
          const court = resolveOccurrenceCourt(occurrence);
          const draft = resolveOccurrenceSequenceDraft(occurrence);
          if (!court || !draft) return null;
          const occurrenceChanged = hasOccurrenceSequenceChanges(occurrence);
          const sequenceOptions: Array<{ value: ChampionshipBracketCourtSequenceMode; label: string; helper: string }> = [
            ...(group.availableNaipeOptions.length > 0 ? [{ value: "GROUP_NAIPE" as const, label: "Agrupar por naipe", helper: "Mantém os jogos do mesmo naipe agrupados antes de avançar para o próximo." }] : []),
            ...(group.availableNaipeOptions.length > 1 ? [{ value: "ALTERNATE_NAIPE" as const, label: "Alternar naipes", helper: "Alterna entre os naipes nesta mesma quadra sempre que houver um jogo elegível." }] : []),
            ...(usesDivisions && group.availableDivisionOptions.length > 0 ? [{ value: "GROUP_DIVISION" as const, label: "Agrupar por divisão", helper: "Mantém os jogos da mesma divisão agrupados antes de avançar para a próxima." }] : []),
            { value: "FLEXIBLE" as const, label: "Flexível", helper: "Não força agrupamento nem alternância; a agenda usa a melhor combinação disponível." },
          ];
          return <div key={occurrence.bracket_day_id} className="app-card-muted space-y-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="space-y-0.5"><p className="text-sm font-semibold">{formatPriorityEventDate(occurrence.event_date)}</p><p className="text-xs text-muted-foreground">{court.court_name}</p></div><div className="flex flex-wrap items-center gap-2">{occurrenceChanged ? <AppBadge tone={AppBadgeTone.AMBER}>Alteração pendente</AppBadge> : null}<AppBadge tone={resolveCourtSequenceModeTone(draft.sequence_mode)}>{resolveCourtSequenceModeLabel(draft.sequence_mode)}</AppBadge></div></div>
            <RadioGroup value={draft.sequence_mode} disabled={!isEditable || savingGroupKey != null} onValueChange={(value) => updateOccurrenceSequenceMode(group, occurrence, value as ChampionshipBracketCourtSequenceMode)} className={`grid gap-2 ${sequenceOptions.length >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : sequenceOptions.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>{sequenceOptions.map((option) => <label key={option.value} className={`rounded-xl border border-border/60 p-3 transition-colors has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5 ${isEditable && savingGroupKey == null ? "cursor-pointer" : "cursor-default opacity-50"}`}><div className="flex items-start gap-3"><RadioGroupItem value={option.value} className="mt-0.5 disabled:cursor-default" /><span className="space-y-1"><span className="block text-sm font-medium">{option.label}</span><span className="block text-xs text-muted-foreground">{option.helper}</span></span></div></label>)}</RadioGroup>
            {(draft.sequence_mode === "GROUP_NAIPE" || draft.sequence_mode === "ALTERNATE_NAIPE") && group.availableNaipeOptions.length > 0 ? <div className="space-y-2"><p className="text-xs font-medium">Naipe inicial</p><RadioGroup value={draft.preferred_naipe ?? undefined} disabled={!isEditable || savingGroupKey != null} onValueChange={(value) => updateOccurrencePreferredNaipe(occurrence, value as MatchNaipe)} className="flex flex-wrap gap-2">{group.availableNaipeOptions.map((naipe) => <label key={naipe} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5"><RadioGroupItem value={naipe} />{MATCH_NAIPE_LABELS[naipe]}</label>)}</RadioGroup></div> : null}
            {draft.sequence_mode === "GROUP_DIVISION" && group.availableDivisionOptions.length > 0 ? <div className="space-y-2"><p className="text-xs font-medium">Divisão inicial</p><RadioGroup value={draft.preferred_division ?? undefined} disabled={!isEditable || savingGroupKey != null} onValueChange={(value) => updateOccurrencePreferredDivision(occurrence, value as TeamDivision)} className="flex flex-wrap gap-2">{group.availableDivisionOptions.map((division) => <label key={division} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5"><RadioGroupItem value={division} />{TEAM_DIVISION_LABELS[division]}</label>)}</RadioGroup></div> : null}
          </div>;
        })}</div>
        {isEditable ? <div className="flex justify-end"><Button type="button" size="sm" disabled={!hasPendingChanges(group) || savingGroupKey != null} onClick={() => void saveGroup(group)}>{isSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Salvar sequenciamento</Button></div> : null}
      </div> : null}
    </div>;
  })}</div>;
}
