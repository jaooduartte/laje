import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Loader2, CalendarClock, Trophy, LayoutGrid, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeInput } from "@/components/ui/time-input";
import {
  Tabs,
  TabsContent,
  TabsNavigationList,
  TabsNavigationTrigger,
} from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdminChampionshipQualificationSection } from "@/components/admin/AdminChampionshipQualificationSection";
import { AdminChampionshipCourtPrioritySection } from "@/components/admin/AdminChampionshipCourtPrioritySection";
import { AdminChampionshipKnockoutPrioritySection } from "@/components/admin/AdminChampionshipKnockoutPrioritySection";
import { useChampionshipIndividualEvents } from "@/hooks/useChampionshipIndividualEvents";
import {
  resolveDivisionOptionsBySportId,
  resolveNaipeOptionsBySportId,
} from "@/components/admin/adminCourtPriority.utils";
import { resolveIndividualSportIds } from "@/lib/individualEvents";
import { ChampionshipStatus } from "@/lib/enums";
import {
  applyChampionshipBracketReconfiguration,
  getBracketDaySchedules,
  previewChampionshipBracketReconfiguration,
  updateBracketGeneratedLocationGroup,
} from "@/domain/championship-brackets/championshipBracket.repository";
import type {
  BracketDayBreak,
  BracketDayBreakScopeType,
  BracketDayCourtOption,
  BracketDayLocationOption,
  BracketDaySchedule,
  BracketDayScheduleUpdate,
  BracketGeneratedLocationGroup,
  ChampionshipBracketReconfigurationPreview,
  ChampionshipBracketReconfigurationRequest,
} from "@/domain/championship-brackets/championshipBracket.types";
import type { ChampionshipBracketCompetition, Sport } from "@/lib/types";

interface Props {
  bracketEditionId: string;
  championshipId: string;
  seasonYear: number;
  sports: Sport[];
  canManageSchedule: boolean;
  championshipStatus: ChampionshipStatus;
  usesDivisions: boolean;
  competitions: ChampionshipBracketCompetition[];
  onRefetchMatches: () => void;
  onRefetchChampionshipBracket: () => void;
}

interface DayBreakDraft {
  localId: string;
  id: string | null;
  break_start_time: string;
  break_end_time: string;
  position: number;
  scope_type: BracketDayBreakScopeType;
  bracket_court_id: string | null;
}

interface DayScheduleDraft {
  id: string;
  event_date: string;
  start_time: string;
  end_time: string;
  breaks: DayBreakDraft[];
  courts: BracketDayCourtOption[];
  locations: BracketDayLocationOption[];
  saving: boolean;
}

type DayScheduleSnapshot = Omit<DayScheduleDraft, "saving">;

