import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { IndividualSportStandingsTable } from "@/components/IndividualSportStandingsTable";
import { AdminListSkeleton } from "@/components/skeletons/AdminListSkeleton";
import { PageContentSkeleton } from "@/components/skeletons/PageContentSkeleton";
import {
  saveChampionshipAthlete,
  removeChampionshipAthlete,
  removeChampionshipIndividualEventEntry,
  saveChampionshipIndividualEvent,
  saveChampionshipIndividualEventEntry,
  saveChampionshipIndividualEventResults,
  syncChampionshipIndividualEventsFromSetup,
  syncChampionshipIndividualSessionsFromSetup,
} from "@/domain/individual-events/championshipIndividualEvents.repository";
import { useChampionshipIndividualEvents } from "@/hooks/useChampionshipIndividualEvents";
import {
  INDIVIDUAL_ENTRY_STATUS_LABELS,
  INDIVIDUAL_EVENT_KIND_LABELS,
  INDIVIDUAL_EVENT_STATUS_LABELS,
  isIndividualSportId,
  resolveIndividualSportIds,
} from "@/lib/individualEvents";
import {
  ChampionshipIndividualEntryStatus,
  ChampionshipIndividualEventStatus,
  ChampionshipSchedulePeriod,
  ChampionshipStatus,
  MatchNaipe,
  TeamDivision,
} from "@/lib/enums";
import type { Championship, Sport, Team } from "@/lib/types";

interface Props {
  selectedChampionship: Championship;
  sports: Sport[];
  teams: Team[];
  canManageIndividualEvents: boolean;
  usesDivisions: boolean;
}

const ALL_SPORTS_FILTER = "ALL_SPORTS_FILTER";
const ALL_NAIPE_FILTER = "ALL_NAIPE_FILTER";
const ALL_DIVISION_FILTER = "ALL_DIVISION_FILTER";

type EventDraftById = Record<
  string,
  {
    scheduled_date: string;
    period: ChampionshipSchedulePeriod | "NONE";
    location: string;
    status: ChampionshipIndividualEventStatus;
  }
>;

