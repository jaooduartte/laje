import { useEffect, useMemo, useState } from "react";
import { AdminListSkeleton } from "@/components/skeletons/AdminListSkeleton";
import { addMonths, format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { TablesInsert } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { AppBadge } from "@/components/ui/app-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLeagueEvents } from "@/hooks/useLeagueEvents";
import { useLeagueEventYears } from "@/hooks/useLeagueEventYears";
import type {
  Team,
  LeagueEvent,
  LeagueEventReservationRequest,
} from "@/lib/types";
import {
  LeagueEventOrganizerType,
  LeagueEventReservationRequestStatus,
  LeagueEventType,
} from "@/lib/enums";
import { TEAM_DIVISION_LABELS } from "@/lib/championship";
import { cn } from "@/lib/utils";
import {
  LEAGUE_EVENT_TYPE_BADGE_TONES,
  LEAGUE_EVENT_TYPE_LABELS,
  isLeagueEventType,
} from "@/domain/league-events/leagueEvent.constants";
import {
  resolveLeagueEventOrganizerName,
  resolveLeagueEventOrganizerTeamIds,
} from "@/domain/league-events/leagueEvent.helpers";
import type { LeagueEventFormValues } from "@/domain/league-events/leagueEvent.types";
import { LEAGUE_EVENT_RESERVATION_REQUEST_STATUS_LABELS } from "@/domain/league-events/leagueEventReservation.types";
import { LeagueEventSaveDTO } from "@/domain/league-events/LeagueEventSaveDTO";
import {
  fetchLeagueEventReservationRequests,
  reviewLeagueEventReservationRequest,
} from "@/domain/league-events/leagueEventReservation.repository";
import {
  createLeagueEvent,
  deleteLeagueEvent,
  fetchLeagueEventsByDateRange,
  updateLeagueEvent,
} from "@/domain/league-events/leagueEvent.repository";

interface Props {
  teams: Team[];
  canManageLeagueEvents?: boolean;
}

interface OrganizerTeamsSelectorProps {
  orderedTeams: Team[];
  selectedOrganizerTeamIds: string[];
  onSelectionChange: (organizerTeamIds: string[]) => void;
  placeholder: string;
  triggerClassName?: string;
}

const ALL_LEAGUE_EVENT_TYPES_FILTER = "ALL_LEAGUE_EVENT_TYPES_FILTER";
const ALL_LEAGUE_EVENT_ORGANIZER_FILTER = "ALL_LEAGUE_EVENT_ORGANIZER_FILTER";
const LAJE_LEAGUE_EVENT_ORGANIZER_FILTER = "LAJE_LEAGUE_EVENT_ORGANIZER_FILTER";

function resolveDefaultFormValues(): LeagueEventFormValues {
  return {
    name: "",
    eventType: null,
    organizerTeamIds: [],
    eventDate: null,
  };
}

function resolveFormValuesFromLeagueEvent(
  leagueEvent: LeagueEvent,
): LeagueEventFormValues {
  return {
    name: leagueEvent.name,
    eventType: leagueEvent.event_type,
    organizerTeamIds: resolveLeagueEventOrganizerTeamIds(leagueEvent),
    eventDate: new Date(`${leagueEvent.event_date}T12:00:00`),
  };
}

function OrganizerTeamsSelector({
  orderedTeams,
  selectedOrganizerTeamIds,
  onSelectionChange,
  placeholder,
  triggerClassName,
}: OrganizerTeamsSelectorProps) {
  const teamsById = useMemo(() => {
    return new Map(orderedTeams.map((team) => [team.id, team]));
  }, [orderedTeams]);

  const selectedTeamNames = selectedOrganizerTeamIds
    .map((organizerTeamId) => teamsById.get(organizerTeamId)?.name)
    .filter((teamName): teamName is string => Boolean(teamName));

  const selectedOrganizerLabel =
    selectedTeamNames.length == 0 ? placeholder : selectedTeamNames.join(" + ");

  const handleToggleTeam = (teamId: string) => {
    const nextOrganizerTeamIds = selectedOrganizerTeamIds.includes(teamId)
      ? selectedOrganizerTeamIds.filter(
          (organizerTeamId) => organizerTeamId != teamId,
        )
      : [...selectedOrganizerTeamIds, teamId];

    const orderedOrganizerTeamIds = orderedTeams
      .map((team) => team.id)
      .filter((organizerTeamId) =>
        nextOrganizerTeamIds.includes(organizerTeamId),
      );

    onSelectionChange(orderedOrganizerTeamIds);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "app-input-field w-full justify-between overflow-hidden text-left text-sm font-normal hover:bg-background/70",
            triggerClassName,
          )}
        >
          <span className="truncate">{selectedOrganizerLabel}</span>
          <span className="ml-2 shrink-0 text-xs text-muted-foreground">
            {selectedOrganizerTeamIds.length > 0
              ? `${selectedOrganizerTeamIds.length} selecionada(s)`
              : ""}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        withPortal={false}
        className="w-[340px] border-border/50 bg-background/80 p-3 backdrop-blur-xl"
        align="start"
      >
        <div
          className="max-h-60 space-y-1 overflow-y-auto overscroll-contain pr-1"
          onWheelCapture={(event) => event.stopPropagation()}
        >
          {orderedTeams.map((team) => (
            <label
              key={team.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors"
            >
              <Checkbox
                checked={selectedOrganizerTeamIds.includes(team.id)}
                onCheckedChange={() => handleToggleTeam(team.id)}
              />
              <span className="min-w-0 flex-1 truncate">{team.name}</span>
              <span className="text-[11px] text-muted-foreground">
                {team.division
                  ? TEAM_DIVISION_LABELS[team.division]
                  : "Sem divisão"}
              </span>
            </label>
          ))}
        </div>

        <div className="mt-3 flex justify-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSelectionChange([])}
          >
            Limpar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AdminLeagueEvents({
  teams,
  canManageLeagueEvents = true,
}: Props) {
  const [selectedMonthDate, setSelectedMonthDate] = useState(new Date());
  const { leagueEvents, loading, upsertLeagueEvent, removeLeagueEvent } =
    useLeagueEvents({ monthDate: selectedMonthDate });
  const { years: availableEventYears } = useLeagueEventYears();

  const [createFormValues, setCreateFormValues] =
    useState<LeagueEventFormValues>(resolveDefaultFormValues());
  const [editingLeagueEventId, setEditingLeagueEventId] = useState<
    string | null
  >(null);
  const [showEditLeagueEventModal, setShowEditLeagueEventModal] =
    useState(false);
  const [editingFormValues, setEditingFormValues] =
    useState<LeagueEventFormValues>(resolveDefaultFormValues());
  const [leagueEventSearch, setLeagueEventSearch] = useState("");
  const [leagueEventTypeFilter, setLeagueEventTypeFilter] = useState<string>(
    ALL_LEAGUE_EVENT_TYPES_FILTER,
  );
  const [leagueEventOrganizerFilter, setLeagueEventOrganizerFilter] =
    useState<string>(ALL_LEAGUE_EVENT_ORGANIZER_FILTER);
  const [showCreateLeagueEventModal, setShowCreateLeagueEventModal] =
    useState(false);
  const [
    pendingCreateLeagueEventConflicts,
    setPendingCreateLeagueEventConflicts,
  ] = useState<LeagueEvent[] | null>(null);
  const [creatingLeagueEvent, setCreatingLeagueEvent] = useState(false);
  const [savingEditingLeagueEvent, setSavingEditingLeagueEvent] =
    useState(false);
  const [deletingLeagueEventId, setDeletingLeagueEventId] = useState<
    string | null
  >(null);
  const [pendingDeleteLeagueEvent, setPendingDeleteLeagueEvent] =
    useState<LeagueEvent | null>(null);
  const [reservationRequests, setReservationRequests] = useState<
    LeagueEventReservationRequest[]
  >([]);
  const [loadingReservationRequests, setLoadingReservationRequests] =
    useState(false);
  const [reviewingReservationRequestId, setReviewingReservationRequestId] =
    useState<string | null>(null);
  const [
    pendingApproveReservationConflict,
    setPendingApproveReservationConflict,
  ] = useState<{
    request: LeagueEventReservationRequest;
    conflictingLeagueEvents: LeagueEvent[];
  } | null>(null);
  const [pendingRejectReservation, setPendingRejectReservation] =
    useState<LeagueEventReservationRequest | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState("");

  const orderedTeams = useMemo(() => {
    return [...teams].sort((firstTeam, secondTeam) =>
      firstTeam.name.localeCompare(secondTeam.name),
    );
  }, [teams]);

  const selectedYear = Number(format(selectedMonthDate, "yyyy"));

  useEffect(() => {
    const loadReservationRequests = async () => {
      setLoadingReservationRequests(true);

      const { data, error } = await fetchLeagueEventReservationRequests({
        year: selectedYear,
      });

      if (error) {
        console.error(
          "Erro ao carregar solicitações de reserva:",
          error.message,
        );
        setReservationRequests([]);
        setLoadingReservationRequests(false);
        return;
      }

      setReservationRequests(
        (data as unknown as LeagueEventReservationRequest[] | null) ?? [],
      );
      setLoadingReservationRequests(false);
    };

    void loadReservationRequests();
  }, [selectedYear]);

  const pendingReservationRequests = useMemo(() => {
    return reservationRequests.filter((reservationRequest) => {
      return (
        reservationRequest.status == LeagueEventReservationRequestStatus.PENDING
      );
    });
  }, [reservationRequests]);

  const filteredLeagueEvents = useMemo(() => {
    const normalizedLeagueEventSearch = leagueEventSearch.trim().toLowerCase();
    const selectedYearMonth = format(selectedMonthDate, "yyyy-MM");

    return leagueEvents.filter((leagueEvent) => {
      if (!leagueEvent.event_date.startsWith(selectedYearMonth)) {
        return false;
      }

      if (
        leagueEventTypeFilter != ALL_LEAGUE_EVENT_TYPES_FILTER &&
        leagueEvent.event_type != leagueEventTypeFilter
      ) {
        return false;
      }

      if (leagueEventOrganizerFilter != ALL_LEAGUE_EVENT_ORGANIZER_FILTER) {
        if (leagueEventOrganizerFilter == LAJE_LEAGUE_EVENT_ORGANIZER_FILTER) {
          if (leagueEvent.organizer_type != LeagueEventOrganizerType.LAJE) {
            return false;
          }
        } else {
          const organizerTeamIds =
            resolveLeagueEventOrganizerTeamIds(leagueEvent);

          if (!organizerTeamIds.includes(leagueEventOrganizerFilter)) {
            return false;
          }
        }
      }

      if (normalizedLeagueEventSearch.length == 0) {
        return true;
      }

      return leagueEvent.name
        .toLowerCase()
        .includes(normalizedLeagueEventSearch);
    });
  }, [
    leagueEventOrganizerFilter,
    leagueEventSearch,
    leagueEventTypeFilter,
    leagueEvents,
    selectedMonthDate,
  ]);

  const todayDateKey = format(new Date(), "yyyy-MM-dd");

  const monthControlClassName =
    "h-9 rounded-xl border border-transparent app-input-field text-secondary-foreground";

  const editingLeagueEvent = useMemo(() => {
    if (!editingLeagueEventId) {
      return null;
    }

    return (
      leagueEvents.find(
        (leagueEvent) => leagueEvent.id == editingLeagueEventId,
      ) ?? null
    );
  }, [editingLeagueEventId, leagueEvents]);

  useEffect(() => {
    if (!showEditLeagueEventModal) {
      return;
    }

    if (!editingLeagueEventId) {
      return;
    }

    if (
      leagueEvents.some((leagueEvent) => leagueEvent.id == editingLeagueEventId)
    ) {
      return;
    }

    setShowEditLeagueEventModal(false);
    setEditingLeagueEventId(null);
    setEditingFormValues(resolveDefaultFormValues());
  }, [editingLeagueEventId, leagueEvents, showEditLeagueEventModal]);

  const resetCreateLeagueEventForm = () => {
    setCreateFormValues(resolveDefaultFormValues());
  };

  const handleOpenCreateLeagueEventModal = () => {
    resetCreateLeagueEventForm();
    setPendingCreateLeagueEventConflicts(null);
    setShowCreateLeagueEventModal(true);
  };

  const handleCloseEditLeagueEventModal = () => {
    setShowEditLeagueEventModal(false);
    setEditingLeagueEventId(null);
    setEditingFormValues(resolveDefaultFormValues());
  };

  const handleChangeCreateField = <
    FieldName extends keyof LeagueEventFormValues,
  >(
    fieldName: FieldName,
    value: LeagueEventFormValues[FieldName],
  ) => {
    setCreateFormValues((currentFormValues) => {
      const nextFormValues = {
        ...currentFormValues,
        [fieldName]: value,
      };

      if (fieldName == "eventType" && value == LeagueEventType.LAJE_EVENT) {
        nextFormValues.organizerTeamIds = [];
      }

      return nextFormValues;
    });
  };

  const handleChangeEditField = <FieldName extends keyof LeagueEventFormValues>(
    fieldName: FieldName,
    value: LeagueEventFormValues[FieldName],
  ) => {
    setEditingFormValues((currentFormValues) => {
      const nextFormValues = {
        ...currentFormValues,
        [fieldName]: value,
      };

      if (fieldName == "eventType" && value == LeagueEventType.LAJE_EVENT) {
        nextFormValues.organizerTeamIds = [];
      }

      return nextFormValues;
    });
  };

  const persistCreateLeagueEvent = async (
    payload: TablesInsert<"league_events">,
    organizerTeamIds: string[],
  ) => {
    setCreatingLeagueEvent(true);

    const { data, error } = await createLeagueEvent(payload, organizerTeamIds);

    setCreatingLeagueEvent(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (data) {
      upsertLeagueEvent(data as LeagueEvent);
    }

    toast.success("Evento criado com sucesso.");
    setPendingCreateLeagueEventConflicts(null);
    setShowCreateLeagueEventModal(false);
    resetCreateLeagueEventForm();
    setSelectedMonthDate(new Date(`${payload.event_date}T12:00:00`));
  };

  const resolveConflictingLeagueEventsByDate = async (eventDate: string) => {
    const { data, error } = await fetchLeagueEventsByDateRange({
      startDate: eventDate,
      endDate: eventDate,
    });

    if (error) {
      throw new Error(
        "Não foi possível validar se já existe evento nessa data.",
      );
    }

    return data;
  };

  const handleCreateLeagueEvent = async (shouldIgnoreDateConflict: boolean) => {
    if (!canManageLeagueEvents || creatingLeagueEvent) {
      return;
    }

    try {
      const leagueEventSaveDTO =
        LeagueEventSaveDTO.fromFormValues(createFormValues);
      const payload = leagueEventSaveDTO.bindToSave();
      const organizerTeamIds = leagueEventSaveDTO.resolveOrganizerTeamIds();

      if (!shouldIgnoreDateConflict) {
        const conflictingLeagueEvents =
          await resolveConflictingLeagueEventsByDate(payload.event_date);

        if (conflictingLeagueEvents.length > 0) {
          setPendingCreateLeagueEventConflicts(conflictingLeagueEvents);
          return;
        }
      }

      await persistCreateLeagueEvent(payload, organizerTeamIds);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Não foi possível criar o evento.";
      toast.error(errorMessage);
    }
  };

  const handleSubmitCreateLeagueEvent = async () => {
    await handleCreateLeagueEvent(false);
  };

  const handleConfirmCreateLeagueEventDespiteConflict = async () => {
    setPendingCreateLeagueEventConflicts(null);
    await handleCreateLeagueEvent(true);
  };

  const handleOpenEditLeagueEventModal = (leagueEvent: LeagueEvent) => {
    if (!canManageLeagueEvents) {
      return;
    }

    setEditingLeagueEventId(leagueEvent.id);
    setEditingFormValues(resolveFormValuesFromLeagueEvent(leagueEvent));
    setShowEditLeagueEventModal(true);
  };

  const handleSaveEditEvent = async () => {
    if (!canManageLeagueEvents || savingEditingLeagueEvent) {
      return;
    }

    if (!editingLeagueEventId) {
      return;
    }

    try {
      const leagueEventSaveDTO =
        LeagueEventSaveDTO.fromFormValues(editingFormValues);
      const payload = leagueEventSaveDTO.bindToSave();
      const organizerTeamIds = leagueEventSaveDTO.resolveOrganizerTeamIds();
      setSavingEditingLeagueEvent(true);
      const { data, error } = await updateLeagueEvent(
        editingLeagueEventId,
        payload,
        organizerTeamIds,
      );
      setSavingEditingLeagueEvent(false);

      if (error) {
        toast.error(error.message);
        return;
      }

      if (data) {
        upsertLeagueEvent(data as LeagueEvent);
      }

      toast.success("Evento atualizado com sucesso.");
      handleCloseEditLeagueEventModal();
      setSelectedMonthDate(new Date(`${payload.event_date}T12:00:00`));
    } catch (error) {
      setSavingEditingLeagueEvent(false);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o evento.";
      toast.error(errorMessage);
    }
  };

  const handleDeleteEvent = async (leagueEventId: string) => {
    if (!canManageLeagueEvents || deletingLeagueEventId != null) {
      return;
    }

    setDeletingLeagueEventId(leagueEventId);

    const { error } = await deleteLeagueEvent(leagueEventId);

    setDeletingLeagueEventId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    removeLeagueEvent(leagueEventId);
    toast.success("Evento removido com sucesso.");
  };

  const handleRequestDeleteLeagueEvent = (leagueEvent: LeagueEvent) => {
    if (!canManageLeagueEvents) {
      return;
    }

    setPendingDeleteLeagueEvent(leagueEvent);
  };

  const handleYearChange = (value: string) => {
    const parsedYear = Number(value);

    if (!Number.isFinite(parsedYear)) {
      return;
    }

    setSelectedMonthDate((currentSelectedMonthDate) => {
      return new Date(
        parsedYear,
        currentSelectedMonthDate.getMonth(),
        1,
        12,
        0,
        0,
        0,
      );
    });
  };

  const performReviewReservationRequest = async (
    reservationRequestId: string,
    decision:
      | LeagueEventReservationRequestStatus.APPROVED
      | LeagueEventReservationRequestStatus.REJECTED,
    reviewNotes?: string,
  ) => {
    if (!canManageLeagueEvents || reviewingReservationRequestId != null) {
      return;
    }

    setReviewingReservationRequestId(reservationRequestId);

    const originalRequest = reservationRequests.find(
      (r) => r.id === reservationRequestId,
    );

    const { data, error } = await reviewLeagueEventReservationRequest({
      requestId: reservationRequestId,
      decision,
      reviewNotes,
    });

    setReviewingReservationRequestId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (data?.request) {
      const updatedRequest = data.request as LeagueEventReservationRequest;

      setReservationRequests((currentReservationRequests) => {
        return currentReservationRequests.map((reservationRequest) => {
          if (reservationRequest.id != reservationRequestId) {
            return reservationRequest;
          }

          return updatedRequest;
        });
      });

      void supabase.functions.invoke("send-reservation-email", {
        body: {
          type: decision,
          requesterEmail: updatedRequest.requester_email,
          requesterName: updatedRequest.requester_name,
          teamName:
            originalRequest?.team?.name ?? updatedRequest.team?.name ?? "",
          eventName: updatedRequest.event_name,
          eventType: updatedRequest.event_type,
          eventDate: updatedRequest.event_date,
          ...(decision === LeagueEventReservationRequestStatus.REJECTED &&
          reviewNotes
            ? { reviewNotes }
            : {}),
        },
      });
    }

    if (
      decision == LeagueEventReservationRequestStatus.APPROVED &&
      data?.league_event
    ) {
      upsertLeagueEvent(data.league_event as LeagueEvent);
      toast.success("Reserva aprovada e publicada no calendário.");
      return;
    }

    toast.success("Reserva recusada.");
  };

  const handleReviewReservationRequest = async (
    reservationRequestId: string,
    decision:
      | LeagueEventReservationRequestStatus.APPROVED
      | LeagueEventReservationRequestStatus.REJECTED,
  ) => {
    if (!canManageLeagueEvents || reviewingReservationRequestId != null) {
      return;
    }

    if (decision != LeagueEventReservationRequestStatus.APPROVED) {
      const reservationRequest = reservationRequests.find(
        (r) => r.id === reservationRequestId,
      );
      if (!reservationRequest) {
        toast.error("Solicitação não encontrada.");
        return;
      }
      setPendingRejectReservation(reservationRequest);
      setRejectionNotes("");
      return;
    }

    const reservationRequest = reservationRequests.find(
      (request) => request.id == reservationRequestId,
    );

    if (!reservationRequest) {
      toast.error("Solicitação não encontrada para aprovação.");
      return;
    }

    setReviewingReservationRequestId(reservationRequestId);
    const conflictingLeagueEvents = await resolveConflictingLeagueEventsByDate(
      reservationRequest.event_date,
    ).catch(() => null);
    setReviewingReservationRequestId(null);

    if (conflictingLeagueEvents == null) {
      toast.error(
        "Não foi possível validar conflito de data antes da aprovação.",
      );
      return;
    }

    if (conflictingLeagueEvents.length > 0) {
      setPendingApproveReservationConflict({
        request: reservationRequest,
        conflictingLeagueEvents,
      });
      return;
    }

    await performReviewReservationRequest(
      reservationRequestId,
      LeagueEventReservationRequestStatus.APPROVED,
    );
  };

  const handleConfirmApproveReservationDespiteConflict = async () => {
    if (!pendingApproveReservationConflict) {
      return;
    }

    const pendingReservationRequestId =
      pendingApproveReservationConflict.request.id;
    setPendingApproveReservationConflict(null);
    await performReviewReservationRequest(
      pendingReservationRequestId,
      LeagueEventReservationRequestStatus.APPROVED,
    );
  };

  const handleConfirmRejectReservation = async () => {
    if (!pendingRejectReservation) {
      return;
    }

    const requestId = pendingRejectReservation.id;
    const notes = rejectionNotes.trim() || undefined;
    setPendingRejectReservation(null);
    setRejectionNotes("");
    await performReviewReservationRequest(
      requestId,
      LeagueEventReservationRequestStatus.REJECTED,
      notes,
    );
  };

  const pendingCreateLeagueEventConflictCount =
    pendingCreateLeagueEventConflicts?.length ?? 0;
  const pendingCreateLeagueEventConflictDate =
    pendingCreateLeagueEventConflicts?.[0]?.event_date ?? null;
  const pendingCreateLeagueEventConflictTitle =
    pendingCreateLeagueEventConflictCount > 1
      ? "Já existem eventos nessa data"
      : "Já existe um evento nessa data";
  const pendingCreateLeagueEventConflictDescription =
    pendingCreateLeagueEventConflictDate
      ? `Encontramos ${
          pendingCreateLeagueEventConflictCount > 1
            ? "eventos cadastrados"
            : "evento cadastrado"
        } em ${format(new Date(`${pendingCreateLeagueEventConflictDate}T12:00:00`), "dd/MM/yyyy")}. Deseja criar o evento mesmo assim?`
      : "Encontramos evento cadastrado nessa data. Deseja criar o evento mesmo assim?";

  return (
    <div className="space-y-6">
      <div className="glass-card enter-section flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Input
            type="search"
            value={leagueEventSearch}
            onChange={(event) => setLeagueEventSearch(event.target.value)}
            placeholder="Buscar evento por nome"
            className="app-input-field"
            autoComplete="off"
          />

          <Select
            value={leagueEventOrganizerFilter}
            onValueChange={setLeagueEventOrganizerFilter}
          >
            <SelectTrigger className="app-input-field">
              <SelectValue placeholder="Filtrar por origem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_LEAGUE_EVENT_ORGANIZER_FILTER}>
                Todos os organizadores
              </SelectItem>
              <SelectItem value={LAJE_LEAGUE_EVENT_ORGANIZER_FILTER}>
                Eventos da LAJE
              </SelectItem>
              {orderedTeams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={leagueEventTypeFilter}
            onValueChange={setLeagueEventTypeFilter}
          >
            <SelectTrigger className="app-input-field">
              <SelectValue placeholder="Filtrar por tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_LEAGUE_EVENT_TYPES_FILTER}>
                Todos os tipos
              </SelectItem>
              <SelectItem value={LeagueEventType.HH}>
                {LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.HH]}
              </SelectItem>
              <SelectItem value={LeagueEventType.OPEN_BAR}>
                {LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.OPEN_BAR]}
              </SelectItem>
              <SelectItem value={LeagueEventType.CHAMPIONSHIP}>
                {LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.CHAMPIONSHIP]}
              </SelectItem>
              <SelectItem value={LeagueEventType.LAJE_EVENT}>
                {LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.LAJE_EVENT]}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {canManageLeagueEvents ? (
          <Button
            type="button"
            onClick={handleOpenCreateLeagueEventModal}
            className="w-full xl:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Criar evento
          </Button>
        ) : null}
      </div>

      <div className="enter-section flex w-full flex-col gap-2 glass-card px-4 py-3 sm:flex-row sm:items-center sm:justify-end">
        <Select value={String(selectedYear)} onValueChange={handleYearChange}>
          <SelectTrigger
            className={`${monthControlClassName} w-full sm:min-w-24 sm:w-auto`}
          >
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {availableEventYears.map((year) => (
              <SelectItem key={year} value={String(year)}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className={`${monthControlClassName} w-9 shrink-0`}
            aria-label="Mês anterior"
            onClick={() => setSelectedMonthDate((date) => subMonths(date, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Badge
            variant="outline"
            className={`${monthControlClassName} min-w-40 flex-1 justify-center px-4 text-sm font-medium capitalize sm:flex-none`}
          >
            {format(selectedMonthDate, "MMMM 'de' yyyy", { locale: ptBR })}
          </Badge>
          <Button
            variant="outline"
            size="icon"
            className={`${monthControlClassName} w-9 shrink-0`}
            aria-label="Próximo mês"
            onClick={() => setSelectedMonthDate((date) => addMonths(date, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!canManageLeagueEvents ? (
        <p className="text-sm text-muted-foreground">
          Perfil em visualização: sem permissão para criar ou editar eventos.
        </p>
      ) : null}

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Solicitações de reserva</p>
          <p className="text-xs text-muted-foreground">
            Pedidos públicos recebidos para o calendário da liga em ordem de
            chegada.
          </p>
          <Badge
            variant="outline"
            className="mt-1.5 rounded-xl px-3 py-1 text-xs font-semibold"
          >
            {pendingReservationRequests.length} pendente(s)
          </Badge>
        </div>

        {loadingReservationRequests ? (
          <AdminListSkeleton count={3} showActions />
        ) : pendingReservationRequests.length == 0 ? (
          <div className="rounded-2xl border border-border/50 bg-muted/20 p-4 text-sm text-muted-foreground">
            Nenhuma solicitação pendente para {selectedYear}.
          </div>
        ) : (
          <div className="space-y-2">
            {pendingReservationRequests.map((reservationRequest) => (
              <div
                key={reservationRequest.id}
                className="relative list-item-card list-item-card-hover enter-section p-4 pr-12 lg:pr-4"
              >
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_90px_1fr_1fr_1.5fr_110px_90px_130px_48px] lg:items-center">
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                      Evento
                    </p>
                    <p className="truncate text-sm font-semibold">
                      {reservationRequest.event_name}
                    </p>
                  </div>
                  <div className="space-y-1 lg:text-center">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                      Data
                    </p>
                    <p className="truncate text-sm text-foreground">
                      {format(
                        new Date(`${reservationRequest.event_date}T12:00:00`),
                        "dd/MM/yyyy",
                      )}
                    </p>
                  </div>
                  <div className="space-y-1 lg:text-center">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                      Atlética
                    </p>
                    <p className="truncate text-sm text-foreground">
                      {reservationRequest.team?.name ?? "—"}
                    </p>
                  </div>
                  <div className="space-y-1 lg:text-center">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                      Solicitante
                    </p>
                    <p className="truncate text-sm text-foreground">
                      {reservationRequest.requester_name}
                    </p>
                  </div>
                  <div className="space-y-1 lg:text-center">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                      Email
                    </p>
                    <p className="truncate text-sm text-foreground">
                      {reservationRequest.requester_email}
                    </p>
                  </div>
                  <div className="space-y-1 lg:flex lg:flex-col lg:items-center">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                      Tipo
                    </p>
                    <AppBadge
                      tone={
                        LEAGUE_EVENT_TYPE_BADGE_TONES[
                          reservationRequest.event_type
                        ]
                      }
                    >
                      {LEAGUE_EVENT_TYPE_LABELS[reservationRequest.event_type]}
                    </AppBadge>
                  </div>
                  <div className="space-y-1 lg:text-center">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                      Status
                    </p>
                    <p className="text-sm text-foreground">
                      {
                        LEAGUE_EVENT_RESERVATION_REQUEST_STATUS_LABELS[
                          reservationRequest.status
                        ]
                      }
                    </p>
                  </div>
                  <div className="space-y-1 lg:text-center">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                      Solicitado em
                    </p>
                    <p className="truncate text-sm text-foreground">
                      {format(
                        new Date(reservationRequest.created_at),
                        "dd/MM/yyyy HH:mm",
                      )}
                    </p>
                  </div>
                  {canManageLeagueEvents ? (
                    <div className="absolute right-3 top-3 lg:static lg:flex lg:justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={reviewingReservationRequestId != null}
                          >
                            {reviewingReservationRequestId ==
                            reservationRequest.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreVertical className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              void handleReviewReservationRequest(
                                reservationRequest.id,
                                LeagueEventReservationRequestStatus.APPROVED,
                              )
                            }
                          >
                            <Check className="mr-2 h-4 w-4" />
                            Aprovar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              void handleReviewReservationRequest(
                                reservationRequest.id,
                                LeagueEventReservationRequestStatus.REJECTED,
                              )
                            }
                            className="text-destructive focus:text-destructive"
                          >
                            <X className="mr-2 h-4 w-4" />
                            Recusar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <AdminListSkeleton
          count={6}
          className="grid gap-2 space-y-0 sm:grid-cols-2 xl:grid-cols-3"
        />
      ) : null}

      <div className="flex items-center gap-3">
        <p className="whitespace-nowrap text-sm font-medium">Eventos do mês</p>
        <div className="h-px flex-1 bg-border/50" />
      </div>

      {!loading ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {filteredLeagueEvents.map((leagueEvent) => {
            const organizerName = resolveLeagueEventOrganizerName(leagueEvent);
            const isPastLeagueEvent = leagueEvent.event_date < todayDateKey;

            return (
              <div
                key={leagueEvent.id}
                className={cn(
                  "list-item-card list-item-card-hover p-4 transition-opacity",
                  isPastLeagueEvent && "opacity-70",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="font-display font-semibold">
                          {leagueEvent.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(
                            new Date(`${leagueEvent.event_date}T12:00:00`),
                            "dd/MM/yyyy",
                          )}
                        </p>
                      </div>

                      <AppBadge
                        tone={
                          LEAGUE_EVENT_TYPE_BADGE_TONES[leagueEvent.event_type]
                        }
                      >
                        {LEAGUE_EVENT_TYPE_LABELS[leagueEvent.event_type]}
                      </AppBadge>
                    </div>

                    <div className="mt-2 space-y-0.5 border-t border-border/40 pt-2">
                      <p className="text-sm text-muted-foreground">
                        Organizado por: {organizerName}
                      </p>
                    </div>
                  </div>

                  {canManageLeagueEvents ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Ações do evento ${leagueEvent.name}`}
                          disabled={deletingLeagueEventId != null}
                        >
                          {deletingLeagueEventId == leagueEvent.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreVertical className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onSelect={() =>
                            handleOpenEditLeagueEventModal(leagueEvent)
                          }
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() =>
                            handleRequestDeleteLeagueEvent(leagueEvent)
                          }
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Apagar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {!loading && filteredLeagueEvents.length == 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum evento cadastrado para os filtros selecionados.
        </p>
      ) : null}

      <Dialog
        open={showCreateLeagueEventModal}
        onOpenChange={(isOpen) => {
          setShowCreateLeagueEventModal(isOpen);

          if (!isOpen) {
            setPendingCreateLeagueEventConflicts(null);
            resetCreateLeagueEventForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Criar evento da liga</DialogTitle>
            <DialogDescription>
              Cadastre o evento com nome, tipo, organização e data.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <Input
              value={createFormValues.name}
              onChange={(event) =>
                handleChangeCreateField("name", event.target.value)
              }
              placeholder="Nome do evento"
              className="app-input-field"
            />

            <Select
              value={createFormValues.eventType ?? undefined}
              onValueChange={(value) => {
                if (isLeagueEventType(value)) {
                  handleChangeCreateField("eventType", value);
                }
              }}
            >
              <SelectTrigger className="app-input-field">
                <SelectValue placeholder="Selecione o tipo do evento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={LeagueEventType.HH}>
                  {LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.HH]}
                </SelectItem>
                <SelectItem value={LeagueEventType.OPEN_BAR}>
                  {LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.OPEN_BAR]}
                </SelectItem>
                <SelectItem value={LeagueEventType.CHAMPIONSHIP}>
                  {LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.CHAMPIONSHIP]}
                </SelectItem>
                <SelectItem value={LeagueEventType.LAJE_EVENT}>
                  {LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.LAJE_EVENT]}
                </SelectItem>
              </SelectContent>
            </Select>

            {createFormValues.eventType == null ? (
              <Input
                value=""
                readOnly
                disabled
                className="app-input-field"
                placeholder="Selecione o tipo do evento para definir a organização"
              />
            ) : createFormValues.eventType == LeagueEventType.LAJE_EVENT ? (
              <Input
                value="LAJE"
                readOnly
                disabled
                className="app-input-field"
              />
            ) : (
              <OrganizerTeamsSelector
                orderedTeams={orderedTeams}
                selectedOrganizerTeamIds={createFormValues.organizerTeamIds}
                onSelectionChange={(value) =>
                  handleChangeCreateField("organizerTeamIds", value)
                }
                placeholder="Selecione as atléticas"
              />
            )}

            <DateTimePicker
              value={createFormValues.eventDate}
              onChange={(value) => handleChangeCreateField("eventDate", value)}
              placeholder="Data do evento"
              showTime={false}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateLeagueEventModal(false)}
              disabled={creatingLeagueEvent}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSubmitCreateLeagueEvent}
              disabled={creatingLeagueEvent}
            >
              {creatingLeagueEvent ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Criar evento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showEditLeagueEventModal && editingLeagueEvent != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            handleCloseEditLeagueEventModal();
          }
        }}
      >
        {editingLeagueEvent ? (
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar evento da liga</DialogTitle>
              <DialogDescription>
                Atualize nome, tipo, organização e data do evento selecionado.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3">
              <Input
                value={editingFormValues.name}
                onChange={(event) =>
                  handleChangeEditField("name", event.target.value)
                }
                placeholder="Nome do evento"
                className="app-input-field"
              />

              <Select
                value={editingFormValues.eventType ?? undefined}
                onValueChange={(value) => {
                  if (isLeagueEventType(value)) {
                    handleChangeEditField("eventType", value);
                  }
                }}
              >
                <SelectTrigger className="app-input-field">
                  <SelectValue placeholder="Selecione o tipo do evento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={LeagueEventType.HH}>
                    {LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.HH]}
                  </SelectItem>
                  <SelectItem value={LeagueEventType.OPEN_BAR}>
                    {LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.OPEN_BAR]}
                  </SelectItem>
                  <SelectItem value={LeagueEventType.CHAMPIONSHIP}>
                    {LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.CHAMPIONSHIP]}
                  </SelectItem>
                  <SelectItem value={LeagueEventType.LAJE_EVENT}>
                    {LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.LAJE_EVENT]}
                  </SelectItem>
                </SelectContent>
              </Select>

              {editingFormValues.eventType == null ? (
                <Input
                  value=""
                  readOnly
                  disabled
                  className="app-input-field"
                  placeholder="Selecione o tipo do evento para definir a organização"
                />
              ) : editingFormValues.eventType == LeagueEventType.LAJE_EVENT ? (
                <Input
                  value="LAJE"
                  readOnly
                  disabled
                  className="app-input-field"
                />
              ) : (
                <OrganizerTeamsSelector
                  orderedTeams={orderedTeams}
                  selectedOrganizerTeamIds={editingFormValues.organizerTeamIds}
                  onSelectionChange={(value) =>
                    handleChangeEditField("organizerTeamIds", value)
                  }
                  placeholder="Selecione as atléticas"
                />
              )}

              <DateTimePicker
                value={editingFormValues.eventDate}
                onChange={(value) => handleChangeEditField("eventDate", value)}
                placeholder="Data do evento"
                showTime={false}
              />
            </div>

            <DialogFooter className="gap-3 pt-2 sm:gap-2 sm:pt-0">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseEditLeagueEventModal}
                disabled={savingEditingLeagueEvent}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSaveEditEvent}
                disabled={savingEditingLeagueEvent}
              >
                {savingEditingLeagueEvent ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar alterações
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      <AlertDialog
        open={pendingCreateLeagueEventConflicts != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setPendingCreateLeagueEventConflicts(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingCreateLeagueEventConflictTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCreateLeagueEventConflictDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {pendingCreateLeagueEventConflicts ? (
            <div className="space-y-2 rounded-2xl border border-border/50 bg-muted/30 p-3">
              {pendingCreateLeagueEventConflicts.map((leagueEvent) => (
                <div
                  key={leagueEvent.id}
                  className="space-y-1 rounded-xl border border-border/40 bg-background p-3"
                >
                  <p className="text-sm font-semibold text-foreground">
                    {leagueEvent.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {LEAGUE_EVENT_TYPE_LABELS[leagueEvent.event_type]} •
                    Organizado por{" "}
                    {resolveLeagueEventOrganizerName(leagueEvent)}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={creatingLeagueEvent}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCreateLeagueEventDespiteConflict}
              disabled={creatingLeagueEvent}
            >
              {creatingLeagueEvent ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Criar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDeleteLeagueEvent != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setPendingDeleteLeagueEvent(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir evento da liga?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação removerá o evento{" "}
              <span className="font-semibold text-foreground">
                {pendingDeleteLeagueEvent?.name ?? ""}
              </span>{" "}
              do calendário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingLeagueEventId != null}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingLeagueEventId != null}
              onClick={async () => {
                if (!pendingDeleteLeagueEvent) {
                  return;
                }
                const pendingDeleteLeagueEventId = pendingDeleteLeagueEvent.id;
                setPendingDeleteLeagueEvent(null);
                await handleDeleteEvent(pendingDeleteLeagueEventId);
              }}
            >
              {deletingLeagueEventId != null ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingApproveReservationConflict != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setPendingApproveReservationConflict(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Já existem eventos nessa data</AlertDialogTitle>
            <AlertDialogDescription>
              Existe(m) evento(s) no mesmo dia da reserva. Você deseja aprovar
              mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>

          {pendingApproveReservationConflict ? (
            <div className="space-y-2 rounded-2xl border border-border/50 bg-muted/30 p-3">
              {pendingApproveReservationConflict.conflictingLeagueEvents.map(
                (leagueEvent) => (
                  <div
                    key={leagueEvent.id}
                    className="space-y-1 rounded-xl border border-border/40 bg-background p-3"
                  >
                    <p className="text-sm font-semibold text-foreground">
                      {leagueEvent.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {LEAGUE_EVENT_TYPE_LABELS[leagueEvent.event_type]} •
                      Organizado por{" "}
                      {resolveLeagueEventOrganizerName(leagueEvent)}
                    </p>
                  </div>
                ),
              )}
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={reviewingReservationRequestId != null}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmApproveReservationDespiteConflict}
              disabled={reviewingReservationRequestId != null}
            >
              {reviewingReservationRequestId != null ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Aprovar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={pendingRejectReservation != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setPendingRejectReservation(null);
            setRejectionNotes("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recusar solicitação</DialogTitle>
            <DialogDescription>
              Informe o motivo da recusa. A atlética será notificada por email.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {pendingRejectReservation ? (
              <div className="rounded-xl border border-border/50 bg-muted/30 p-3 text-sm">
                <p className="font-semibold text-foreground">
                  {pendingRejectReservation.event_name}
                </p>
                <p className="text-muted-foreground">
                  {format(
                    new Date(`${pendingRejectReservation.event_date}T12:00:00`),
                    "dd/MM/yyyy",
                    { locale: ptBR },
                  )}{" "}
                  • {pendingRejectReservation.team?.name ?? ""}
                </p>
              </div>
            ) : null}

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">
                Motivo da recusa
              </label>
              <textarea
                value={rejectionNotes}
                onChange={(event) => setRejectionNotes(event.target.value)}
                placeholder="Descreva o motivo da recusa (opcional)..."
                rows={3}
                className="app-input-field w-full resize-none rounded-xl border border-input bg-background/70 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPendingRejectReservation(null);
                setRejectionNotes("");
              }}
              disabled={reviewingReservationRequestId != null}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleConfirmRejectReservation()}
              disabled={reviewingReservationRequestId != null}
            >
              {reviewingReservationRequestId != null ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )}
              Recusar solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
