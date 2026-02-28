import { useMemo, useState } from "react";
import { addMonths, format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLeagueEvents } from "@/hooks/useLeagueEvents";
import type { Team, LeagueEvent } from "@/lib/types";
import { LeagueEventType } from "@/lib/enums";
import {
  LEAGUE_EVENT_TYPE_BADGE_CLASS_NAMES,
  LEAGUE_EVENT_TYPE_LABELS,
  isLeagueEventType,
} from "@/domain/league-events/leagueEvent.constants";
import type { LeagueEventFormValues } from "@/domain/league-events/leagueEvent.types";
import { LeagueEventSaveDTO } from "@/domain/league-events/LeagueEventSaveDTO";
import { createLeagueEvent, deleteLeagueEvent, updateLeagueEvent } from "@/domain/league-events/leagueEvent.repository";

interface Props {
  teams: Team[];
}

function resolveDefaultFormValues(): LeagueEventFormValues {
  return {
    name: "",
    eventType: LeagueEventType.HH,
    organizerTeamId: null,
    location: "",
    eventDate: null,
  };
}

function resolveFormValuesFromLeagueEvent(leagueEvent: LeagueEvent): LeagueEventFormValues {
  return {
    name: leagueEvent.name,
    eventType: leagueEvent.event_type,
    organizerTeamId: leagueEvent.organizer_team_id,
    location: leagueEvent.location,
    eventDate: new Date(`${leagueEvent.event_date}T12:00:00`),
  };
}

export function AdminLeagueEvents({ teams }: Props) {
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
        nextFormValues.organizerTeamId = null;
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
        nextFormValues.organizerTeamId = null;
      }

      return nextFormValues;
    });
  };

  const handleCreateLeagueEvent = async () => {
    try {
      const leagueEventSaveDTO = LeagueEventSaveDTO.fromFormValues(createFormValues);
      const payload = leagueEventSaveDTO.bindToSave();
      const { data, error } = await createLeagueEvent(payload);

      if (error) {
        toast.error(error.message);
        return;
      }

      if (data) {
        upsertLeagueEvent(data as unknown as LeagueEvent);
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
    setEditingEventId(leagueEvent.id);
    setEditingFormValues(resolveFormValuesFromLeagueEvent(leagueEvent));
  };

  const handleCancelEditEvent = () => {
    setEditingEventId(null);
    setEditingFormValues(resolveDefaultFormValues());
  };

  const handleSaveEditEvent = async (leagueEventId: string) => {
    try {
      const leagueEventSaveDTO = LeagueEventSaveDTO.fromFormValues(editingFormValues);
      const payload = leagueEventSaveDTO.bindToSave();
      const { data, error } = await updateLeagueEvent(leagueEventId, payload);

      if (error) {
        toast.error(error.message);
        return;
      }

      if (data) {
        upsertLeagueEvent(data as unknown as LeagueEvent);
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
      <div className="enter-section flex flex-wrap items-center justify-between gap-2 glass-card px-4 py-3">
        <div>
          <p className="text-sm font-medium">Eventos da Liga</p>
          <p className="text-xs text-muted-foreground">Gestão mensal dos eventos públicos da liga.</p>
        </div>

        <div className="flex items-center gap-2">
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

      <div className="enter-section grid gap-2 glass-card p-4 lg:grid-cols-[minmax(0,1.4fr)_170px_minmax(0,1.15fr)_minmax(0,1fr)_220px_auto]">
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
          <Select
            value={createFormValues.organizerTeamId ?? ""}
            onValueChange={(value) => handleChangeCreateField("organizerTeamId", value)}
          >
            <SelectTrigger className="glass-input">
              <SelectValue placeholder="Selecione a atlética" />
            </SelectTrigger>
            <SelectContent>
              {orderedTeams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

      {loading ? (
        <div className="enter-section flex min-h-28 items-center justify-center glass-card">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {leagueEvents.map((leagueEvent) => {
          const isEditing = editingEventId == leagueEvent.id;
          const formValues = isEditing ? editingFormValues : resolveFormValuesFromLeagueEvent(leagueEvent);
          const organizerName =
            leagueEvent.event_type == LeagueEventType.LAJE_EVENT
              ? "LAJE"
              : (leagueEvent.organizer_team?.name ?? "Atlética");

          return (
            <div key={leagueEvent.id} className="enter-item space-y-3 glass-card p-4">
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
                      <Select
                        value={formValues.organizerTeamId ?? ""}
                        onValueChange={(value) => handleChangeEditField("organizerTeamId", value)}
                      >
                        <SelectTrigger className="h-8 glass-input">
                          <SelectValue placeholder="Selecione a atlética" />
                        </SelectTrigger>
                        <SelectContent>
                          {orderedTeams.map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              {team.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                  <>
                    <p className="text-sm text-muted-foreground">Organizado por: {organizerName}</p>
                    <p className="text-sm text-muted-foreground">Local: {leagueEvent.location}</p>
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-1">
                {isEditing ? (
                  <>
                    <Button variant="ghost" size="icon" onClick={() => handleSaveEditEvent(leagueEvent.id)}>
                      <Save className="h-4 w-4 text-primary" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleCancelEditEvent}>
                      <X className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="icon" onClick={() => handleStartEditEvent(leagueEvent)}>
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                )}

                <Button variant="ghost" size="icon" onClick={() => handleDeleteEvent(leagueEvent.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
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
