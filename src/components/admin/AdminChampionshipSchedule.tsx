import { AdminListSkeleton } from "@/components/skeletons/AdminListSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { CardListSkeleton } from "@/components/skeletons/CardListSkeleton";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  CalendarClock,
  Trophy,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
  Pencil,
  RotateCcw,
  ArrowDownUp,
  LockKeyhole,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeInput } from "@/components/ui/time-input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsNavigationList,
  TabsNavigationTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  groupReverseMatchOrderChangesByCourt,
  resolveReverseMatchOrderCourtPosition,
  resolveReverseMatchOrderCourtIds,
} from "@/components/admin/adminChampionshipSchedule.utils";
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
import type {
  ChampionshipBracketCompetition,
  ChampionshipIndividualSession,
  Sport,
} from "@/lib/types";

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

interface IndividualSessionEditDraft {
  scheduledDate: string;
  startTime: string;
  endTime: string;
  locationGroupId: string;
  courtGroupId: string;
  exclusiveLockEnabled: boolean;
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function formatTime(time: string): string {
  return time.slice(0, 5);
}

function formatReconfigurationDateTime(
  snapshot: Record<string, unknown>,
): string {
  const scheduledDate =
    typeof snapshot.scheduled_date === "string"
      ? formatDate(snapshot.scheduled_date)
      : "Sem data";
  const startTime =
    typeof snapshot.start_time === "string"
      ? new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(snapshot.start_time))
      : "Sem horário";
  return `${scheduledDate} • ${startTime}`;
}

function resolveReconfigurationSnapshotText(
  snapshot: Record<string, unknown>,
  field: string,
): string | null {
  const value = snapshot[field];
  return typeof value === "string" && value.trim() ? value : null;
}

function formatNaipe(naipe: string | null): string {
  if (!naipe) return "Naipe não informado";

  return (
    {
      MASCULINO: "Masculino",
      FEMININO: "Feminino",
      MISTO: "Misto",
    }[naipe] ?? naipe
  );
}

function formatSessionPreviewDate(value: unknown): string {
  return typeof value == "string" && value ? formatDate(value) : "Sem data";
}

function formatSessionPreviewTimeRange(
  startTime: unknown,
  endTime: unknown,
): string {
  if (
    typeof startTime != "string" ||
    typeof endTime != "string" ||
    !startTime ||
    !endTime
  ) {
    return "Sem horário";
  }

  return `${formatTime(startTime)} às ${formatTime(endTime)}`;
}

function formatReverseMatchOrderDetails(snapshot: Record<string, unknown>) {
  const sport =
    resolveReconfigurationSnapshotText(snapshot, "sport_name") ??
    "Modalidade não informada";
  const naipe = formatNaipe(
    resolveReconfigurationSnapshotText(snapshot, "naipe"),
  );
  const homeTeam =
    resolveReconfigurationSnapshotText(snapshot, "home_team_name") ??
    "Atlética a definir";
  const awayTeam =
    resolveReconfigurationSnapshotText(snapshot, "away_team_name") ??
    "Atlética a definir";

  return { sport, naipe, teams: `${homeTeam} × ${awayTeam}` };
}

