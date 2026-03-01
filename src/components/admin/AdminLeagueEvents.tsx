import { useMemo, useState } from "react";
import { addMonths, format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLeagueEvents } from "@/hooks/useLeagueEvents";
import type { Team, LeagueEvent } from "@/lib/types";
import { LeagueEventType } from "@/lib/enums";
import { TEAM_DIVISION_LABELS } from "@/lib/championship";
import { cn } from "@/lib/utils";
import {
  LEAGUE_EVENT_TYPE_BADGE_CLASS_NAMES,
  LEAGUE_EVENT_TYPE_LABELS,
  isLeagueEventType,
} from "@/domain/league-events/leagueEvent.constants";
import {
  resolveLeagueEventOrganizerName,
  resolveLeagueEventOrganizerTeamIds,
} from "@/domain/league-events/leagueEvent.helpers";
import type { LeagueEventFormValues } from "@/domain/league-events/leagueEvent.types";
import { LeagueEventSaveDTO } from "@/domain/league-events/LeagueEventSaveDTO";
import { createLeagueEvent, deleteLeagueEvent, updateLeagueEvent } from "@/domain/league-events/leagueEvent.repository";

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

function resolveDefaultFormValues(): LeagueEventFormValues {
  return {
    name: "",
    eventType: LeagueEventType.HH,
    organizerTeamIds: [],
    location: "",
    eventDate: null,
  };
}