export function AdminIndividualEvents({
  selectedChampionship,
  sports,
  teams,
  canManageIndividualEvents,
  usesDivisions,
}: Props) {
  const individualSportIds = useMemo(
    () => resolveIndividualSportIds(sports),
    [sports],
  );
  const [sportFilter, setSportFilter] = useState<string>(ALL_SPORTS_FILTER);
  const [naipeFilter, setNaipeFilter] = useState<string>(ALL_NAIPE_FILTER);
  const [divisionFilter, setDivisionFilter] =
    useState<string>(ALL_DIVISION_FILTER);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [athleteName, setAthleteName] = useState("");
  const [athleteTeamId, setAthleteTeamId] = useState("");
  const [athleteSportId, setAthleteSportId] = useState("");
  const [athleteNaipe, setAthleteNaipe] = useState<MatchNaipe>(
    MatchNaipe.MASCULINO,
  );
  const [athleteDivision, setAthleteDivision] = useState<
    TeamDivision | "WITHOUT_DIVISION"
  >("WITHOUT_DIVISION");
  const [entryTeamId, setEntryTeamId] = useState("");
  const [entryAthleteId, setEntryAthleteId] = useState("");
  const [relayMemberIds, setRelayMemberIds] = useState<string[]>([]);
  const [relayStarterIds, setRelayStarterIds] = useState<string[]>([]);
  const [eventDraftById, setEventDraftById] = useState<EventDraftById>({});
  const [resultDraftByEntryId, setResultDraftByEntryId] = useState<
    Record<
      string,
      {
        status: ChampionshipIndividualEntryStatus;
        result_time_milliseconds: string;
        result_mark_centimeters: string;
      }
    >
  >({});
  const [saving, setSaving] = useState(false);

  const filteredSportId = sportFilter == ALL_SPORTS_FILTER ? null : sportFilter;
  const filteredNaipe =
    naipeFilter == ALL_NAIPE_FILTER ? null : (naipeFilter as MatchNaipe);
  const filteredDivision = !usesDivisions
    ? undefined
    : divisionFilter == ALL_DIVISION_FILTER
      ? undefined
      : divisionFilter == "WITHOUT_DIVISION"
        ? null
        : (divisionFilter as TeamDivision);

  const {
    events,
    sessions,
    athletes,
    entriesByEventId,
    standings,
    loading,
    refetch,
  } = useChampionshipIndividualEvents({
    championshipId: selectedChampionship.id,
    seasonYear: selectedChampionship.current_season_year,
    sportIds: individualSportIds,
    sportId: filteredSportId,
    naipe: filteredNaipe,
    division: filteredDivision,
  });

  const filteredTeams = useMemo(
    () => teams.filter((team) => team.is_active != false),
    [teams],
  );

  const selectedEvent = useMemo(
    () => events.find((event) => event.id == selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const selectedEventEntries = useMemo(() => {
    return selectedEvent ? (entriesByEventId[selectedEvent.id] ?? []) : [];
  }, [entriesByEventId, selectedEvent]);

  const canRecordSelectedEventResults = useMemo(() => {
    if (
      !canManageIndividualEvents ||
      selectedChampionship.status != ChampionshipStatus.IN_PROGRESS ||
      !selectedEvent
    ) {
      return false;
    }

    return sessions.some(
      (session) =>
        session.id == selectedEvent.session_id && session.status == "LIVE",
    );
  }, [
    canManageIndividualEvents,
    selectedChampionship.status,
    selectedEvent,
    sessions,
  ]);

  const athleteOptionsForEvent = useMemo(() => {
    if (!selectedEvent || !entryTeamId) {
      return [];
    }

    return athletes.filter((athlete) => {
      return (
        athlete.team_id == entryTeamId &&
        athlete.sport_id == selectedEvent.sport_id &&
        athlete.naipe == selectedEvent.naipe &&
        athlete.division == selectedEvent.division
      );
    });
  }, [athletes, entryTeamId, selectedEvent]);

  useEffect(() => {
    if (events.length == 0) {
      setSelectedEventId("");
      return;
    }

    if (events.some((event) => event.id == selectedEventId)) {
      return;
    }

    setSelectedEventId(events[0]!.id);
  }, [events, selectedEventId]);

  useEffect(() => {
    setEventDraftById(
      events.reduce<EventDraftById>((carry, event) => {
        carry[event.id] = {
          scheduled_date: event.scheduled_date ?? "",
          period: event.period ?? "NONE",
          location: event.location ?? "",
          status: event.status,
        };
        return carry;
      }, {}),
    );
  }, [events]);

  useEffect(() => {
    setResultDraftByEntryId(
      selectedEventEntries.reduce<
        Record<
          string,
          {
            status: ChampionshipIndividualEntryStatus;
            result_time_milliseconds: string;
            result_mark_centimeters: string;
          }
        >
      >((carry, entry) => {
        carry[entry.id] = {
          status: entry.status,
          result_time_milliseconds:
            entry.result_time_milliseconds != null
              ? String(entry.result_time_milliseconds)
              : "",
          result_mark_centimeters:
            entry.result_mark_centimeters != null
              ? String(entry.result_mark_centimeters)
              : "",
        };
        return carry;
      }, {}),
    );
  }, [selectedEventEntries]);

  const handleSyncOfficialEvents = async () => {
    setSaving(true);
    const [eventsResponse, sessionsResponse] = await Promise.all([
      syncChampionshipIndividualEventsFromSetup(
        selectedChampionship.id,
        selectedChampionship.current_season_year,
      ),
      syncChampionshipIndividualSessionsFromSetup(
        selectedChampionship.id,
        selectedChampionship.current_season_year,
      ),
    ]);
    setSaving(false);

    if (eventsResponse.error || sessionsResponse.error) {
      toast.error(
        eventsResponse.error?.message ??
          sessionsResponse.error?.message ??
          "Não foi possível sincronizar as provas e sessões oficiais.",
      );
      return;
    }

    toast.success(
      "Provas e sessões oficiais sincronizadas com a configuração do campeonato.",
    );
    await refetch();
  };

  const handleSaveEvent = async (eventId: string) => {
    const draft = eventDraftById[eventId];
    if (!draft) {
      return;
    }

    setSaving(true);
    const response = await saveChampionshipIndividualEvent({
      eventId,
      scheduledDate: draft.scheduled_date || null,
      period: draft.period == "NONE" ? null : draft.period,
      location: draft.location || null,
      status: draft.status,
    });
    setSaving(false);

    if (response.error) {
      toast.error(response.error.message);
      return;
    }

    toast.success("Prova atualizada.");
    await refetch();
  };

  const handleSaveAthlete = async () => {
    if (!athleteName.trim() || !athleteTeamId || !athleteSportId) {
      toast.error("Preencha nome, atlética e modalidade.");
      return;
    }

    setSaving(true);
    const response = await saveChampionshipAthlete({
      championshipId: selectedChampionship.id,
      seasonYear: selectedChampionship.current_season_year,
      sportId: athleteSportId,
      teamId: athleteTeamId,
      naipe: athleteNaipe,
      division:
        usesDivisions && athleteDivision != "WITHOUT_DIVISION"
          ? athleteDivision
          : null,
      name: athleteName,
    });
    setSaving(false);

    if (response.error) {
      toast.error(response.error.message);
      return;
    }

    setAthleteName("");
    toast.success("Atleta cadastrado.");
    await refetch();
  };

  const handleSaveEntry = async () => {
    if (!selectedEvent || !entryTeamId) {
      toast.error("Selecione a prova e a atlética.");
      return;
    }

    setSaving(true);
    const response = await saveChampionshipIndividualEventEntry({
      eventId: selectedEvent.id,
      teamId: entryTeamId,
      athleteId:
        selectedEvent.kind == "INDIVIDUAL" ? entryAthleteId || null : null,
      memberAthleteIds: selectedEvent.kind == "RELAY" ? relayMemberIds : [],
      starterAthleteIds: selectedEvent.kind == "RELAY" ? relayStarterIds : [],
    });
    setSaving(false);

    if (response.error) {
      toast.error(response.error.message);
      return;
    }

    setEntryAthleteId("");
    setRelayMemberIds([]);
    setRelayStarterIds([]);
    toast.success("Inscrição salva.");
    await refetch();
  };

  const handleSaveResults = async () => {
    if (!selectedEvent) {
      return;
    }

    setSaving(true);
    const response = await saveChampionshipIndividualEventResults(
      selectedEvent.id,
      selectedEventEntries.map((entry) => ({
        entry_id: entry.id,
        status:
          resultDraftByEntryId[entry.id]?.status ??
          ChampionshipIndividualEntryStatus.PENDING,
        result_time_milliseconds: resultDraftByEntryId[entry.id]
          ?.result_time_milliseconds
          ? Number(resultDraftByEntryId[entry.id]!.result_time_milliseconds)
          : null,
        result_mark_centimeters: resultDraftByEntryId[entry.id]
          ?.result_mark_centimeters
          ? Number(resultDraftByEntryId[entry.id]!.result_mark_centimeters)
          : null,
      })),
    );
    setSaving(false);

    if (response.error) {
      toast.error(response.error.message);
      return;
    }

    toast.success("Resultados confirmados.");
    await refetch();
  };

  const filteredAthletes = useMemo(() => {
    return athletes.filter((athlete) => {
      if (filteredSportId && athlete.sport_id != filteredSportId) {
        return false;
      }

      if (filteredNaipe && athlete.naipe != filteredNaipe) {
        return false;
      }

      if (
        filteredDivision !== undefined &&
        athlete.division != filteredDivision
      ) {
        return false;
      }

      return true;
    });
  }, [athletes, filteredDivision, filteredNaipe, filteredSportId]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (filteredSportId && event.sport_id != filteredSportId) {
        return false;
      }

      if (filteredNaipe && event.naipe != filteredNaipe) {
        return false;
      }

      if (
        filteredDivision !== undefined &&
        event.division != filteredDivision
      ) {
        return false;
      }

      return true;
    });
  }, [events, filteredDivision, filteredNaipe, filteredSportId]);

  return (
    <div className="space-y-6">
      <div className="glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Provas Individuais
          </p>
          <p className="text-xs text-muted-foreground">
            Atletismo e Natação operam fora do motor de jogos e alimentam a
            classificação geral do campeonato.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => void handleSyncOfficialEvents()}
          disabled={!canManageIndividualEvents || saving}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Sincronizar provas oficiais
        </Button>
      </div>

      <div
        className={`glass-panel grid gap-3 p-4 ${usesDivisions ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}
      >
        <Select value={sportFilter} onValueChange={setSportFilter}>
          <SelectTrigger className="app-input-field">
            <SelectValue placeholder="Modalidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SPORTS_FILTER}>
              Todas as modalidades
            </SelectItem>
            {sports
              .filter((sport) => isIndividualSportId(sport.id, sports))
              .map((sport) => (
                <SelectItem key={sport.id} value={sport.id}>
                  {sport.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Select value={naipeFilter} onValueChange={setNaipeFilter}>
          <SelectTrigger className="app-input-field">
            <SelectValue placeholder="Naipe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_NAIPE_FILTER}>Todos os naipes</SelectItem>
            <SelectItem value={MatchNaipe.MASCULINO}>Masculino</SelectItem>
            <SelectItem value={MatchNaipe.FEMININO}>Feminino</SelectItem>
            <SelectItem value={MatchNaipe.MISTO}>Misto</SelectItem>
          </SelectContent>
        </Select>

        {usesDivisions ? (
          <Select value={divisionFilter} onValueChange={setDivisionFilter}>
            <SelectTrigger className="app-input-field">
              <SelectValue placeholder="Divisão" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_DIVISION_FILTER}>
                Todas as divisões
              </SelectItem>
              <SelectItem value={TeamDivision.DIVISAO_PRINCIPAL}>
                Divisão Principal
              </SelectItem>
              <SelectItem value={TeamDivision.DIVISAO_ACESSO}>
                Divisão de Acesso
              </SelectItem>
              <SelectItem value="WITHOUT_DIVISION">Sem divisão</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <Tabs defaultValue="events" className="space-y-4">
        <TabsNavigationList className="grid w-full grid-cols-5">
          <TabsNavigationTrigger value="events">Provas</TabsNavigationTrigger>
          <TabsNavigationTrigger value="athletes">
            Atletas
          </TabsNavigationTrigger>
          <TabsNavigationTrigger value="entries">
            Inscrições
          </TabsNavigationTrigger>
          <TabsNavigationTrigger value="results">
            Resultados
          </TabsNavigationTrigger>
          <TabsNavigationTrigger value="standings">
            Classificação
          </TabsNavigationTrigger>
        </TabsNavigationList>

        <TabsContent value="events" className="space-y-3">
          {loading ? (
            <AdminListSkeleton count={4} showActions />
          ) : (
            filteredEvents.map((event) => (
              <div
                key={event.id}
                className="glass-panel grid gap-3 p-4 lg:grid-cols-[1.8fr_1fr_1fr_1fr_1fr_auto]"
              >
                <div>
                  <p className="font-display font-semibold">{event.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.sports?.name} • {event.naipe} •{" "}
                    {INDIVIDUAL_EVENT_KIND_LABELS[event.kind]}
                  </p>
                </div>
                <Input
                  type="date"
                  value={eventDraftById[event.id]?.scheduled_date ?? ""}
                  onChange={(currentEvent) => {
                    setEventDraftById((currentDraftById) => ({
                      ...currentDraftById,
                      [event.id]: {
                        ...(currentDraftById[event.id] ??
                          eventDraftById[event.id]),
                        scheduled_date: currentEvent.target.value,
                      },
                    }));
                  }}
                />
                <Select
                  value={eventDraftById[event.id]?.period ?? "NONE"}
                  onValueChange={(value) => {
                    setEventDraftById((currentDraftById) => ({
                      ...currentDraftById,
                      [event.id]: {
                        ...(currentDraftById[event.id] ??
                          eventDraftById[event.id]),
                        period: value as ChampionshipSchedulePeriod | "NONE",
                      },
                    }));
                  }}
                >
                  <SelectTrigger className="app-input-field">
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Sem período</SelectItem>
                    <SelectItem value={ChampionshipSchedulePeriod.MATUTINO}>
                      Matutino
                    </SelectItem>
                    <SelectItem value={ChampionshipSchedulePeriod.VESPERTINO}>
                      Vespertino
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Local"
                  value={eventDraftById[event.id]?.location ?? ""}
                  onChange={(currentEvent) => {
                    setEventDraftById((currentDraftById) => ({
                      ...currentDraftById,
                      [event.id]: {
                        ...(currentDraftById[event.id] ??
                          eventDraftById[event.id]),
                        location: currentEvent.target.value,
                      },
                    }));
                  }}
                />
                <Select
                  value={
                    eventDraftById[event.id]?.status ??
                    ChampionshipIndividualEventStatus.DRAFT
                  }
                  onValueChange={(value) => {
                    setEventDraftById((currentDraftById) => ({
                      ...currentDraftById,
                      [event.id]: {
                        ...(currentDraftById[event.id] ??
                          eventDraftById[event.id]),
                        status: value as ChampionshipIndividualEventStatus,
                      },
                    }));
                  }}
                >
                  <SelectTrigger className="app-input-field">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(INDIVIDUAL_EVENT_STATUS_LABELS).map(
                      ([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canManageIndividualEvents || saving}
                  onClick={() => void handleSaveEvent(event.id)}
                >
                  <Save className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="athletes" className="space-y-4">
          <div
            className={`glass-panel grid gap-3 p-4 ${usesDivisions ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}
          >
            <div className={usesDivisions ? "lg:col-span-2" : "lg:col-span-2"}>
              <Label>Nome</Label>
              <Input
                value={athleteName}
                onChange={(currentEvent) =>
                  setAthleteName(currentEvent.target.value)
                }
              />
            </div>
            <div>
              <Label>Atlética</Label>
              <Select value={athleteTeamId} onValueChange={setAthleteTeamId}>
                <SelectTrigger className="app-input-field">
                  <SelectValue placeholder="Atlética" />
                </SelectTrigger>
                <SelectContent>
                  {filteredTeams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Modalidade</Label>
              <Select value={athleteSportId} onValueChange={setAthleteSportId}>
                <SelectTrigger className="app-input-field">
                  <SelectValue placeholder="Modalidade" />
                </SelectTrigger>
                <SelectContent>
                  {sports
                    .filter((sport) => isIndividualSportId(sport.id, sports))
                    .map((sport) => (
                      <SelectItem key={sport.id} value={sport.id}>
                        {sport.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Naipe</Label>
              <Select
                value={athleteNaipe}
                onValueChange={(value) => setAthleteNaipe(value as MatchNaipe)}
              >
                <SelectTrigger className="app-input-field">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={MatchNaipe.MASCULINO}>
                    Masculino
                  </SelectItem>
                  <SelectItem value={MatchNaipe.FEMININO}>Feminino</SelectItem>
                  <SelectItem value={MatchNaipe.MISTO}>Misto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {usesDivisions ? (
              <div>
                <Label>Divisão</Label>
                <Select
                  value={athleteDivision}
                  onValueChange={(value) =>
                    setAthleteDivision(
                      value as TeamDivision | "WITHOUT_DIVISION",
                    )
                  }
                >
                  <SelectTrigger className="app-input-field">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WITHOUT_DIVISION">
                      Sem divisão
                    </SelectItem>
                    <SelectItem value={TeamDivision.DIVISAO_PRINCIPAL}>
                      Principal
                    </SelectItem>
                    <SelectItem value={TeamDivision.DIVISAO_ACESSO}>
                      Acesso
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <Button
              type="button"
              onClick={() => void handleSaveAthlete()}
              disabled={!canManageIndividualEvents || saving}
            >
              <Save className="h-4 w-4" />
              Cadastrar
            </Button>
          </div>

          <div className="space-y-2">
            {loading ? (
              <AdminListSkeleton count={5} />
            ) : (
              filteredAthletes.map((athlete) => (
                <div
                  key={athlete.id}
                  className="glass-panel flex items-center justify-between gap-3 p-3"
                >
                  <div>
                    <p className="font-medium">{athlete.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {athlete.teams?.name} • {athlete.sports?.name} •{" "}
                      {athlete.naipe}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={!canManageIndividualEvents || saving}
                    onClick={async () => {
                      setSaving(true);
                      const response = await removeChampionshipAthlete(
                        athlete.id,
                      );
                      setSaving(false);
                      if (response.error) {
                        toast.error(response.error.message);
                        return;
                      }
                      await refetch();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="entries" className="space-y-4">
          {loading ? (
            <PageContentSkeleton filterCount={3} contentCount={2} />
          ) : (
            <div className="glass-panel grid gap-3 p-4 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <Label>Prova</Label>
                <Select
                  value={selectedEventId}
                  onValueChange={setSelectedEventId}
                >
                  <SelectTrigger className="app-input-field">
                    <SelectValue placeholder="Prova" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredEvents.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.name} • {event.naipe}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Atlética</Label>
                <Select value={entryTeamId} onValueChange={setEntryTeamId}>
                  <SelectTrigger className="app-input-field">
                    <SelectValue placeholder="Atlética" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredTeams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedEvent?.kind == "INDIVIDUAL" ? (
                <div>
                  <Label>Atleta</Label>
                  <Select
                    value={entryAthleteId}
                    onValueChange={setEntryAthleteId}
                  >
                    <SelectTrigger className="app-input-field">
                      <SelectValue placeholder="Atleta" />
                    </SelectTrigger>
                    <SelectContent>
                      {athleteOptionsForEvent.map((athlete) => (
                        <SelectItem key={athlete.id} value={athlete.id}>
                          {athlete.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <Button
                type="button"
                onClick={() => void handleSaveEntry()}
                disabled={!canManageIndividualEvents || saving}
              >
                <Save className="h-4 w-4" />
                Salvar inscrição
              </Button>
            </div>
          )}

          {!loading &&
          selectedEvent?.kind == "RELAY" &&
          athleteOptionsForEvent.length > 0 ? (
            <div className="glass-panel space-y-4 p-4">
              <div>
                <p className="text-sm font-semibold">
                  Inscritos do revezamento
                </p>
                <p className="text-xs text-muted-foreground">
                  Selecione até 6 inscritos e marque 4 titulares finais.
                </p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {athleteOptionsForEvent.map((athlete) => {
                  const checked = relayMemberIds.includes(athlete.id);
                  const starterChecked = relayStarterIds.includes(athlete.id);

                  return (
                    <div
                      key={athlete.id}
                      className="rounded-2xl border border-border/60 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <Label className="flex items-center gap-2">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(nextChecked) => {
                              setRelayMemberIds((currentMemberIds) => {
                                if (nextChecked) {
                                  return [
                                    ...currentMemberIds,
                                    athlete.id,
                                  ].slice(0, 6);
                                }

                                return currentMemberIds.filter(
                                  (memberId) => memberId != athlete.id,
                                );
                              });
                              if (!nextChecked) {
                                setRelayStarterIds((currentStarterIds) =>
                                  currentStarterIds.filter(
                                    (starterId) => starterId != athlete.id,
                                  ),
                                );
                              }
                            }}
                          />
                          {athlete.name}
                        </Label>
                        <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Checkbox
                            checked={starterChecked}
                            disabled={!checked}
                            onCheckedChange={(nextChecked) => {
                              setRelayStarterIds((currentStarterIds) => {
                                if (!checked) {
                                  return currentStarterIds;
                                }

                                if (nextChecked) {
                                  return [
                                    ...currentStarterIds,
                                    athlete.id,
                                  ].slice(0, 4);
                                }

                                return currentStarterIds.filter(
                                  (starterId) => starterId != athlete.id,
                                );
                              });
                            }}
                          />
                          Titular
                        </Label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!loading ? (
            <div className="space-y-2">
              {selectedEventEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="glass-panel flex items-center justify-between gap-3 p-3"
                >
                  <div>
                    <p className="font-medium">{entry.teams?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.athlete_name ??
                        entry.members
                          ?.map((member) => member.athlete_name)
                          .join(", ") ??
                        "-"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={!canManageIndividualEvents || saving}
                    onClick={async () => {
                      setSaving(true);
                      const response =
                        await removeChampionshipIndividualEventEntry(entry.id);
                      setSaving(false);
                      if (response.error) {
                        toast.error(response.error.message);
                        return;
                      }
                      await refetch();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          {loading ? (
            <PageContentSkeleton filterCount={2} contentCount={3} />
          ) : (
            <div className="glass-panel grid gap-3 p-4 lg:grid-cols-[2fr_1fr_auto]">
              <div>
                <Label>Prova</Label>
                <Select
                  value={selectedEventId}
                  onValueChange={setSelectedEventId}
                >
                  <SelectTrigger className="app-input-field">
                    <SelectValue placeholder="Prova" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredEvents.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.name} • {event.naipe}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={() => void handleSaveResults()}
                  disabled={
                    !canRecordSelectedEventResults || saving || !selectedEvent
                  }
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Confirmar resultados
                </Button>
              </div>
            </div>
          )}

          {!loading ? (
            <div className="space-y-2">
              {selectedEventEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="glass-panel grid gap-3 p-4 lg:grid-cols-[2fr_1fr_1fr]"
                >
                  <div>
                    <p className="font-medium">{entry.teams?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.athlete_name ??
                        entry.members
                          ?.filter((member) => member.is_starter)
                          .map((member) => member.athlete_name)
                          .join(", ") ??
                        "-"}
                    </p>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select
                      value={
                        resultDraftByEntryId[entry.id]?.status ??
                        ChampionshipIndividualEntryStatus.PENDING
                      }
                      disabled={!canRecordSelectedEventResults || saving}
                      onValueChange={(value) => {
                        setResultDraftByEntryId(
                          (currentResultDraftByEntryId) => ({
                            ...currentResultDraftByEntryId,
                            [entry.id]: {
                              ...(currentResultDraftByEntryId[entry.id] ?? {
                                status:
                                  ChampionshipIndividualEntryStatus.PENDING,
                                result_time_milliseconds: "",
                                result_mark_centimeters: "",
                              }),
                              status:
                                value as ChampionshipIndividualEntryStatus,
                            },
                          }),
                        );
                      }}
                    >
                      <SelectTrigger className="app-input-field">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(INDIVIDUAL_ENTRY_STATUS_LABELS).map(
                          ([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>
                      {selectedEvent?.event_code == "ATHLETICS_SHOT_PUT" ||
                      selectedEvent?.event_code == "ATHLETICS_LONG_JUMP"
                        ? "Marca (cm)"
                        : "Tempo (ms)"}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      disabled={!canRecordSelectedEventResults || saving}
                      value={
                        selectedEvent?.event_code == "ATHLETICS_SHOT_PUT" ||
                        selectedEvent?.event_code == "ATHLETICS_LONG_JUMP"
                          ? (resultDraftByEntryId[entry.id]
                              ?.result_mark_centimeters ?? "")
                          : (resultDraftByEntryId[entry.id]
                              ?.result_time_milliseconds ?? "")
                      }
                      onChange={(currentEvent) => {
                        setResultDraftByEntryId(
                          (currentResultDraftByEntryId) => ({
                            ...currentResultDraftByEntryId,
                            [entry.id]: {
                              ...(currentResultDraftByEntryId[entry.id] ?? {
                                status:
                                  ChampionshipIndividualEntryStatus.PENDING,
                                result_time_milliseconds: "",
                                result_mark_centimeters: "",
                              }),
                              result_time_milliseconds:
                                selectedEvent?.event_code ==
                                  "ATHLETICS_SHOT_PUT" ||
                                selectedEvent?.event_code ==
                                  "ATHLETICS_LONG_JUMP"
                                  ? ""
                                  : currentEvent.target.value,
                              result_mark_centimeters:
                                selectedEvent?.event_code ==
                                  "ATHLETICS_SHOT_PUT" ||
                                selectedEvent?.event_code ==
                                  "ATHLETICS_LONG_JUMP"
                                  ? currentEvent.target.value
                                  : "",
                            },
                          }),
                        );
                      }}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      A classificação é calculada automaticamente pela métrica
                      informada.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="standings">
          <IndividualSportStandingsTable
            standings={standings}
            isLoading={loading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