function resolveDayBreakSummary(day: DayScheduleDraft): string[] {
  return day.breaks.flatMap((brk) => {
    if (!brk.break_start_time || !brk.break_end_time) return [];

    const period = `${formatTime(brk.break_start_time)} às ${formatTime(brk.break_end_time)}`;
    if (brk.scope_type !== "COURT") return [`Geral: ${period}`];

    const court = day.courts.find(
      (currentCourt) => currentCourt.id === brk.bracket_court_id,
    );
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

    if (
      brk.break_start_time < day.start_time ||
      brk.break_end_time > day.end_time
    ) {
      return "Intervalos devem estar dentro da janela do dia.";
    }

    if (brk.scope_type === "COURT" && !brk.bracket_court_id) {
      return "Selecione a quadra dos intervalos específicos.";
    }
  }

  return null;
}

function ScheduleSectionSkeleton() {
  return (
    <section className="enter-section space-y-4">
      <div className="glass-card space-y-4 p-4 sm:p-6">
        <div className="space-y-2">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-4 w-full max-w-3xl" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)_auto] lg:items-end">
          <div className="space-y-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>

          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>

          <Skeleton className="h-10 w-36 rounded-xl" />
        </div>
      </div>

      <div className="glass-card space-y-6 p-4 sm:p-6">
        <div className="space-y-2 border-b border-border/50 pb-4">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-full max-w-2xl" />
        </div>

        <AdminListSkeleton count={4} showActions={false} />
      </div>
    </section>
  );
}

function QualificationSectionSkeleton() {
  return (
    <section className="enter-section space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-4 w-60" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`qualification-skeleton-${index}`}
            className="glass-card overflow-hidden"
          >
            <div className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Skeleton className="h-5 w-44" />

                  {index == 1 ? (
                    <Skeleton className="h-5 w-36 rounded-full" />
                  ) : null}
                </div>

                <Skeleton className="h-4 w-full max-w-md" />
              </div>

              <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
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
  const [locationGroups, setLocationGroups] = useState<LocationGroupDraft[]>(
    [],
  );
  const [expandedDayIds, setExpandedDayIds] = useState<Set<string>>(new Set());
  const [editingLocationGroup, setEditingLocationGroup] =
    useState<LocationGroupDraft | null>(null);
  const [editingIndividualSession, setEditingIndividualSession] =
    useState<ChampionshipIndividualSession | null>(null);

  const [individualSessionEditDraft, setIndividualSessionEditDraft] =
    useState<IndividualSessionEditDraft | null>(null);
  const [activeSection, setActiveSection] = useState("schedule");
  const [pendingReconfiguration, setPendingReconfiguration] =
    useState<ChampionshipBracketReconfigurationRequest | null>(null);
  const [reconfigurationPreview, setReconfigurationPreview] =
    useState<ChampionshipBracketReconfigurationPreview | null>(null);
  const [loadingReconfigurationPreview, setLoadingReconfigurationPreview] =
    useState(false);
  const [applyingReconfiguration, setApplyingReconfiguration] = useState(false);
  const [reverseMatchOrderDate, setReverseMatchOrderDate] = useState("");
  const [reverseMatchOrderCourtIds, setReverseMatchOrderCourtIds] = useState<
    string[]
  >([]);
  const reconfigurationTriggerRef = useRef<HTMLElement | null>(null);
  const savedDaysRef = useRef<DayScheduleSnapshot[]>([]);
  const savedLocationGroupsRef = useRef<
    Record<string, BracketGeneratedLocationGroup>
  >({});
  const individualSportIds = useMemo(
    () => resolveIndividualSportIds(sports),
    [sports],
  );
  const {
    events: individualEvents,
    sessions: individualSessions,
    loading: individualEventsLoading,
    refetch: refetchIndividualEvents,
  } = useChampionshipIndividualEvents({
    championshipId,
    seasonYear,
    sportIds: individualSportIds,
    enabled: activeSection == "sessions",
  });

  const isEditable =
    canManageSchedule && championshipStatus === ChampionshipStatus.REVIEW;

  function openIndividualSessionEditor(session: ChampionshipIndividualSession) {
    const sessionDay =
      days.find((day) => day.event_date == session.scheduled_date) ?? null;

    const sessionLocation =
      sessionDay?.locations.find(
        (location) =>
          location.location_group_id == session.location_key ||
          location.name == session.location_name,
      ) ?? null;

    const sessionCourt =
      sessionLocation?.courts.find(
        (court) =>
          court.court_group_id == session.court_key ||
          court.name == session.court_name,
      ) ?? null;

    setEditingIndividualSession(session);

    setIndividualSessionEditDraft({
      scheduledDate: session.scheduled_date ?? "",
      startTime: session.start_time ? formatTime(session.start_time) : "",
      endTime: session.end_time ? formatTime(session.end_time) : "",
      locationGroupId: sessionLocation?.location_group_id ?? "",
      courtGroupId: sessionCourt?.court_group_id ?? "",
      exclusiveLockEnabled: session.exclusive_lock_enabled,
    });
  }

  function closeIndividualSessionEditor() {
    setEditingIndividualSession(null);
    setIndividualSessionEditDraft(null);
  }

  async function requestIndividualSessionReconfiguration() {
    if (!editingIndividualSession || !individualSessionEditDraft) {
      return;
    }

    const {
      scheduledDate,
      startTime,
      endTime,
      locationGroupId,
      courtGroupId,
      exclusiveLockEnabled,
    } = individualSessionEditDraft;

    if (
      !scheduledDate ||
      !startTime ||
      !endTime ||
      !locationGroupId ||
      !courtGroupId
    ) {
      toast.error("Preencha data, horário, local e quadra da sessão.");
      return;
    }

    if (endTime <= startTime) {
      toast.error("O horário final deve ser maior que o horário inicial.");
      return;
    }

    const selectedLocation =
      individualSessionEditLocations.find(
        (location) => location.location_group_id == locationGroupId,
      ) ?? null;

    const selectedCourt =
      selectedLocation?.courts.find(
        (court) => court.court_group_id == courtGroupId,
      ) ?? null;

    if (!selectedLocation || !selectedCourt) {
      toast.error(
        "Não foi possível localizar o local ou a quadra selecionada.",
      );
      return;
    }

    const hasIndividualSessionChanges =
      editingIndividualSession.scheduled_date != scheduledDate ||
      formatTime(editingIndividualSession.start_time ?? "") != startTime ||
      formatTime(editingIndividualSession.end_time ?? "") != endTime ||
      editingIndividualSession.location_key != locationGroupId ||
      editingIndividualSession.court_key != courtGroupId ||
      editingIndividualSession.exclusive_lock_enabled != exclusiveLockEnabled;

    if (!hasIndividualSessionChanges) {
      toast.info("Nenhuma alteração foi feita nesta sessão.");
      return;
    }

    const previewOpened = await requestReconfiguration({
      action: "INDIVIDUAL_SESSION",
      payload: {
        session_id: editingIndividualSession.id,

        scheduled_date: scheduledDate,
        start_time: startTime,
        end_time: endTime,
        location_group_id: locationGroupId,
        court_group_id: courtGroupId,
        exclusive_lock_enabled: exclusiveLockEnabled,

        session_sport_name:
          editingIndividualSession.sports?.name ?? "Modalidade individual",
        session_naipe: editingIndividualSession.naipe,

        current_scheduled_date: editingIndividualSession.scheduled_date,
        current_start_time: editingIndividualSession.start_time,
        current_end_time: editingIndividualSession.end_time,
        current_location_name: editingIndividualSession.location_name,
        current_court_name: editingIndividualSession.court_name,
        current_exclusive_lock_enabled:
          editingIndividualSession.exclusive_lock_enabled,

        target_location_name: selectedLocation.name,
        target_court_name: selectedCourt.name,
      },
      label: `Reprogramar sessão de ${
        editingIndividualSession.sports?.name ?? "modalidade individual"
      }`,
    });

    if (previewOpened) {
      closeIndividualSessionEditor();
    }
  }

  const individualSessionEditDay = individualSessionEditDraft?.scheduledDate
    ? (days.find(
        (day) => day.event_date == individualSessionEditDraft.scheduledDate,
      ) ?? null)
    : null;

  const individualSessionEditLocations =
    individualSessionEditDay?.locations ?? [];

  const individualSessionEditLocation =
    individualSessionEditDraft?.locationGroupId
      ? (individualSessionEditLocations.find(
          (location) =>
            location.location_group_id ==
            individualSessionEditDraft.locationGroupId,
        ) ?? null)
      : null;

  const individualSessionEditCourts =
    individualSessionEditLocation?.courts ?? [];

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
          if (
            group.courts.some(
              (currentCourt) =>
                currentCourt.court_group_id === court.court_group_id,
            )
          ) {
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
        courts: [...group.courts].sort(
          (leftCourt, rightCourt) => leftCourt.position - rightCourt.position,
        ),
      }))
      .sort(
        (leftGroup, rightGroup) => leftGroup.position - rightGroup.position,
      );

    const firstScheduledDate = drafts[0]?.event_date ?? "";
    setDays(drafts);
    setReverseMatchOrderDate(firstScheduledDate);
    setReverseMatchOrderCourtIds(
      resolveReverseMatchOrderCourtIds(drafts, firstScheduledDate),
    );
    savedDaysRef.current = drafts.map(({ saving: _saving, ...rest }) => rest);
    setLocationGroups(groups.map((group) => ({ ...group, saving: false })));
    savedLocationGroupsRef.current = groups.reduce<
      Record<string, BracketGeneratedLocationGroup>
    >((carry, group) => {
      carry[group.location_group_id] = group;
      return carry;
    }, {});
    setExpandedDayIds(new Set());

    setLoading(false);
  }, [bracketEditionId]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  async function requestReconfiguration(
    request: ChampionshipBracketReconfigurationRequest,
  ) {
    reconfigurationTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
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
      toast.error(
        error?.message ??
          "Não foi possível calcular o impacto da reprogramação.",
      );
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
    const appliedAction = pendingReconfiguration.action;
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
      appliedAction == "INDIVIDUAL_SESSION"
        ? "Sessão individual reprogramada."
        : appliedAction == "COMPETITION_SETTINGS"
          ? reconfigurationPreview.affected_matches > 0
            ? `Configuração atualizada e ${reconfigurationPreview.affected_matches} jogo(s) redistribuído(s).`
            : "Configuração da competição atualizada."
          : appliedAction == "COURT_SPORT_SEQUENCE"
            ? reconfigurationPreview.affected_matches > 0
              ? `Sequenciamento atualizado e ${reconfigurationPreview.affected_matches} jogo(s) redistribuído(s).`
              : "Sequenciamento de quadra atualizado."
            : appliedAction == "KNOCKOUT_COURT_PRIORITIES"
              ? reconfigurationPreview.affected_matches > 0
                ? `Prioridades do mata-mata atualizadas e ${reconfigurationPreview.affected_matches} jogo(s) redistribuído(s).`
                : "Prioridades do mata-mata atualizadas."
          : appliedAction == "LOCATION_SPORT_PRIORITIES"
            ? reconfigurationPreview.affected_matches > 0
              ? `Prioridades atualizadas e ${reconfigurationPreview.affected_matches} jogo(s) redistribuído(s).`
              : "Prioridades de quadra atualizadas."
          : reconfigurationPreview.affected_matches > 0
            ? `Reprogramação aplicada em ${reconfigurationPreview.affected_matches} jogo(s).`
            : "Configuração atualizada sem alterar jogos.",
    );
    closeReconfigurationPreview();

    await loadSchedules();

    if (appliedAction == "INDIVIDUAL_SESSION") {
      await refetchIndividualEvents();
    }

    onRefetchMatches();
    onRefetchChampionshipBracket();
  }

  function updateDay(dayId: string, patch: Partial<DayScheduleDraft>) {
    setDays((prev) =>
      prev.map((d) => (d.id === dayId ? { ...d, ...patch } : d)),
    );
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
        (savedCourtItem) =>
          savedCourtItem.court_group_id === court.court_group_id,
      );
      return !savedCourt || savedCourt.court_name !== court.court_name;
    });
  }

  async function saveLocationGroup(group: LocationGroupDraft) {
    updateLocationGroup(group.location_group_id, (currentGroup) => ({
      ...currentGroup,
      saving: true,
    }));

    const { error } = await updateBracketGeneratedLocationGroup(
      bracketEditionId,
      {
        location_group_id: group.location_group_id,
        location_name: group.location_name,
        courts: group.courts.map((court) => ({
          court_group_id: court.court_group_id,
          court_name: court.court_name,
        })),
      },
    );

    if (error) {
      toast.error(error.message);
      updateLocationGroup(group.location_group_id, (currentGroup) => ({
        ...currentGroup,
        saving: false,
      }));
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
        const nextPosition =
          d.breaks.length > 0
            ? Math.max(...d.breaks.map((b) => b.position)) + 1
            : 1;
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

  function updateBreak(
    dayId: string,
    localId: string,
    patch: Partial<DayBreakDraft>,
  ) {
    setDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;

        const updated = d.breaks.map((b) =>
          b.localId === localId ? { ...b, ...patch } : b,
        );

        const isCompletedStartTime =
          "break_start_time" in patch &&
          typeof patch.break_start_time === "string" &&
          /^\d{2}:\d{2}$/.test(patch.break_start_time);

        if (isCompletedStartTime && updated.length > 1) {
          const sorted = [...updated].sort((a, b) =>
            a.break_start_time.localeCompare(b.break_start_time),
          );
          return {
            ...d,
            breaks: sorted.map((b, idx) => ({ ...b, position: idx + 1 })),
          };
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

        const nextPosition =
          day.breaks.length > 0
            ? Math.max(...day.breaks.map((brk) => brk.position)) + 1
            : 1;
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
    if (day.start_time !== saved.start_time || day.end_time !== saved.end_time)
      return true;
    if (day.breaks.length !== saved.breaks.length) return true;

    const sort = (breaks: DayBreakDraft[]) =>
      [...breaks].sort((a, b) =>
        a.break_start_time.localeCompare(b.break_start_time),
      );

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
    () =>
      new Map(locationGroups.map((group) => [group.location_group_id, group])),
    [locationGroups],
  );

  const reverseMatchOrderCourts = useMemo(() => {
    return (
      days.find((day) => day.event_date === reverseMatchOrderDate)?.courts ?? []
    );
  }, [days, reverseMatchOrderDate]);

  const reverseMatchOrderChangesByCourt = useMemo(() => {
    if (reconfigurationPreview?.action !== "REVERSE_DAY_COURT_MATCH_ORDER")
      return [];

    return groupReverseMatchOrderChangesByCourt(reconfigurationPreview.changes);
  }, [reconfigurationPreview]);

  function handleReverseMatchOrderDateChange(nextDate: string) {
    setReverseMatchOrderDate(nextDate);
    setReverseMatchOrderCourtIds(
      resolveReverseMatchOrderCourtIds(days, nextDate),
    );
  }

  function toggleReverseMatchOrderCourt(courtId: string, checked: boolean) {
    setReverseMatchOrderCourtIds((currentCourtIds) => {
      if (checked) return [...new Set([...currentCourtIds, courtId])];
      return currentCourtIds.filter(
        (currentCourtId) => currentCourtId !== courtId,
      );
    });
  }

  function requestReverseMatchOrder() {
    if (!reverseMatchOrderDate || reverseMatchOrderCourtIds.length === 0)
      return;

    void requestReconfiguration({
      action: "REVERSE_DAY_COURT_MATCH_ORDER",
      payload: {
        scheduled_date: reverseMatchOrderDate,
        bracket_court_ids: reverseMatchOrderCourtIds,
      },
      label: `Inverter ordem dos jogos de ${formatDate(reverseMatchOrderDate)}`,
    });
  }

  return (
    <div className="space-y-6">
      {!isEditable ? (
        <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950 dark:text-amber-100">
          Somente leitura: a reprogramação só pode ser feita com o campeonato em
          "Em revisão".
        </div>
      ) : null}

      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsNavigationList className="h-auto w-full justify-start">
          <TabsNavigationTrigger
            value="schedule"
            className="px-3 py-2.5 sm:px-4"
          >
            Agenda
          </TabsNavigationTrigger>
          <TabsNavigationTrigger
            value="sessions"
            className="px-3 py-2.5 sm:px-4"
          >
            Sessões individuais
          </TabsNavigationTrigger>
          <TabsNavigationTrigger
            value="qualification"
            className="px-3 py-2.5 sm:px-4"
          >
            Classificação para o mata-mata
          </TabsNavigationTrigger>
          <TabsNavigationTrigger
            value="court-priorities"
            className="px-3 py-2.5 sm:px-4"
          >
            Prioridades de quadra
          </TabsNavigationTrigger>
          <TabsNavigationTrigger
            value="knockout-priorities"
            className="px-3 py-2.5 sm:px-4"
          >
            Prioridades do mata-mata
          </TabsNavigationTrigger>
        </TabsNavigationList>

        <TabsContent value="schedule" className="mt-6">
          {loading ? (
            <ScheduleSectionSkeleton />
          ) : (
            <section className="enter-section space-y-4">
              <div className="glass-card space-y-4 p-4 sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="space-y-1">
                    <p className="font-semibold">Inverter ordem dos jogos</p>
                    <p className="text-sm text-muted-foreground">
                      Troca o primeiro jogo pelo último de cada quadra
                      selecionada. Apenas jogos agendados são alterados;
                      intervalos, slots vazios e sessões individuais permanecem
                      no lugar.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)_auto] lg:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor="reverse-match-order-date">Data</Label>
                    <Select
                      value={reverseMatchOrderDate}
                      onValueChange={handleReverseMatchOrderDateChange}
                      disabled={!isEditable || loading || days.length === 0}
                    >
                      <SelectTrigger
                        id="reverse-match-order-date"
                        className="app-input-field"
                      >
                        <SelectValue placeholder="Selecione a data" />
                      </SelectTrigger>
                      <SelectContent>
                        {days.map((day) => (
                          <SelectItem key={day.id} value={day.event_date}>
                            {formatDate(day.event_date)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Quadras</Label>
                    <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
                      {reverseMatchOrderCourts.length === 0 ? (
                        <span className="text-sm text-muted-foreground">
                          Selecione uma data com quadras configuradas.
                        </span>
                      ) : (
                        reverseMatchOrderCourts.map((court) => (
                          <label
                            key={court.id}
                            className="flex cursor-pointer items-center gap-2 text-sm"
                          >
                            <Checkbox
                              checked={reverseMatchOrderCourtIds.includes(
                                court.id,
                              )}
                              onCheckedChange={(checked) =>
                                toggleReverseMatchOrderCourt(
                                  court.id,
                                  checked === true,
                                )
                              }
                              disabled={!isEditable}
                            />
                            {court.label}
                          </label>
                        ))
                      )}
                    </div>
                  </div>

                  <Button
                    type="button"
                    disabled={
                      !isEditable ||
                      loading ||
                      reverseMatchOrderCourtIds.length === 0
                    }
                    onClick={requestReverseMatchOrder}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Calcular inversão
                  </Button>
                </div>
              </div>

              {days.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  Nenhum dia configurado na agenda deste campeonato.
                </p>
              ) : (
                <div className="glass-card space-y-6 p-4 sm:p-6">
                  <div className="border-b border-border/50 pb-4">
                    <p className="text-lg font-bold">Dias da agenda</p>
                    <p className="text-sm text-muted-foreground">
                      Cada dia reúne horários, intervalos, locais e quadras
                      definidos na configuração inicial.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {days.map((day, index) => {
                      const isExpanded = expandedDayIds.has(day.id);
                      const dayContentId = `reprogram-schedule-day-${day.id}`;
                      const breakSummary = resolveDayBreakSummary(day);
                      const generalBreaks = day.breaks.filter(
                        (brk) => brk.scope_type !== "COURT",
                      );

                      return (
                        <div
                          key={day.id}
                          className="overflow-hidden rounded-xl border border-border/50 bg-background/30"
                        >
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            aria-controls={dayContentId}
                            aria-label={`${isExpanded ? "Recolher" : "Expandir"} Dia ${index + 1}`}
                            onClick={() => toggleDay(day.id)}
                            className="flex w-full items-center justify-between gap-4 border-b border-border/40 bg-background/40 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                          >
                            <span className="min-w-0">
                              <span className="block font-semibold">
                                Dia {index + 1}
                              </span>
                              <span className="block text-sm text-muted-foreground">
                                {formatDate(day.event_date)} •{" "}
                                {formatTime(day.start_time)} às{" "}
                                {formatTime(day.end_time)}
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
                            <div
                              id={dayContentId}
                              className="grid items-stretch gap-6 p-4 xl:grid-cols-[minmax(0,200px)_minmax(0,1fr)]"
                            >
                              <div className="flex flex-col">
                                <div className="space-y-4">
                                  <div className="space-y-1.5">
                                    <Label
                                      htmlFor={`start-${day.id}`}
                                      className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
                                    >
                                      Início
                                    </Label>
                                    <TimeInput
                                      id={`start-${day.id}`}
                                      value={formatTime(day.start_time)}
                                      disabled={!isEditable || day.saving}
                                      onChange={(value) =>
                                        updateDay(day.id, { start_time: value })
                                      }
                                      className="h-10 border-border/40 bg-background/50"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label
                                      htmlFor={`end-${day.id}`}
                                      className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
                                    >
                                      Fim
                                    </Label>
                                    <TimeInput
                                      id={`end-${day.id}`}
                                      value={formatTime(day.end_time)}
                                      disabled={!isEditable || day.saving}
                                      onChange={(value) =>
                                        updateDay(day.id, { end_time: value })
                                      }
                                      className="h-10 border-border/40 bg-background/50"
                                    />
                                  </div>
                                </div>

                                <div className="space-y-4 pt-5">
                                  {(generalBreaks.length > 0
                                    ? generalBreaks
                                    : [null]
                                  ).map((brk, breakIndex) => (
                                    <div
                                      key={
                                        brk?.localId ??
                                        `empty-general-break-${day.id}`
                                      }
                                      className="space-y-4"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                          {breakIndex === 0
                                            ? "Intervalo do dia"
                                            : `Intervalo do dia ${breakIndex + 1}`}
                                        </p>
                                        {isEditable && brk ? (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            disabled={day.saving}
                                            aria-label={`Remover intervalo do dia ${breakIndex + 1}`}
                                            className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() =>
                                              removeBreak(day.id, brk.localId)
                                            }
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        ) : null}
                                      </div>
                                      <div className="space-y-1.5">
                                        <Label
                                          htmlFor={`break-start-${brk?.localId ?? `empty-general-break-${day.id}`}`}
                                          className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
                                        >
                                          Início do intervalo
                                        </Label>
                                        <TimeInput
                                          id={`break-start-${brk?.localId ?? `empty-general-break-${day.id}`}`}
                                          value={brk?.break_start_time ?? ""}
                                          disabled={!isEditable || day.saving}
                                          onChange={(value) =>
                                            updateGeneralBreak(
                                              day.id,
                                              brk?.localId ?? null,
                                              {
                                                break_start_time: value,
                                                break_end_time:
                                                  brk?.break_end_time ?? "",
                                              },
                                            )
                                          }
                                          className="h-10 border-border/40 bg-background/50"
                                        />
                                      </div>
                                      <div className="space-y-1.5">
                                        <Label
                                          htmlFor={`break-end-${brk?.localId ?? `empty-general-break-${day.id}`}`}
                                          className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
                                        >
                                          Fim do intervalo
                                        </Label>
                                        <TimeInput
                                          id={`break-end-${brk?.localId ?? `empty-general-break-${day.id}`}`}
                                          value={brk?.break_end_time ?? ""}
                                          disabled={!isEditable || day.saving}
                                          onChange={(value) =>
                                            updateGeneralBreak(
                                              day.id,
                                              brk?.localId ?? null,
                                              {
                                                break_start_time:
                                                  brk?.break_start_time ?? "",
                                                break_end_time: value,
                                              },
                                            )
                                          }
                                          className="h-10 border-border/40 bg-background/50"
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                {isEditable ? (
                                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-5">
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="w-full"
                                      disabled={day.saving || !isDayDirty(day)}
                                      onClick={() => saveDay(day)}
                                    >
                                      {day.saving ? (
                                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                      ) : null}
                                      Salvar dia
                                    </Button>
                                  </div>
                                ) : null}
                              </div>

                              <div className="space-y-3 border-t border-border/30 pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    Locais do dia
                                  </Label>
                                  <p className="text-xs text-muted-foreground">
                                    Os nomes valem para toda a edição.
                                  </p>
                                </div>
                                {day.locations.map((location) => {
                                  const group = locationGroupById.get(
                                    location.location_group_id,
                                  );
                                  if (!group) return null;

                                  return (
                                    <div
                                      key={location.id}
                                      className="space-y-4 rounded-lg border border-border/30 bg-background/40 p-3"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1">
                                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                            Nome do local
                                          </p>
                                          <p className="font-medium">
                                            {group.location_name}
                                          </p>
                                        </div>
                                        {isEditable ? (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            disabled={group.saving}
                                            aria-label={`Editar ${group.location_name}`}
                                            title="Editar local e quadras"
                                            onClick={() =>
                                              openLocationGroupEditor(group)
                                            }
                                          >
                                            <Pencil className="h-4 w-4" />
                                          </Button>
                                        ) : null}
                                      </div>
                                      <div className="space-y-3">
                                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                          Quadras desse local
                                        </p>
                                        <div className="grid grid-cols-1 gap-3 border-t border-border/30 pt-3 md:grid-cols-2 xl:grid-cols-3">
                                          {location.courts.map((dayCourt) => {
                                            const court = group.courts.find(
                                              (currentCourt) =>
                                                currentCourt.court_group_id ===
                                                dayCourt.court_group_id,
                                            );
                                            if (!court) return null;
                                            const courtBreaks =
                                              day.breaks.filter(
                                                (brk) =>
                                                  brk.scope_type === "COURT" &&
                                                  brk.bracket_court_id ===
                                                    dayCourt.id,
                                              );

                                            return (
                                              <div
                                                key={court.court_group_id}
                                                className="space-y-3 rounded-lg border border-border/20 bg-background/30 p-3"
                                              >
                                                <div className="space-y-1">
                                                  <p className="text-xs font-medium text-muted-foreground">
                                                    Quadra {court.position}
                                                  </p>
                                                  <p className="font-medium">
                                                    {court.court_name}
                                                  </p>
                                                </div>

                                                <div className="space-y-3 border-t border-border/30 pt-3">
                                                  <div className="flex items-center justify-between gap-2">
                                                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                                      Intervalos da quadra
                                                    </p>
                                                    {isEditable ? (
                                                      <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        disabled={day.saving}
                                                        aria-label={`Adicionar intervalo à ${court.court_name}`}
                                                        className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                        onClick={() =>
                                                          addBreak(
                                                            day.id,
                                                            "COURT",
                                                            dayCourt.id,
                                                          )
                                                        }
                                                      >
                                                        <Plus className="h-4 w-4" />
                                                      </Button>
                                                    ) : null}
                                                  </div>

                                                  {courtBreaks.length === 0 ? (
                                                    <p className="rounded-md border border-dashed border-border/30 px-3 py-2 text-[11px] italic text-muted-foreground">
                                                      Nenhum intervalo
                                                      específico nesta quadra
                                                      neste dia.
                                                    </p>
                                                  ) : (
                                                    courtBreaks.map(
                                                      (brk, breakIndex) => (
                                                        <div
                                                          key={brk.localId}
                                                          className="rounded-md border border-border/20 bg-background/50 p-3"
                                                        >
                                                          <div className="flex items-start gap-2">
                                                            <div className="min-w-0 flex-1 space-y-3">
                                                              <div className="space-y-1.5">
                                                                <Label
                                                                  htmlFor={`court-break-start-${brk.localId}`}
                                                                  className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                                                                >
                                                                  Início do
                                                                  intervalo
                                                                </Label>
                                                                <TimeInput
                                                                  id={`court-break-start-${brk.localId}`}
                                                                  value={
                                                                    brk.break_start_time
                                                                  }
                                                                  disabled={
                                                                    !isEditable ||
                                                                    day.saving
                                                                  }
                                                                  onChange={(
                                                                    value,
                                                                  ) =>
                                                                    updateBreak(
                                                                      day.id,
                                                                      brk.localId,
                                                                      {
                                                                        break_start_time:
                                                                          value,
                                                                      },
                                                                    )
                                                                  }
                                                                  className="h-10 border-border/40 bg-background/50"
                                                                />
                                                              </div>
                                                              <div className="space-y-1.5">
                                                                <Label
                                                                  htmlFor={`court-break-end-${brk.localId}`}
                                                                  className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                                                                >
                                                                  Fim do
                                                                  intervalo
                                                                </Label>
                                                                <TimeInput
                                                                  id={`court-break-end-${brk.localId}`}
                                                                  value={
                                                                    brk.break_end_time
                                                                  }
                                                                  disabled={
                                                                    !isEditable ||
                                                                    day.saving
                                                                  }
                                                                  onChange={(
                                                                    value,
                                                                  ) =>
                                                                    updateBreak(
                                                                      day.id,
                                                                      brk.localId,
                                                                      {
                                                                        break_end_time:
                                                                          value,
                                                                      },
                                                                    )
                                                                  }
                                                                  className="h-10 border-border/40 bg-background/50"
                                                                />
                                                              </div>
                                                            </div>
                                                            {isEditable ? (
                                                              <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                disabled={
                                                                  day.saving
                                                                }
                                                                aria-label={`Remover intervalo ${breakIndex + 1} da ${court.court_name}`}
                                                                className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                                onClick={() =>
                                                                  removeBreak(
                                                                    day.id,
                                                                    brk.localId,
                                                                  )
                                                                }
                                                              >
                                                                <Trash2 className="h-4 w-4" />
                                                              </Button>
                                                            ) : null}
                                                          </div>
                                                        </div>
                                                      ),
                                                    )
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
          )}
        </TabsContent>

        <TabsContent value="sessions" className="mt-6">
          {individualEventsLoading ? (
            <CardListSkeleton
              count={6}
              className="md:grid-cols-2 xl:grid-cols-3"
            />
          ) : individualSessions.length > 0 ? (
            <section className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {individualSessions.map((session) => (
                  <div key={session.id} className="glass-card space-y-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{session.sports?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatNaipe(session.naipe)}
                        </p>
                      </div>

                      {isEditable ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          aria-label={`Editar sessão de ${
                            session.sports?.name ?? "modalidade individual"
                          } ${formatNaipe(session.naipe)}`}
                          title="Editar sessão"
                          onClick={() => openIndividualSessionEditor(session)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>

                    <p className="text-sm">
                      {session.scheduled_date
                        ? formatDate(session.scheduled_date)
                        : "Sem data"}

                      {session.start_time && session.end_time
                        ? ` • ${formatTime(session.start_time)} às ${formatTime(
                            session.end_time,
                          )}`
                        : session.period
                          ? ` • ${
                              session.period == "MATUTINO"
                                ? "Matutino"
                                : "Vespertino"
                            }`
                          : ""}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {session.location_name ?? "Local a definir"}
                      {session.court_name ? ` • ${session.court_name}` : ""}
                    </p>

                    {individualEvents.some(
                      (event) => event.session_id == session.id,
                    ) ? (
                      <p className="text-[11px] text-muted-foreground">
                        {
                          individualEvents.filter(
                            (event) => event.session_id == session.id,
                          ).length
                        }{" "}
                        provas vinculadas
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">
              Nenhuma sessão individual agendada.
            </p>
          )}
        </TabsContent>

        <TabsContent value="qualification" className="mt-6">
          {loading ? (
            <QualificationSectionSkeleton />
          ) : (
            <section className="enter-section space-y-4">
              <AdminChampionshipQualificationSection
                competitions={competitions}
                isEditable={isEditable}
                onRequestReconfiguration={requestReconfiguration}
              />
            </section>
          )}
        </TabsContent>

        <TabsContent value="court-priorities" className="mt-6">
          <section className="space-y-4">
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

        <TabsContent value="knockout-priorities" className="mt-6">
          <section className="space-y-4">
            <AdminChampionshipKnockoutPrioritySection
              bracketEditionId={bracketEditionId}
              isEditable={isEditable}
              sportNameBySportId={sportNameBySportId}
              onRequestReconfiguration={requestReconfiguration}
            />
          </section>
        </TabsContent>
      </Tabs>

      <Dialog
        open={editingIndividualSession != null}
        onOpenChange={(open) => {
          if (!open) {
            closeIndividualSessionEditor();
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar sessão individual</DialogTitle>
            <DialogDescription>
              Reprograme o dia, horário e recurso reservado para esta sessão.
            </DialogDescription>
          </DialogHeader>

          {editingIndividualSession && individualSessionEditDraft ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-border/40 bg-background/40 p-4">
                <p className="font-semibold">
                  {editingIndividualSession.sports?.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatNaipe(editingIndividualSession.naipe)}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Data</Label>

                <Select
                  value={individualSessionEditDraft.scheduledDate}
                  onValueChange={(value) =>
                    setIndividualSessionEditDraft((current) =>
                      current
                        ? {
                            ...current,
                            scheduledDate: value,
                            locationGroupId: "",
                            courtGroupId: "",
                          }
                        : current,
                    )
                  }
                >
                  <SelectTrigger className="app-input-field">
                    <SelectValue placeholder="Selecione a data" />
                  </SelectTrigger>

                  <SelectContent>
                    {days.map((day) => (
                      <SelectItem key={day.id} value={day.event_date}>
                        {formatDate(day.event_date)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Horário inicial</Label>

                  <TimeInput
                    value={individualSessionEditDraft.startTime}
                    onChange={(value) =>
                      setIndividualSessionEditDraft((current) =>
                        current
                          ? {
                              ...current,
                              startTime: value,
                            }
                          : current,
                      )
                    }
                    className="h-10 border-border/40 bg-background/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Horário final</Label>

                  <TimeInput
                    value={individualSessionEditDraft.endTime}
                    onChange={(value) =>
                      setIndividualSessionEditDraft((current) =>
                        current
                          ? {
                              ...current,
                              endTime: value,
                            }
                          : current,
                      )
                    }
                    className="h-10 border-border/40 bg-background/50"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Local</Label>

                <Select
                  value={individualSessionEditDraft.locationGroupId}
                  onValueChange={(value) =>
                    setIndividualSessionEditDraft((current) =>
                      current
                        ? {
                            ...current,
                            locationGroupId: value,
                            courtGroupId: "",
                          }
                        : current,
                    )
                  }
                  disabled={!individualSessionEditDraft.scheduledDate}
                >
                  <SelectTrigger className="app-input-field">
                    <SelectValue placeholder="Selecione o local" />
                  </SelectTrigger>

                  <SelectContent>
                    {individualSessionEditLocations.map((location) => (
                      <SelectItem
                        key={location.location_group_id}
                        value={location.location_group_id}
                      >
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Quadra / recurso</Label>

                <Select
                  value={individualSessionEditDraft.courtGroupId}
                  onValueChange={(value) =>
                    setIndividualSessionEditDraft((current) =>
                      current
                        ? {
                            ...current,
                            courtGroupId: value,
                          }
                        : current,
                    )
                  }
                  disabled={!individualSessionEditDraft.locationGroupId}
                >
                  <SelectTrigger className="app-input-field">
                    <SelectValue placeholder="Selecione a quadra ou recurso" />
                  </SelectTrigger>

                  <SelectContent>
                    {individualSessionEditCourts.map((court) => (
                      <SelectItem
                        key={court.court_group_id}
                        value={court.court_group_id}
                      >
                        {court.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/40 bg-background/40 p-4">
                <Checkbox
                  checked={individualSessionEditDraft.exclusiveLockEnabled}
                  onCheckedChange={(checked) =>
                    setIndividualSessionEditDraft((current) =>
                      current
                        ? {
                            ...current,
                            exclusiveLockEnabled: checked === true,
                          }
                        : current,
                    )
                  }
                />

                <span className="space-y-1">
                  <span className="block text-sm font-medium">
                    Reserva exclusiva do recurso
                  </span>

                  <span className="block text-xs text-muted-foreground">
                    Impede que jogos ou outras sessões utilizem este recurso
                    durante o horário configurado.
                  </span>
                </span>
              </label>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeIndividualSessionEditor}
                >
                  Cancelar
                </Button>

                <Button
                  type="button"
                  onClick={() => void requestIndividualSessionReconfiguration()}
                  disabled={
                    !individualSessionEditDraft.scheduledDate ||
                    !individualSessionEditDraft.startTime ||
                    !individualSessionEditDraft.endTime ||
                    !individualSessionEditDraft.locationGroupId ||
                    !individualSessionEditDraft.courtGroupId
                  }
                >
                  <CalendarClock className="mr-2 h-4 w-4" />
                  Calcular reprogramação
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingLocationGroup != null}
        onOpenChange={(open) => !open && setEditingLocationGroup(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar local e quadras</DialogTitle>
            <DialogDescription>
              Os nomes atualizados serão aplicados a todos os dias desta edição
              que usam este local.
            </DialogDescription>
          </DialogHeader>
          {editingLocationGroup ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="editing-location-name">Nome do local</Label>
                <Input
                  id="editing-location-name"
                  value={editingLocationGroup.location_name}
                  onChange={(event) =>
                    updateEditingLocationGroup((group) => ({
                      ...group,
                      location_name: event.target.value,
                    }))
                  }
                  className="app-input-field"
                />
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold">Quadras deste local</p>
                  <p className="text-xs text-muted-foreground">
                    Os nomes também serão replicados nos demais dias desta
                    edição.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {editingLocationGroup.courts.map((court) => (
                    <div
                      key={court.court_group_id}
                      className="space-y-1.5 rounded-lg border border-border/30 bg-background/40 p-3"
                    >
                      <Label htmlFor={`editing-court-${court.court_group_id}`}>
                        Quadra {court.position}
                      </Label>
                      <Input
                        id={`editing-court-${court.court_group_id}`}
                        value={court.court_name}
                        onChange={(event) =>
                          updateEditingLocationGroup((group) => ({
                            ...group,
                            courts: group.courts.map((currentCourt) =>
                              currentCourt.court_group_id ===
                              court.court_group_id
                                ? {
                                    ...currentCourt,
                                    court_name: event.target.value,
                                  }
                                : currentCourt,
                            ),
                          }))
                        }
                        className="app-input-field"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingLocationGroup(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={!isLocationGroupDirty(editingLocationGroup)}
                  onClick={saveEditingLocationGroup}
                >
                  Salvar local e quadras
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingReconfiguration != null}
        onOpenChange={(open) => !open && closeReconfigurationPreview()}
      >
        <DialogContent
          className="max-w-5xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            reconfigurationTriggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Confirmar reprogramação</DialogTitle>
            <DialogDescription>
              {pendingReconfiguration?.label ??
                "Calculando o impacto da alteração"}
            </DialogDescription>
          </DialogHeader>
          {loadingReconfigurationPreview ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />

              {pendingReconfiguration?.action == "INDIVIDUAL_SESSION"
                ? "Validando a reprogramação da sessão…"
                : pendingReconfiguration?.action == "COMPETITION_SETTINGS"
                  ? "Calculando o impacto da classificação e do pareamento…"
                  : pendingReconfiguration?.action == "COURT_SPORT_SEQUENCE"
                    ? "Calculando o impacto do novo sequenciamento das quadras…"
                    : pendingReconfiguration?.action ==
                        "KNOCKOUT_COURT_PRIORITIES"
                      ? "Calculando o impacto das prioridades do mata-mata…"
                  : pendingReconfiguration?.action ==
                      "LOCATION_SPORT_PRIORITIES"
                    ? "Calculando o impacto da nova prioridade de quadras…"
                    : "Calculando os jogos afetados…"}
            </div>
          ) : reconfigurationPreview ? (
            <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1 text-sm">
              {reconfigurationPreview.action == "INDIVIDUAL_SESSION" ? (
                <div className="space-y-1">
                  <p className="font-semibold">
                    A sessão individual será reprogramada.
                  </p>

                  <p className="text-muted-foreground">
                    Revise abaixo a data, horário e recurso antes de confirmar.
                  </p>
                </div>
              ) : reconfigurationPreview.action ==
                "REVERSE_DAY_COURT_MATCH_ORDER" ? (
                <div className="space-y-1">
                  <p>
                    <strong>{reconfigurationPreview.affected_matches}</strong>{" "}
                    jogo(s) de{" "}
                    <strong>{reverseMatchOrderChangesByCourt.length}</strong>{" "}
                    quadra(s) terão posição, horário ou representação alterados.
                  </p>

                  <p className="text-muted-foreground">
                    Em cada quadra, o primeiro jogo ocupará a última vaga, o
                    segundo ocupará a penúltima, e assim sucessivamente.
                  </p>
                </div>
              ) : reconfigurationPreview.action == "COMPETITION_SETTINGS" ? (
                <div className="space-y-1">
                  <p>
                    <strong>{reconfigurationPreview.affected_matches}</strong>{" "}
                    jogo(s) poderão ser redistribuídos após esta alteração.
                  </p>

                  <p className="text-xs text-muted-foreground">
                    Revise a classificação e o pareamento antes de aplicar a
                    nova configuração.
                  </p>
                </div>
              ) : reconfigurationPreview.action == "COURT_SPORT_SEQUENCE" ? (
                <div className="space-y-1">
                  {reconfigurationPreview.affected_matches > 0 ? (
                    <>
                      <p>
                        <strong>{reconfigurationPreview.affected_matches}</strong>{" "}
                        jogo(s) terão data, horário, quadra ou posição
                        recalculados.
                      </p>

                      <p className="text-xs text-muted-foreground">
                        Revise abaixo o sequenciamento solicitado e os jogos
                        afetados antes de aplicar.
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      A configuração da quadra será atualizada sem necessidade
                      de alterar a posição dos jogos.
                    </p>
                  )}
                </div>
              ) : reconfigurationPreview.action ==
                "KNOCKOUT_COURT_PRIORITIES" ? (
                <div className="space-y-1">
                  {reconfigurationPreview.affected_matches > 0 ? (
                    <>
                      <p>
                        <strong>{reconfigurationPreview.affected_matches}</strong>{" "}
                        jogo(s) poderão ter data, horário, quadra ou posição
                        recalculados.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Revise as prioridades solicitadas e os jogos afetados
                        antes de aplicar.
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      As prioridades serão atualizadas sem necessidade de mover
                      jogos.
                    </p>
                  )}
                </div>
              ) : reconfigurationPreview.action == "LOCATION_SPORT_PRIORITIES" ? (
                <div className="space-y-1">
                  {reconfigurationPreview.affected_matches > 0 ? (
                    <>
                      <p>
                        <strong>
                          {reconfigurationPreview.affected_matches}
                        </strong>{" "}
                        jogo(s) terão posição, horário ou quadra recalculados
                        com a nova prioridade.
                      </p>

                      <p className="text-xs text-muted-foreground">
                        A redistribuição respeitará as configurações protegidas.
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      A prioridade poderá ser atualizada sem necessidade de
                      redistribuir jogos.
                    </p>
                  )}
                </div>
              ) : (
                <p>
                  <strong>{reconfigurationPreview.affected_matches}</strong>{" "}
                  jogo(s) terão data, horário, local, quadra ou posição
                  alterados.
                </p>
              )}
              {reconfigurationPreview.blockers.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-destructive">
                  {reconfigurationPreview.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              ) : null}
              {reconfigurationPreview.action == "COMPETITION_SETTINGS" &&
              pendingReconfiguration ? (
                <div className="space-y-3">
                  <div>
                    <p className="font-semibold">
                      {String(
                        pendingReconfiguration.payload.competition_label ??
                          "Competição",
                      )}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      Classificação e pareamento do mata-mata
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border p-3">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Antes
                      </p>

                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Classificação
                          </p>

                          <p className="mt-0.5 font-medium">
                            {String(
                              pendingReconfiguration.payload
                                .current_qualification_label ?? "Não definida",
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground">
                            Pareamento
                          </p>

                          <p className="mt-0.5 font-medium">
                            {String(
                              pendingReconfiguration.payload
                                .current_pairing_label ?? "Não definido",
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary">
                        Depois
                      </p>

                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Classificação
                          </p>

                          <p className="mt-0.5 font-medium">
                            {String(
                              pendingReconfiguration.payload
                                .target_qualification_label ?? "Não definida",
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground">
                            Pareamento
                          </p>

                          <p className="mt-0.5 font-medium">
                            {String(
                              pendingReconfiguration.payload
                                .target_pairing_label ?? "Não definido",
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {reconfigurationPreview.action == "COURT_SPORT_SEQUENCE" &&
              pendingReconfiguration ? (
                <div className="space-y-3">
                  <div>
                    <p className="font-semibold">
                      {String(
                        pendingReconfiguration.payload.sport_name ??
                          "Modalidade",
                      )}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {String(
                        pendingReconfiguration.payload.location_name ?? "Local",
                      )}
                    </p>
                  </div>

                  <div className="space-y-2">
                    {(Array.isArray(
                      pendingReconfiguration.payload.sequence_changes,
                    )
                      ? pendingReconfiguration.payload.sequence_changes
                      : []
                    ).map((rawChange, index) => {
                      const change = rawChange as Record<string, unknown>;

                      return (
                        <div
                          key={`${String(
                            change.bracket_day_id ?? index,
                          )}:${String(change.bracket_court_id ?? "")}`}
                          className="rounded-xl border border-border/60 p-3"
                        >
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">
                                {String(change.event_date_label ?? "Data")}
                              </p>

                              <p className="text-xs text-muted-foreground">
                                {String(change.court_name ?? "Quadra")}
                              </p>
                            </div>
                          </div>

                          <div className="grid gap-2 md:grid-cols-2">
                            <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Antes
                              </p>

                              <p className="text-sm font-medium">
                                {String(
                                  change.current_sequence_label ?? "Flexível",
                                )}
                              </p>
                            </div>

                            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
                                Depois
                              </p>

                              <p className="text-sm font-medium">
                                {String(
                                  change.target_sequence_label ?? "Flexível",
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {reconfigurationPreview.action == "KNOCKOUT_COURT_PRIORITIES" &&
              pendingReconfiguration ? (
                <div className="space-y-3">
                  <div>
                    <p className="font-semibold">
                      {String(
                        pendingReconfiguration.payload.sport_name ??
                          "Modalidade",
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Prioridades do mata-mata
                    </p>
                  </div>
                  <div className="space-y-2">
                    {(Array.isArray(
                      pendingReconfiguration.payload.priority_changes,
                    )
                      ? pendingReconfiguration.payload.priority_changes
                      : []
                    ).map((rawChange, index) => {
                      const change = rawChange as Record<string, unknown>;

                      return (
                        <div
                          key={`${String(change.phase ?? index)}:${String(
                            change.division_scope ?? "",
                          )}`}
                          className="rounded-xl border border-border/60 p-3"
                        >
                          <div className="mb-3">
                            <p className="text-sm font-medium">
                              {String(change.phase_label ?? "Mata-mata")}
                            </p>
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Antes
                              </p>
                              <p className="text-sm font-medium">
                                {String(change.current_label ?? "Automático")}
                              </p>
                            </div>
                            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
                                Depois
                              </p>
                              <p className="text-sm font-medium">
                                {String(change.target_label ?? "Automático")}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {reconfigurationPreview.action ==
                "LOCATION_SPORT_PRIORITIES" &&
              pendingReconfiguration ? (
                <div className="space-y-3">
                  <div>
                    <p className="font-semibold">
                      {String(
                        pendingReconfiguration.payload.location_name ?? "Local",
                      )}
                      {" • "}
                      {String(
                        pendingReconfiguration.payload.sport_name ?? "Modalidade",
                      )}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      Prioridade global das quadras
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Antes
                      </p>

                      <p className="font-medium">
                        {String(
                          pendingReconfiguration.payload.current_priority_label ??
                            "Sem prioridade fixa",
                        )}
                      </p>
                    </div>

                    <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
                        Depois
                      </p>

                      <p className="font-medium">
                        {String(
                          pendingReconfiguration.payload.target_priority_label ??
                            "Sem prioridade fixa",
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-md border bg-muted/20 p-3">
                    <div className="space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground">
                          Datas abrangidas
                        </span>

                        <span className="text-right font-medium">
                          {Array.isArray(
                            pendingReconfiguration.payload.event_date_labels,
                          )
                            ? (
                                pendingReconfiguration.payload
                                  .event_date_labels as unknown[]
                              )
                                .map(String)
                                .join(", ")
                            : "—"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          Total de datas
                        </span>

                        <span className="font-medium">
                          {String(
                            pendingReconfiguration.payload.occurrence_count ?? 0,
                          )}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          Configurações protegidas
                        </span>

                        <span className="font-medium">
                          {String(
                            pendingReconfiguration.payload.protected_court_count ??
                              0,
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {Number(
                    pendingReconfiguration.payload.protected_court_count ?? 0,
                  ) > 0 ? (
                    <div className="flex items-start gap-2 rounded-md border border-primary/15 bg-primary/5 p-3 text-xs text-muted-foreground">
                      <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />

                      <p>
                        Quadras com sequenciamento protegido manterão a
                        configuração definida na montagem do campeonato.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {reconfigurationPreview.action == "INDIVIDUAL_SESSION" &&
              pendingReconfiguration ? (
                <div className="space-y-3">
                  <div>
                    <p className="font-semibold">
                      {String(
                        pendingReconfiguration.payload.session_sport_name ??
                          "Modalidade individual",
                      )}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {formatNaipe(
                        typeof pendingReconfiguration.payload.session_naipe ==
                          "string"
                          ? pendingReconfiguration.payload.session_naipe
                          : null,
                      )}
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
                      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Antes
                      </p>

                      <div className="space-y-2">
                        <p>
                          <span className="text-muted-foreground">Data:</span>{" "}
                          {formatSessionPreviewDate(
                            pendingReconfiguration.payload
                              .current_scheduled_date,
                          )}
                        </p>

                        <p>
                          <span className="text-muted-foreground">
                            Horário:
                          </span>{" "}
                          {formatSessionPreviewTimeRange(
                            pendingReconfiguration.payload.current_start_time,
                            pendingReconfiguration.payload.current_end_time,
                          )}
                        </p>

                        <p>
                          <span className="text-muted-foreground">Local:</span>{" "}
                          {String(
                            pendingReconfiguration.payload
                              .current_location_name ?? "Não definido",
                          )}
                        </p>

                        <p>
                          <span className="text-muted-foreground">
                            Quadra / recurso:
                          </span>{" "}
                          {String(
                            pendingReconfiguration.payload.current_court_name ??
                              "Não definido",
                          )}
                        </p>

                        <p>
                          <span className="text-muted-foreground">
                            Reserva exclusiva:
                          </span>{" "}
                          {pendingReconfiguration.payload
                            .current_exclusive_lock_enabled === true
                            ? "Sim"
                            : "Não"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-primary">
                        Depois
                      </p>

                      <div className="space-y-2">
                        <p>
                          <span className="text-muted-foreground">Data:</span>{" "}
                          {formatSessionPreviewDate(
                            pendingReconfiguration.payload.scheduled_date,
                          )}
                        </p>

                        <p>
                          <span className="text-muted-foreground">
                            Horário:
                          </span>{" "}
                          {formatSessionPreviewTimeRange(
                            pendingReconfiguration.payload.start_time,
                            pendingReconfiguration.payload.end_time,
                          )}
                        </p>

                        <p>
                          <span className="text-muted-foreground">Local:</span>{" "}
                          {String(
                            pendingReconfiguration.payload
                              .target_location_name ?? "Não definido",
                          )}
                        </p>

                        <p>
                          <span className="text-muted-foreground">
                            Quadra / recurso:
                          </span>{" "}
                          {String(
                            pendingReconfiguration.payload.target_court_name ??
                              "Não definido",
                          )}
                        </p>

                        <p>
                          <span className="text-muted-foreground">
                            Reserva exclusiva:
                          </span>{" "}
                          {pendingReconfiguration.payload
                            .exclusive_lock_enabled === true
                            ? "Sim"
                            : "Não"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {reconfigurationPreview.changes.length > 0 ? (
                reconfigurationPreview.action ===
                "REVERSE_DAY_COURT_MATCH_ORDER" ? (
                  <div className="space-y-4">
                    {reverseMatchOrderChangesByCourt.map((courtGroup) => (
                      <section
                        key={courtGroup.key}
                        className="overflow-hidden rounded-lg border"
                      >
                        <div className="flex items-center justify-between gap-3 border-b bg-muted/35 px-4 py-3">
                          <div>
                            <p className="font-semibold">{courtGroup.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {courtGroup.changes.length} jogo(s) agendado(s)
                            </p>
                          </div>
                        </div>
                        <div className="divide-y">
                          {courtGroup.changes.map((change, changeIndex) => {
                            const details = formatReverseMatchOrderDetails(
                              change.after,
                            );
                            const currentCourtPosition =
                              resolveReverseMatchOrderCourtPosition(
                                change.before,
                                changeIndex + 1,
                              );
                            const nextCourtPosition =
                              resolveReverseMatchOrderCourtPosition(
                                change.after,
                                courtGroup.changes.length - changeIndex,
                              );
                            return (
                              <div
                                key={change.match_id}
                                className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center"
                              >
                                <div className="min-w-0">
                                  <p className="font-semibold">
                                    {change.match_number != null
                                      ? `Jogo ${change.match_number} • `
                                      : ""}
                                    {details.sport} • {details.naipe}
                                  </p>
                                  <p className="truncate text-sm">
                                    {details.teams}
                                  </p>
                                </div>
                                <div className="flex min-w-0 items-center gap-3">
                                  <ArrowDownUp
                                    className="h-4 w-4 shrink-0 text-muted-foreground"
                                    aria-hidden="true"
                                  />
                                  <div className="min-w-0 flex-1 rounded-md bg-muted/45 px-3 py-2 text-sm">
                                    <p>
                                      <span className="font-medium text-muted-foreground">
                                        Atual:
                                      </span>{" "}
                                      {formatReconfigurationDateTime(
                                        change.before,
                                      )}{" "}
                                      • {currentCourtPosition}ª posição da
                                      quadra
                                    </p>
                                    <p className="mt-2 border-t pt-2">
                                      <span className="font-medium text-muted-foreground">
                                        Nova:
                                      </span>{" "}
                                      {formatReconfigurationDateTime(
                                        change.after,
                                      )}{" "}
                                      • {nextCourtPosition}ª posição da quadra
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {reconfigurationPreview.changes.map((change) => (
                      <div
                        key={change.match_id}
                        className="rounded-md border p-3"
                      >
                        <strong>
                          {change.match_number != null
                            ? `Jogo ${change.match_number}`
                            : `Jogo ${change.match_id.slice(0, 8)}`}
                        </strong>
                        <p className="text-xs text-muted-foreground">
                          Alterações: {change.changed_fields.join(", ")}
                        </p>
                      </div>
                    ))}
                  </div>
                )
              ) : reconfigurationPreview.action ==
                "INDIVIDUAL_SESSION" ? null : reconfigurationPreview.action ==
                "COMPETITION_SETTINGS" ? (
                <p className="text-muted-foreground">
                  A configuração será atualizada sem necessidade de redistribuir
                  jogos.
                </p>
              ) : reconfigurationPreview.action ==
                "COURT_SPORT_SEQUENCE" ? (
                <p className="text-muted-foreground">
                  Nenhum jogo precisa ser redistribuído para aplicar este
                  sequenciamento.
                </p>
              ) : reconfigurationPreview.action ==
                "KNOCKOUT_COURT_PRIORITIES" ? (
                <p className="text-muted-foreground">
                  Nenhum jogo precisa ser redistribuído para aplicar estas
                  prioridades.
                </p>
              ) : reconfigurationPreview.action ==
                "LOCATION_SPORT_PRIORITIES" ? (
                <p className="text-muted-foreground">
                  Nenhum jogo precisa ser redistribuído para aplicar esta
                  prioridade.
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Nenhum jogo será movido.
                </p>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeReconfigurationPreview}
              disabled={applyingReconfiguration}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={applyReconfiguration}
              disabled={
                !reconfigurationPreview ||
                reconfigurationPreview.blockers.length > 0 ||
                applyingReconfiguration
              }
            >
              {applyingReconfiguration ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {reconfigurationPreview?.action == "INDIVIDUAL_SESSION"
                ? "Aplicar reprogramação da sessão"
                : reconfigurationPreview?.action ==
                    "REVERSE_DAY_COURT_MATCH_ORDER"
                  ? `Aplicar inversão de ${reconfigurationPreview.affected_matches} jogos`
                  : reconfigurationPreview?.action == "COMPETITION_SETTINGS"
                    ? "Aplicar configuração"
                    : reconfigurationPreview?.action ==
                        "COURT_SPORT_SEQUENCE"
                      ? "Aplicar sequenciamento"
                    : reconfigurationPreview?.action ==
                        "KNOCKOUT_COURT_PRIORITIES"
                      ? "Aplicar prioridades do mata-mata"
                    : reconfigurationPreview?.action ==
                        "LOCATION_SPORT_PRIORITIES"
                      ? "Aplicar prioridades de quadra"
                    : `Aplicar e redistribuir ${
                        reconfigurationPreview?.affected_matches ?? 0
                      } jogos`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