interface LocationGroupDraft extends BracketGeneratedLocationGroup {
  saving: boolean;
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function formatTime(time: string): string {
  return time.slice(0, 5);
}

function resolveDayBreakSummary(day: DayScheduleDraft): string[] {
  return day.breaks.flatMap((brk) => {
    if (!brk.break_start_time || !brk.break_end_time) return [];

    const period = `${formatTime(brk.break_start_time)} às ${formatTime(brk.break_end_time)}`;
    if (brk.scope_type !== "COURT") return [`Geral: ${period}`];

    const court = day.courts.find((currentCourt) => currentCourt.id === brk.bracket_court_id);
    return [`${court?.label ?? "Quadra"}: ${period}`];
  });
}

function validationError(day: DayScheduleDraft): string | null {
  if (!day.start_time || !day.end_time) {
    return "Horário de início e fim são obrigatórios.";
  }

  if (day.end_time <= day.start_time) {
    return "Horário de fim deve ser maior que o horário de início.";
  }

  for (const brk of day.breaks) {
    if (!brk.break_start_time || !brk.break_end_time) {
      return "Preencha início e fim de todos os intervalos.";
    }

    if (brk.break_end_time <= brk.break_start_time) {
      return "Fim do intervalo deve ser maior que o início.";
    }

    if (brk.break_start_time < day.start_time || brk.break_end_time > day.end_time) {
      return "Intervalos devem estar dentro da janela do dia.";
    }

    if (brk.scope_type === "COURT" && !brk.bracket_court_id) {
      return "Selecione a quadra dos intervalos específicos.";
    }
  }

  return null;
}

export function AdminChampionshipSchedule({
  bracketEditionId,
  championshipId,
  seasonYear,
  sports,
  canManageSchedule,
  championshipStatus,
  usesDivisions,
  competitions,
  onRefetchMatches,
  onRefetchChampionshipBracket,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<DayScheduleDraft[]>([]);
  const [locationGroups, setLocationGroups] = useState<LocationGroupDraft[]>([]);
  const [expandedDayIds, setExpandedDayIds] = useState<Set<string>>(new Set());
  const [editingLocationGroup, setEditingLocationGroup] = useState<LocationGroupDraft | null>(null);
  const [activeSection, setActiveSection] = useState("schedule");
  const [pendingReconfiguration, setPendingReconfiguration] = useState<ChampionshipBracketReconfigurationRequest | null>(null);
  const [reconfigurationPreview, setReconfigurationPreview] = useState<ChampionshipBracketReconfigurationPreview | null>(null);
  const [loadingReconfigurationPreview, setLoadingReconfigurationPreview] = useState(false);
  const [applyingReconfiguration, setApplyingReconfiguration] = useState(false);
  const savedDaysRef = useRef<DayScheduleSnapshot[]>([]);
  const savedLocationGroupsRef = useRef<Record<string, BracketGeneratedLocationGroup>>({});
  const individualSportIds = useMemo(() => resolveIndividualSportIds(sports), [sports]);
  const { events: individualEvents, sessions: individualSessions } = useChampionshipIndividualEvents({
    championshipId,
    seasonYear,
    sportIds: individualSportIds,
  });

  const isEditable = canManageSchedule && championshipStatus === ChampionshipStatus.REVIEW;

  const sportNameBySportId = useMemo(() => {
    return competitions.reduce<Record<string, string>>((carry, competition) => {
      carry[competition.sport_id] = competition.sport_name;
      return carry;
    }, {});
  }, [competitions]);

  const naipeOptionsBySportId = useMemo(() => {
    return resolveNaipeOptionsBySportId(competitions);
  }, [competitions]);

  const divisionOptionsBySportId = useMemo(() => {
    return resolveDivisionOptionsBySportId(competitions);
  }, [competitions]);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getBracketDaySchedules(bracketEditionId);

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const drafts = data.map((day: BracketDaySchedule) => ({
      id: day.id,
      event_date: day.event_date,
      start_time: day.start_time,
      end_time: day.end_time,
      breaks: day.breaks.map((brk: BracketDayBreak) => ({
        localId: brk.id,
        id: brk.id,
        break_start_time: brk.break_start_time,
        break_end_time: brk.break_end_time,
        position: brk.position,
        scope_type: brk.scope_type,
        bracket_court_id: brk.bracket_court_id,
      })),
      courts: day.courts,
      locations: day.locations,
      saving: false,
    }));

    const groupsById = new Map<string, BracketGeneratedLocationGroup>();
    data.forEach((day) => {
      day.locations.forEach((location) => {
        if (!groupsById.has(location.location_group_id)) {
          groupsById.set(location.location_group_id, {
            location_group_id: location.location_group_id,
            location_name: location.name,
            position: location.position,
            courts: location.courts.map((court) => ({
              court_group_id: court.court_group_id,
              court_name: court.name,
              position: court.position,
            })),
          });
          return;
        }

        const group = groupsById.get(location.location_group_id);
        if (!group) return;
        location.courts.forEach((court) => {
          if (group.courts.some((currentCourt) => currentCourt.court_group_id === court.court_group_id)) {
            return;
          }
          group.courts.push({
            court_group_id: court.court_group_id,
            court_name: court.name,
            position: court.position,
          });
        });
      });
    });
    const groups = [...groupsById.values()]
      .map((group) => ({
        ...group,
        courts: [...group.courts].sort((leftCourt, rightCourt) => leftCourt.position - rightCourt.position),
      }))
      .sort((leftGroup, rightGroup) => leftGroup.position - rightGroup.position);

    setDays(drafts);
    savedDaysRef.current = drafts.map(({ saving: _saving, ...rest }) => rest);
    setLocationGroups(groups.map((group) => ({ ...group, saving: false })));
    savedLocationGroupsRef.current = groups.reduce<Record<string, BracketGeneratedLocationGroup>>(
      (carry, group) => {
        carry[group.location_group_id] = group;
        return carry;
      },
      {},
    );
    setExpandedDayIds(new Set());

    setLoading(false);
  }, [bracketEditionId]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  async function requestReconfiguration(request: ChampionshipBracketReconfigurationRequest) {
    setPendingReconfiguration(request);
    setReconfigurationPreview(null);
    setLoadingReconfigurationPreview(true);
    const { data, error } = await previewChampionshipBracketReconfiguration(
      bracketEditionId,
      request.action,
      request.payload,
    );
    setLoadingReconfigurationPreview(false);

    if (error || !data) {
      toast.error(error?.message ?? "Não foi possível calcular o impacto da reprogramação.");
      setPendingReconfiguration(null);
      return false;
    }

    setReconfigurationPreview(data);
    return true;
  }

  function closeReconfigurationPreview() {
    if (applyingReconfiguration) return;
    setPendingReconfiguration(null);
    setReconfigurationPreview(null);
    setLocationGroups((previousGroups) =>
      previousGroups.map((group) => ({ ...group, saving: false })),
    );
  }

  async function applyReconfiguration() {
    if (!pendingReconfiguration || !reconfigurationPreview) return;
    setApplyingReconfiguration(true);
    const { error } = await applyChampionshipBracketReconfiguration(
      bracketEditionId,
      pendingReconfiguration.action,
      pendingReconfiguration.payload,
      reconfigurationPreview.revision,
    );
    setApplyingReconfiguration(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      reconfigurationPreview.affected_matches > 0
        ? `Reprogramação aplicada em ${reconfigurationPreview.affected_matches} jogo(s).`
        : "Configuração atualizada sem alterar jogos.",
    );
    closeReconfigurationPreview();
    await loadSchedules();
    onRefetchMatches();
    onRefetchChampionshipBracket();
  }

  function updateDay(dayId: string, patch: Partial<DayScheduleDraft>) {
    setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, ...patch } : d)));
  }

  function toggleDay(dayId: string) {
    setExpandedDayIds((previousIds) => {
      const nextIds = new Set(previousIds);
      if (nextIds.has(dayId)) {
        nextIds.delete(dayId);
      } else {
        nextIds.add(dayId);
      }
      return nextIds;
    });
  }

  function updateLocationGroup(
    locationGroupId: string,
    updater: (currentGroup: LocationGroupDraft) => LocationGroupDraft,
  ) {
    setLocationGroups((previousGroups) =>
      previousGroups.map((group) =>
        group.location_group_id === locationGroupId ? updater(group) : group,
      ),
    );
  }

  function isLocationGroupDirty(group: LocationGroupDraft): boolean {
    const savedGroup = savedLocationGroupsRef.current[group.location_group_id];
    if (!savedGroup) return false;
    if (group.location_name !== savedGroup.location_name) return true;
    if (group.courts.length !== savedGroup.courts.length) return true;

    return group.courts.some((court) => {
      const savedCourt = savedGroup.courts.find(
        (savedCourtItem) => savedCourtItem.court_group_id === court.court_group_id,
      );
      return !savedCourt || savedCourt.court_name !== court.court_name;
    });
  }

  async function saveLocationGroup(group: LocationGroupDraft) {
    updateLocationGroup(group.location_group_id, (currentGroup) => ({ ...currentGroup, saving: true }));

    const { error } = await updateBracketGeneratedLocationGroup(bracketEditionId, {
      location_group_id: group.location_group_id,
      location_name: group.location_name,
      courts: group.courts.map((court) => ({
        court_group_id: court.court_group_id,
        court_name: court.court_name,
      })),
    });

    if (error) {
      toast.error(error.message);
      updateLocationGroup(group.location_group_id, (currentGroup) => ({ ...currentGroup, saving: false }));
      return;
    }

    toast.success("Local e quadras atualizados.");
    await loadSchedules();
    onRefetchMatches();
    onRefetchChampionshipBracket();
  }

  function openLocationGroupEditor(group: LocationGroupDraft) {
    setEditingLocationGroup({
      ...group,
      courts: group.courts.map((court) => ({ ...court })),
    });
  }

  function updateEditingLocationGroup(
    updater: (group: LocationGroupDraft) => LocationGroupDraft,
  ) {
    setEditingLocationGroup((group) => (group ? updater(group) : group));
  }

  async function saveEditingLocationGroup() {
    if (!editingLocationGroup) return;

    setEditingLocationGroup(null);
    await saveLocationGroup(editingLocationGroup);
  }

  function addBreak(
    dayId: string,
    scopeType: BracketDayBreakScopeType = "ALL_COURTS",
    bracketCourtId: string | null = null,
  ) {
    setDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;
        const nextPosition = d.breaks.length > 0 ? Math.max(...d.breaks.map((b) => b.position)) + 1 : 1;
        return {
          ...d,
          breaks: [
            ...d.breaks,
            {
              localId: `new-${Date.now()}-${Math.random()}`,
              id: null,
              break_start_time: "",
              break_end_time: "",
              position: nextPosition,
              scope_type: scopeType,
              bracket_court_id: scopeType === "COURT" ? bracketCourtId : null,
            },
          ],
        };
      }),
    );
  }

  function removeBreak(dayId: string, localId: string) {
    setDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;
        const filtered = d.breaks.filter((b) => b.localId !== localId);
        return {
          ...d,
          breaks: filtered.map((b, idx) => ({ ...b, position: idx + 1 })),
        };
      }),
    );
  }

  function updateBreak(dayId: string, localId: string, patch: Partial<DayBreakDraft>) {
    setDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;

        const updated = d.breaks.map((b) => (b.localId === localId ? { ...b, ...patch } : b));

        const isCompletedStartTime =
          "break_start_time" in patch &&
          typeof patch.break_start_time === "string" &&
          /^\d{2}:\d{2}$/.test(patch.break_start_time);

        if (isCompletedStartTime && updated.length > 1) {
          const sorted = [...updated].sort((a, b) =>
            a.break_start_time.localeCompare(b.break_start_time),
          );
          return { ...d, breaks: sorted.map((b, idx) => ({ ...b, position: idx + 1 })) };
        }

        return { ...d, breaks: updated };
      }),
    );
  }

  function updateGeneralBreak(
    dayId: string,
    breakId: string | null,
    patch: Pick<DayBreakDraft, "break_start_time" | "break_end_time">,
  ) {
    if (breakId) {
      updateBreak(dayId, breakId, patch);
      return;
    }

    if (!patch.break_start_time && !patch.break_end_time) return;

    setDays((previousDays) =>
      previousDays.map((day) => {
        if (day.id !== dayId) return day;

        const nextPosition = day.breaks.length > 0 ? Math.max(...day.breaks.map((brk) => brk.position)) + 1 : 1;
        return {
          ...day,
          breaks: [
            ...day.breaks,
            {
              localId: `new-${Date.now()}-${Math.random()}`,
              id: null,
              break_start_time: patch.break_start_time,
              break_end_time: patch.break_end_time,
              position: nextPosition,
              scope_type: "ALL_COURTS",
              bracket_court_id: null,
            },
          ],
        };
      }),
    );
  }

  async function saveDay(day: DayScheduleDraft) {
    const error = validationError(day);
    if (error) {
      toast.error(error);
      return;
    }

    updateDay(day.id, { saving: true });

    const update: BracketDayScheduleUpdate = {
      date: day.event_date,
      start_time: day.start_time,
      end_time: day.end_time,
      breaks: day.breaks.map((b, idx) => ({
        break_start_time: b.break_start_time,
        break_end_time: b.break_end_time,
        position: idx + 1,
        scope_type: b.scope_type,
        bracket_court_id: b.scope_type === "COURT" ? b.bracket_court_id : null,
      })),
    };

    const previewCreated = await requestReconfiguration({
      action: "DAY_SCHEDULE",
      payload: { schedule_updates: [update] },
      label: `Horários de ${formatDate(day.event_date)}`,
    });

    if (!previewCreated) {
      updateDay(day.id, { saving: false });
      return;
    }
    updateDay(day.id, { saving: false });
  }

  function isDayDirty(day: DayScheduleDraft): boolean {
    const saved = savedDaysRef.current.find((s) => s.id === day.id);
    if (!saved) return false;
    if (day.start_time !== saved.start_time || day.end_time !== saved.end_time) return true;
    if (day.breaks.length !== saved.breaks.length) return true;

    const sort = (breaks: DayBreakDraft[]) =>
      [...breaks].sort((a, b) => a.break_start_time.localeCompare(b.break_start_time));

    return sort(day.breaks).some((brk, idx) => {
      const s = sort(saved.breaks)[idx];
      return (
        brk.break_start_time !== s.break_start_time ||
        brk.break_end_time !== s.break_end_time ||
        brk.scope_type !== s.scope_type ||
        brk.bracket_court_id !== s.bracket_court_id
      );
    });
  }

  const locationGroupById = useMemo(
    () => new Map(locationGroups.map((group) => [group.location_group_id, group])),
    [locationGroups],
  );

  return (
    <div className="space-y-6">
      {!isEditable ? (
        <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950 dark:text-amber-100">
          Somente leitura: a reprogramação só pode ser feita com o campeonato em "Em revisão".
        </div>
      ) : null}

      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsNavigationList className="h-auto w-full justify-start">
          <TabsNavigationTrigger value="schedule" className="px-3 py-2.5 sm:px-4">
            Agenda
          </TabsNavigationTrigger>
          <TabsNavigationTrigger value="sessions" className="px-3 py-2.5 sm:px-4">
            Sessões individuais
          </TabsNavigationTrigger>
          <TabsNavigationTrigger value="qualification" className="px-3 py-2.5 sm:px-4">
            Classificação para o mata-mata
          </TabsNavigationTrigger>
          <TabsNavigationTrigger value="court-priorities" className="px-3 py-2.5 sm:px-4">
            Prioridades de quadra
          </TabsNavigationTrigger>
          <TabsNavigationTrigger value="knockout-priorities" className="px-3 py-2.5 sm:px-4">
            Prioridades do mata-mata
          </TabsNavigationTrigger>
        </TabsNavigationList>

      <TabsContent value="schedule" className="mt-6">
      <section className="space-y-4">

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : days.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Nenhum dia configurado na agenda deste campeonato.
          </p>
        ) : (
          <div className="glass-card space-y-6 p-4 sm:p-6">
            <div className="border-b border-border/50 pb-4">
              <p className="text-lg font-bold">Dias da agenda</p>
              <p className="text-sm text-muted-foreground">
                Cada dia reúne horários, intervalos, locais e quadras definidos na configuração inicial.
              </p>
            </div>

            <div className="space-y-4">
              {days.map((day, index) => {
                const isExpanded = expandedDayIds.has(day.id);
                const dayContentId = `reprogram-schedule-day-${day.id}`;
                const breakSummary = resolveDayBreakSummary(day);
                const generalBreaks = day.breaks.filter((brk) => brk.scope_type !== "COURT");

                return (
                  <div key={day.id} className="overflow-hidden rounded-xl border border-border/50 bg-background/30">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={dayContentId}
                      aria-label={`${isExpanded ? "Recolher" : "Expandir"} Dia ${index + 1}`}
                      onClick={() => toggleDay(day.id)}
                      className="flex w-full items-center justify-between gap-4 border-b border-border/40 bg-background/40 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold">Dia {index + 1}</span>
                        <span className="block text-sm text-muted-foreground">
                          {formatDate(day.event_date)} • {formatTime(day.start_time)} às {formatTime(day.end_time)}
                        </span>
                        {!isExpanded && breakSummary.length > 0 ? (
                          <span className="mt-1 block break-words text-xs text-muted-foreground">
                            Intervalos: {breakSummary.join(" • ")}
                          </span>
                        ) : null}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>

                    {isExpanded ? (
                      <div id={dayContentId} className="grid items-stretch gap-6 p-4 xl:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
                        <div className="flex flex-col">
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <Label htmlFor={`start-${day.id}`} className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Início
                              </Label>
                              <TimeInput
                                id={`start-${day.id}`}
                                value={formatTime(day.start_time)}
                                disabled={!isEditable || day.saving}
                                onChange={(value) => updateDay(day.id, { start_time: value })}
                                className="h-10 border-border/40 bg-background/50"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`end-${day.id}`} className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Fim
                              </Label>
                              <TimeInput
                                id={`end-${day.id}`}
                                value={formatTime(day.end_time)}
                                disabled={!isEditable || day.saving}
                                onChange={(value) => updateDay(day.id, { end_time: value })}
                                className="h-10 border-border/40 bg-background/50"
                              />
                            </div>
                          </div>

                          <div className="space-y-4 pt-5">
                            {(generalBreaks.length > 0 ? generalBreaks : [null]).map((brk, breakIndex) => (
                              <div key={brk?.localId ?? `empty-general-break-${day.id}`} className="space-y-4">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    {breakIndex === 0 ? "Intervalo do dia" : `Intervalo do dia ${breakIndex + 1}`}
                                  </p>
                                  {isEditable && brk ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      disabled={day.saving}
                                      aria-label={`Remover intervalo do dia ${breakIndex + 1}`}
                                      className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      onClick={() => removeBreak(day.id, brk.localId)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  ) : null}
                                </div>
                                <div className="space-y-1.5">
                                  <Label htmlFor={`break-start-${brk?.localId ?? `empty-general-break-${day.id}`}`} className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    Início do intervalo
                                  </Label>
                                  <TimeInput
                                    id={`break-start-${brk?.localId ?? `empty-general-break-${day.id}`}`}
                                    value={brk?.break_start_time ?? ""}
                                    disabled={!isEditable || day.saving}
                                    onChange={(value) => updateGeneralBreak(day.id, brk?.localId ?? null, { break_start_time: value, break_end_time: brk?.break_end_time ?? "" })}
                                    className="h-10 border-border/40 bg-background/50"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label htmlFor={`break-end-${brk?.localId ?? `empty-general-break-${day.id}`}`} className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    Fim do intervalo
                                  </Label>
                                  <TimeInput
                                    id={`break-end-${brk?.localId ?? `empty-general-break-${day.id}`}`}
                                    value={brk?.break_end_time ?? ""}
                                    disabled={!isEditable || day.saving}
                                    onChange={(value) => updateGeneralBreak(day.id, brk?.localId ?? null, { break_start_time: brk?.break_start_time ?? "", break_end_time: value })}
                                    className="h-10 border-border/40 bg-background/50"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>

                          {isEditable ? (
                            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-5">
                              <Button type="button" size="sm" className="w-full" disabled={day.saving || !isDayDirty(day)} onClick={() => saveDay(day)}>
                                {day.saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                                Salvar dia
                              </Button>
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-3 border-t border-border/30 pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Locais do dia</Label>
                            <p className="text-xs text-muted-foreground">Os nomes valem para toda a edição.</p>
                          </div>
                          {day.locations.map((location) => {
                            const group = locationGroupById.get(location.location_group_id);
                            if (!group) return null;

                            return (
                              <div key={location.id} className="space-y-4 rounded-lg border border-border/30 bg-background/40 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nome do local</p>
                                    <p className="font-medium">{group.location_name}</p>
                                  </div>
                                  {isEditable ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      disabled={group.saving}
                                      aria-label={`Editar ${group.location_name}`}
                                      title="Editar local e quadras"
                                      onClick={() => openLocationGroupEditor(group)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  ) : null}
                                </div>
                                <div className="space-y-3">
                                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quadras desse local</p>
                                  <div className="grid grid-cols-1 gap-3 border-t border-border/30 pt-3 md:grid-cols-2 xl:grid-cols-3">
                                  {location.courts.map((dayCourt) => {
                                    const court = group.courts.find(
                                      (currentCourt) => currentCourt.court_group_id === dayCourt.court_group_id,
                                    );
                                    if (!court) return null;
                                    const courtBreaks = day.breaks.filter(
                                      (brk) => brk.scope_type === "COURT" && brk.bracket_court_id === dayCourt.id,
                                    );

                                    return (
                                      <div key={court.court_group_id} className="space-y-3 rounded-lg border border-border/20 bg-background/30 p-3">
                                        <div className="space-y-1">
                                          <p className="text-xs font-medium text-muted-foreground">Quadra {court.position}</p>
                                          <p className="font-medium">{court.court_name}</p>
                                        </div>

                                        <div className="space-y-3 border-t border-border/30 pt-3">
                                          <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Intervalos da quadra</p>
                                            {isEditable ? (
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                disabled={day.saving}
                                                aria-label={`Adicionar intervalo à ${court.court_name}`}
                                                className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                onClick={() => addBreak(day.id, "COURT", dayCourt.id)}
                                              >
                                                <Plus className="h-4 w-4" />
                                              </Button>
                                            ) : null}
                                          </div>

                                          {courtBreaks.length === 0 ? (
                                            <p className="rounded-md border border-dashed border-border/30 px-3 py-2 text-[11px] italic text-muted-foreground">
                                              Nenhum intervalo específico nesta quadra neste dia.
                                            </p>
                                          ) : (
                                            courtBreaks.map((brk, breakIndex) => (
                                              <div key={brk.localId} className="rounded-md border border-border/20 bg-background/50 p-3">
                                                <div className="flex items-start gap-2">
                                                  <div className="min-w-0 flex-1 space-y-3">
                                                    <div className="space-y-1.5">
                                                      <Label htmlFor={`court-break-start-${brk.localId}`} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                        Início do intervalo
                                                      </Label>
                                                      <TimeInput
                                                        id={`court-break-start-${brk.localId}`}
                                                        value={brk.break_start_time}
                                                        disabled={!isEditable || day.saving}
                                                        onChange={(value) => updateBreak(day.id, brk.localId, { break_start_time: value })}
                                                        className="h-10 border-border/40 bg-background/50"
                                                      />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                      <Label htmlFor={`court-break-end-${brk.localId}`} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                        Fim do intervalo
                                                      </Label>
                                                      <TimeInput
                                                        id={`court-break-end-${brk.localId}`}
                                                        value={brk.break_end_time}
                                                        disabled={!isEditable || day.saving}
                                                        onChange={(value) => updateBreak(day.id, brk.localId, { break_end_time: value })}
                                                        className="h-10 border-border/40 bg-background/50"
                                                      />
                                                    </div>
                                                  </div>
                                                  {isEditable ? (
                                                    <Button
                                                      type="button"
                                                      variant="ghost"
                                                      size="icon"
                                                      disabled={day.saving}
                                                      aria-label={`Remover intervalo ${breakIndex + 1} da ${court.court_name}`}
                                                      className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                      onClick={() => removeBreak(day.id, brk.localId)}
                                                    >
                                                      <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                  ) : null}
                                                </div>
                                              </div>
                                            ))
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
      </TabsContent>

      <TabsContent value="sessions" className="mt-6">
      {individualSessions.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Sessões individuais agendadas
            </h3>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {individualSessions.map((session) => (
              <div key={session.id} className="glass-card space-y-2 p-4">
                <div>
                  <p className="font-medium">{session.sports?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {session.naipe}
                  </p>
                </div>
                <p className="text-sm">
                  {session.scheduled_date ? formatDate(session.scheduled_date) : "Sem data"}
                  {session.period ? ` • ${session.period == "MATUTINO" ? "Matutino" : "Vespertino"}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {session.location_name ?? "Local a definir"}
                  {session.court_name ? ` • ${session.court_name}` : ""}
                </p>
                {individualEvents.some((event) => event.session_id == session.id) ? (
                  <p className="text-[11px] text-muted-foreground">
                    {individualEvents.filter((event) => event.session_id == session.id).length} provas vinculadas
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {individualSessions.length === 0 ? <p className="py-2 text-sm text-muted-foreground">Nenhuma sessão individual agendada.</p> : null}
      </TabsContent>

      <TabsContent value="qualification" className="mt-6"><section className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Classificação para o mata-mata
          </h3>
        </div>

        <AdminChampionshipQualificationSection
          competitions={competitions}
          isEditable={isEditable}
          onRequestReconfiguration={requestReconfiguration}
        />
      </section>
      </TabsContent>

      <TabsContent value="court-priorities" className="mt-6"><section className="space-y-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Prioridade de quadras
          </h3>
        </div>

        <AdminChampionshipCourtPrioritySection
          bracketEditionId={bracketEditionId}
          isEditable={isEditable}
          usesDivisions={usesDivisions}
          sportNameBySportId={sportNameBySportId}
          naipeOptionsBySportId={naipeOptionsBySportId}
          divisionOptionsBySportId={divisionOptionsBySportId}
          onRequestReconfiguration={requestReconfiguration}
        />
      </section>
      </TabsContent>

      <TabsContent value="knockout-priorities" className="mt-6"><section className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Prioridade do mata-mata
          </h3>
        </div>

        <AdminChampionshipKnockoutPrioritySection
          bracketEditionId={bracketEditionId}
          isEditable={isEditable}
          sportNameBySportId={sportNameBySportId}
          onRequestReconfiguration={requestReconfiguration}
        />
      </section>
      </TabsContent>

      </Tabs>

      <Dialog open={editingLocationGroup != null} onOpenChange={(open) => !open && setEditingLocationGroup(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar local e quadras</DialogTitle>
            <DialogDescription>
              Os nomes atualizados serão aplicados a todos os dias desta edição que usam este local.
            </DialogDescription>
          </DialogHeader>
          {editingLocationGroup ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="editing-location-name">Nome do local</Label>
                <Input
                  id="editing-location-name"
                  value={editingLocationGroup.location_name}
                  onChange={(event) => updateEditingLocationGroup((group) => ({ ...group, location_name: event.target.value }))}
                  className="app-input-field"
                />
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold">Quadras deste local</p>
                  <p className="text-xs text-muted-foreground">Os nomes também serão replicados nos demais dias desta edição.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {editingLocationGroup.courts.map((court) => (
                    <div key={court.court_group_id} className="space-y-1.5 rounded-lg border border-border/30 bg-background/40 p-3">
                      <Label htmlFor={`editing-court-${court.court_group_id}`}>Quadra {court.position}</Label>
                      <Input
                        id={`editing-court-${court.court_group_id}`}
                        value={court.court_name}
                        onChange={(event) => updateEditingLocationGroup((group) => ({
                          ...group,
                          courts: group.courts.map((currentCourt) => currentCourt.court_group_id === court.court_group_id ? { ...currentCourt, court_name: event.target.value } : currentCourt),
                        }))}
                        className="app-input-field"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingLocationGroup(null)}>Cancelar</Button>
                <Button type="button" disabled={!isLocationGroupDirty(editingLocationGroup)} onClick={saveEditingLocationGroup}>
                  Salvar local e quadras
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={pendingReconfiguration != null} onOpenChange={(open) => !open && closeReconfigurationPreview()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirmar reprogramação</DialogTitle>
            <DialogDescription>
              {pendingReconfiguration?.label ?? "Calculando o impacto da alteração"}
            </DialogDescription>
          </DialogHeader>
          {loadingReconfigurationPreview ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Calculando os jogos afetados…</div>
          ) : reconfigurationPreview ? (
            <div className="max-h-[50vh] space-y-3 overflow-y-auto text-sm">
              <p><strong>{reconfigurationPreview.affected_matches}</strong> jogo(s) terão data, horário, local, quadra ou posição alterados.</p>
              {reconfigurationPreview.blockers.length > 0 ? <ul className="list-disc space-y-1 pl-5 text-destructive">{reconfigurationPreview.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : null}
              {reconfigurationPreview.changes.length > 0 ? <div className="space-y-2">{reconfigurationPreview.changes.map((change) => <div key={change.match_id} className="rounded-md border p-3"><strong>{change.match_number != null ? `Jogo ${change.match_number}` : `Jogo ${change.match_id.slice(0, 8)}`}</strong><p className="text-xs text-muted-foreground">Alterações: {change.changed_fields.join(", ")}</p></div>)}</div> : <p className="text-muted-foreground">Nenhum jogo será movido.</p>}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeReconfigurationPreview} disabled={applyingReconfiguration}>Cancelar</Button>
            <Button type="button" onClick={applyReconfiguration} disabled={!reconfigurationPreview || reconfigurationPreview.blockers.length > 0 || applyingReconfiguration}>
              {applyingReconfiguration ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Aplicar e redistribuir {reconfigurationPreview?.affected_matches ?? 0} jogos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