function resolveFormValuesFromLeagueEvent(leagueEvent: LeagueEvent): LeagueEventFormValues {
  return {
    name: leagueEvent.name,
    eventType: leagueEvent.event_type,
    organizerTeamIds: resolveLeagueEventOrganizerTeamIds(leagueEvent),
    location: leagueEvent.location,
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

  const selectedOrganizerLabel = selectedTeamNames.length == 0 ? placeholder : selectedTeamNames.join(" + ");

  const handleToggleTeam = (teamId: string) => {
    const nextOrganizerTeamIds = selectedOrganizerTeamIds.includes(teamId)
      ? selectedOrganizerTeamIds.filter((organizerTeamId) => organizerTeamId != teamId)
      : [...selectedOrganizerTeamIds, teamId];

    const orderedOrganizerTeamIds = orderedTeams
      .map((team) => team.id)
      .filter((organizerTeamId) => nextOrganizerTeamIds.includes(organizerTeamId));

    onSelectionChange(orderedOrganizerTeamIds);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("glass-input w-full justify-between overflow-hidden text-left text-sm font-normal", triggerClassName)}
        >
          <span className="truncate">{selectedOrganizerLabel}</span>
          <span className="ml-2 shrink-0 text-xs text-muted-foreground">
            {selectedOrganizerTeamIds.length > 0 ? `${selectedOrganizerTeamIds.length} selecionada(s)` : ""}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] border-white/45 bg-white/80 p-3 backdrop-blur-xl" align="start">
        <div className="max-h-60 space-y-1 overflow-y-auto pr-1">
          {orderedTeams.map((team) => (
            <label
              key={team.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-secondary/20"
            >
              <Checkbox
                checked={selectedOrganizerTeamIds.includes(team.id)}
                onCheckedChange={() => handleToggleTeam(team.id)}
              />
              <span className="min-w-0 flex-1 truncate">{team.name}</span>
              <span className="text-[11px] text-muted-foreground">
                {team.division ? TEAM_DIVISION_LABELS[team.division] : "Sem divisão"}
              </span>
            </label>
          ))}
        </div>

        <div className="mt-3 flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => onSelectionChange([])}>
            Limpar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AdminLeagueEvents({ teams, canManageLeagueEvents = true }: Props) {
  const [selectedMonthDate, setSelectedMonthDate] = useState(new Date());
  const { leagueEvents, loading, upsertLeagueEvent, removeLeagueEvent } = useLeagueEvents({ monthDate: selectedMonthDate });

  const [createFormValues, setCreateFormValues] = useState<LeagueEventFormValues>(resolveDefaultFormValues());
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingFormValues, setEditingFormValues] = useState<LeagueEventFormValues>(resolveDefaultFormValues());

  const orderedTeams = useMemo(() => {
    return [...teams].sort((firstTeam, secondTeam) => firstTeam.name.localeCompare(secondTeam.name));
  }, [teams]);

  const monthControlClassName = "glass-input h-9 rounded-xl text-secondary-foreground";

  const handleChangeCreateField = <FieldName extends keyof LeagueEventFormValues>(
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

  const handleCreateLeagueEvent = async () => {
    if (!canManageLeagueEvents) {
      return;
    }

    try {
      const leagueEventSaveDTO = LeagueEventSaveDTO.fromFormValues(createFormValues);
      const payload = leagueEventSaveDTO.bindToSave();
      const organizerTeamIds = leagueEventSaveDTO.resolveOrganizerTeamIds();
      const { data, error } = await createLeagueEvent(payload, organizerTeamIds);

      if (error) {
        toast.error(error.message);
        return;
      }

      if (data) {
        upsertLeagueEvent(data as LeagueEvent);
      }

      toast.success("Evento criado com sucesso.");
      setCreateFormValues(resolveDefaultFormValues());
      setSelectedMonthDate(new Date(`${payload.event_date}T12:00:00`));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Não foi possível criar o evento.";
      toast.error(errorMessage);
    }
  };

  const handleStartEditEvent = (leagueEvent: LeagueEvent) => {
    if (!canManageLeagueEvents) {
      return;
    }

    setEditingEventId(leagueEvent.id);
    setEditingFormValues(resolveFormValuesFromLeagueEvent(leagueEvent));
  };

  const handleCancelEditEvent = () => {
    setEditingEventId(null);
    setEditingFormValues(resolveDefaultFormValues());
  };

  const handleSaveEditEvent = async (leagueEventId: string) => {
    if (!canManageLeagueEvents) {
      return;
    }

    try {
      const leagueEventSaveDTO = LeagueEventSaveDTO.fromFormValues(editingFormValues);
      const payload = leagueEventSaveDTO.bindToSave();
      const organizerTeamIds = leagueEventSaveDTO.resolveOrganizerTeamIds();
      const { data, error } = await updateLeagueEvent(leagueEventId, payload, organizerTeamIds);

      if (error) {
        toast.error(error.message);
        return;
      }

      if (data) {
        upsertLeagueEvent(data as LeagueEvent);
      }

      toast.success("Evento atualizado com sucesso.");
      handleCancelEditEvent();
      setSelectedMonthDate(new Date(`${payload.event_date}T12:00:00`));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Não foi possível atualizar o evento.";
      toast.error(errorMessage);
    }
  };

  const handleDeleteEvent = async (leagueEventId: string) => {
    if (!canManageLeagueEvents) {
      return;
    }

    const { error } = await deleteLeagueEvent(leagueEventId);

    if (error) {
      toast.error(error.message);
      return;
    }

    removeLeagueEvent(leagueEventId);
    toast.success("Evento removido com sucesso.");
  };

  return (
    <div className="space-y-6">
      <div className="enter-section flex flex-col items-center gap-3 glass-card px-4 py-3 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Eventos da Liga</p>
          <p className="text-xs text-muted-foreground">Gestão mensal dos eventos públicos da liga.</p>
        </div>

        <div className="flex w-full items-center justify-center gap-2 sm:w-auto sm:justify-end">
          <Button
            variant="outline"
            size="icon"
            className={monthControlClassName}
            aria-label="Mês anterior"
            onClick={() => setSelectedMonthDate((date) => subMonths(date, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Badge
            variant="outline"
            className={`${monthControlClassName} min-w-40 justify-center px-4 text-sm font-medium capitalize`}
          >
            {format(selectedMonthDate, "MMMM 'de' yyyy", { locale: ptBR })}
          </Badge>
          <Button
            variant="outline"
            size="icon"
            className={monthControlClassName}
            aria-label="Próximo mês"
            onClick={() => setSelectedMonthDate((date) => addMonths(date, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {canManageLeagueEvents ? (
        <div className="enter-section grid gap-2 glass-card p-4 lg:grid-cols-[minmax(0,1.2fr)_170px_minmax(0,1.4fr)_minmax(0,1fr)_220px_auto]">
          <Input
            value={createFormValues.name}
            onChange={(event) => handleChangeCreateField("name", event.target.value)}
            placeholder="Nome do evento"
            className="glass-input"
          />

          <Select
            value={createFormValues.eventType}
            onValueChange={(value) => {
              if (isLeagueEventType(value)) {
                handleChangeCreateField("eventType", value);
              }
            }}
          >
            <SelectTrigger className="glass-input">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LeagueEventType.HH}>{LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.HH]}</SelectItem>
              <SelectItem value={LeagueEventType.OPEN_BAR}>{LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.OPEN_BAR]}</SelectItem>
              <SelectItem value={LeagueEventType.CHAMPIONSHIP}>{LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.CHAMPIONSHIP]}</SelectItem>
              <SelectItem value={LeagueEventType.LAJE_EVENT}>{LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.LAJE_EVENT]}</SelectItem>
            </SelectContent>
          </Select>

          {createFormValues.eventType == LeagueEventType.LAJE_EVENT ? (
            <Input value="LAJE" readOnly disabled className="glass-input" />
          ) : (
            <OrganizerTeamsSelector
              orderedTeams={orderedTeams}
              selectedOrganizerTeamIds={createFormValues.organizerTeamIds}
              onSelectionChange={(value) => handleChangeCreateField("organizerTeamIds", value)}
              placeholder="Selecione as atléticas"
            />
          )}

          <Input
            value={createFormValues.location}
            onChange={(event) => handleChangeCreateField("location", event.target.value)}
            placeholder="Local do evento"
            className="glass-input"
          />

          <DateTimePicker
            value={createFormValues.eventDate}
            onChange={(value) => handleChangeCreateField("eventDate", value)}
            placeholder="Data do evento"
            showTime={false}
          />

          <Button onClick={handleCreateLeagueEvent} className="w-full lg:w-auto">
            <Plus className="mr-1 h-4 w-4" /> Adicionar evento
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Perfil em visualização: sem permissão para criar ou editar eventos.</p>
      )}

      {loading ? (
        <div className="enter-section flex min-h-28 items-center justify-center glass-card">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {leagueEvents.map((leagueEvent) => {
          const isEditing = editingEventId == leagueEvent.id;
          const formValues = isEditing ? editingFormValues : resolveFormValuesFromLeagueEvent(leagueEvent);
          const organizerName = resolveLeagueEventOrganizerName(leagueEvent);

          return (
            <div key={leagueEvent.id} className="enter-item glass-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      {isEditing ? (
                        <Input
                          value={formValues.name}
                          onChange={(event) => handleChangeEditField("name", event.target.value)}
                          className="h-8 glass-input"
                        />
                      ) : (
                        <p className="font-display font-semibold">{leagueEvent.name}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(`${leagueEvent.event_date}T12:00:00`), "dd/MM/yyyy")}
                      </p>
                    </div>

                    <Badge className={LEAGUE_EVENT_TYPE_BADGE_CLASS_NAMES[leagueEvent.event_type]}>
                      {LEAGUE_EVENT_TYPE_LABELS[leagueEvent.event_type]}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {isEditing ? (
                      <>
                        <Select
                          value={formValues.eventType}
                          onValueChange={(value) => {
                            if (isLeagueEventType(value)) {
                              handleChangeEditField("eventType", value);
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 glass-input">
                            <SelectValue placeholder="Tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={LeagueEventType.HH}>{LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.HH]}</SelectItem>
                            <SelectItem value={LeagueEventType.OPEN_BAR}>{LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.OPEN_BAR]}</SelectItem>
                            <SelectItem value={LeagueEventType.CHAMPIONSHIP}>{LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.CHAMPIONSHIP]}</SelectItem>
                            <SelectItem value={LeagueEventType.LAJE_EVENT}>{LEAGUE_EVENT_TYPE_LABELS[LeagueEventType.LAJE_EVENT]}</SelectItem>
                          </SelectContent>
                        </Select>

                        {formValues.eventType == LeagueEventType.LAJE_EVENT ? (
                          <Input value="LAJE" readOnly disabled className="h-8 glass-input" />
                        ) : (
                          <OrganizerTeamsSelector
                            orderedTeams={orderedTeams}
                            selectedOrganizerTeamIds={formValues.organizerTeamIds}
                            onSelectionChange={(value) => handleChangeEditField("organizerTeamIds", value)}
                            placeholder="Selecione as atléticas"
                            triggerClassName="h-8 w-full"
                          />
                        )}

                        <Input
                          value={formValues.location}
                          onChange={(event) => handleChangeEditField("location", event.target.value)}
                          className="h-8 glass-input"
                          placeholder="Local do evento"
                        />

                        <DateTimePicker
                          value={formValues.eventDate}
                          onChange={(value) => handleChangeEditField("eventDate", value)}
                          placeholder="Data do evento"
                          showTime={false}
                          className="h-8"
                        />
                      </>
                    ) : (
                      <div className="mt-2 space-y-0.5 border-t border-white/35 pt-2">
                        <p className="text-sm text-muted-foreground">Organizado por: {organizerName}</p>
                        <p className="text-sm text-muted-foreground">Local: {leagueEvent.location}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-center gap-1 self-start">
                  {canManageLeagueEvents && isEditing ? (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => handleSaveEditEvent(leagueEvent.id)}>
                        <Save className="h-4 w-4 text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={handleCancelEditEvent}>
                        <X className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </>
                  ) : canManageLeagueEvents ? (
                    <Button variant="ghost" size="icon" onClick={() => handleStartEditEvent(leagueEvent)}>
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  ) : null}

                  {canManageLeagueEvents ? (
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteEvent(leagueEvent.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && leagueEvents.length == 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum evento cadastrado para este mês.</p>
      ) : null}
    </div>
  );
}
