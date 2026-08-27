import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  saveChampionshipAthlete,
  saveChampionshipIndividualEventLiveResults,
} from "@/domain/individual-events/championshipIndividualEvents.repository";
import { INDIVIDUAL_ENTRY_STATUS_LABELS } from "@/lib/individualEvents";
import {
  ChampionshipIndividualEntryStatus,
  ChampionshipIndividualEventKind,
} from "@/lib/enums";
import type {
  ChampionshipAthlete,
  ChampionshipIndividualEvent,
  ChampionshipIndividualEventEntry,
  ChampionshipIndividualSession,
  Team,
} from "@/lib/types";

interface LiveEntryDraft {
  key: string;
  entryId: string | null;
  teamId: string;
  athleteId: string;
  starterAthleteIds: Array<string | null>;
  laneNumber: string;
  status: ChampionshipIndividualEntryStatus;
  resultTimeMilliseconds: string;
  attemptOneCentimeters: string;
  attemptTwoCentimeters: string;
  attemptThreeCentimeters: string;
}

function isMeasurementEvent(eventCode: string) {
  return eventCode == "ATHLETICS_SHOT_PUT" || eventCode == "ATHLETICS_LONG_JUMP";
}

function emptyDraft(index: number): LiveEntryDraft {
  return {
    key: `new-${Date.now()}-${index}`,
    entryId: null,
    teamId: "",
    athleteId: "",
    starterAthleteIds: [],
    laneNumber: String(index + 1),
    status: ChampionshipIndividualEntryStatus.PENDING,
    resultTimeMilliseconds: "",
    attemptOneCentimeters: "",
    attemptTwoCentimeters: "",
    attemptThreeCentimeters: "",
  };
}

function entryDraft(
  entry: ChampionshipIndividualEventEntry,
  index: number,
  isRelay: boolean,
): LiveEntryDraft {
  return {
    ...emptyDraft(index),
    key: entry.id,
    entryId: entry.id,
    teamId: entry.team_id,
    athleteId: entry.athlete_id ?? "",
    starterAthleteIds: isRelay
      ? (entry.members ?? [])
          .filter((member) => member.is_starter && member.athlete_id)
          .map((member) => member.athlete_id as string)
      : [],
    laneNumber: entry.lane_number?.toString() ?? String(index + 1),
    status: entry.status,
    resultTimeMilliseconds: entry.result_time_milliseconds?.toString() ?? "",
    attemptOneCentimeters: entry.attempt_one_centimeters?.toString() ?? "",
    attemptTwoCentimeters: entry.attempt_two_centimeters?.toString() ?? "",
    attemptThreeCentimeters: entry.attempt_three_centimeters?.toString() ?? "",
  };
}

export function AdminIndividualSessionResultsDialog({
  open,
  onOpenChange,
  session,
  events,
  entries,
  athletes,
  teams,
  canManage,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ChampionshipIndividualSession | null;
  events: ChampionshipIndividualEvent[];
  entries: ChampionshipIndividualEventEntry[];
  athletes: ChampionshipAthlete[];
  teams: Team[];
  canManage: boolean;
  onSaved: () => Promise<void>;
}) {
  const [selectedEventId, setSelectedEventId] = useState("");
  const [drafts, setDrafts] = useState<LiveEntryDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [createdAthletes, setCreatedAthletes] = useState<ChampionshipAthlete[]>([]);
  const [newAthleteNameByDraftKey, setNewAthleteNameByDraftKey] = useState<Record<string, string>>({});
  const selectedEvent = useMemo(
    () => events.find((event) => event.id == selectedEventId) ?? events[0] ?? null,
    [events, selectedEventId],
  );
  const isRelay = selectedEvent?.kind == ChampionshipIndividualEventKind.RELAY;
  const eventEntries = useMemo(
    () => entries.filter((entry) => entry.event_id == selectedEvent?.id),
    [entries, selectedEvent],
  );
  const activeTeams = useMemo(
    () => teams.filter((team) => team.is_active != false).sort((left, right) => left.name.localeCompare(right.name, "pt-BR")),
    [teams],
  );
  const availableAthletes = useMemo(() => {
    if (!selectedEvent) return [];

    return [...athletes, ...createdAthletes]
      .filter((athlete) =>
        athlete.championship_id == selectedEvent.championship_id &&
        athlete.season_year == selectedEvent.season_year &&
        athlete.sport_id == selectedEvent.sport_id &&
        athlete.naipe == selectedEvent.naipe &&
        athlete.division == selectedEvent.division,
      )
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  }, [athletes, createdAthletes, selectedEvent]);

  useEffect(() => {
    if (open && !events.some((event) => event.id == selectedEventId)) {
      setSelectedEventId(events[0]?.id ?? "");
    }
  }, [events, open, selectedEventId]);

  useEffect(() => {
    setDrafts(eventEntries.map((entry, index) => entryDraft(entry, index, isRelay)));
  }, [eventEntries, isRelay]);

  const updateDraft = (key: string, patch: Partial<LiveEntryDraft>) => {
    setDrafts((current) => current.map((draft) => draft.key == key ? { ...draft, ...patch } : draft));
  };

  const selectRelayStarter = (draft: LiveEntryDraft, index: number, athleteId: string) => {
    const starterAthleteIds = Array.from(
      { length: 4 },
      (_, starterIndex) => draft.starterAthleteIds[starterIndex] ?? null,
    );
    starterAthleteIds[index] = athleteId;
    updateDraft(draft.key, { starterAthleteIds });
  };

  const createAthlete = async (draft: LiveEntryDraft) => {
    if (!selectedEvent || !draft.teamId) {
      toast.error("Selecione a atlética antes de cadastrar o atleta.");
      return;
    }
    const name = newAthleteNameByDraftKey[draft.key]?.trim() ?? "";
    if (!name) {
      toast.error("Informe o nome do atleta.");
      return;
    }
    const response = await saveChampionshipAthlete({
      championshipId: selectedEvent.championship_id,
      seasonYear: selectedEvent.season_year,
      sportId: selectedEvent.sport_id,
      teamId: draft.teamId,
      naipe: selectedEvent.naipe,
      division: selectedEvent.division,
      name,
    });
    if (response.error || typeof response.data != "string") {
      toast.error(response.error?.message ?? "Não foi possível cadastrar o atleta.");
      return;
    }
    const athlete: ChampionshipAthlete = {
      id: response.data,
      championship_id: selectedEvent.championship_id,
      season_year: selectedEvent.season_year,
      sport_id: selectedEvent.sport_id,
      team_id: draft.teamId,
      naipe: selectedEvent.naipe,
      division: selectedEvent.division,
      name,
      created_at: new Date().toISOString(),
    };
    setCreatedAthletes((current) => [...current, athlete]);
    setNewAthleteNameByDraftKey((current) => ({ ...current, [draft.key]: "" }));
    updateDraft(draft.key, isRelay
      ? { starterAthleteIds: [...draft.starterAthleteIds, athlete.id].slice(0, 4) }
      : { athleteId: athlete.id },
    );
    toast.success("Atleta cadastrado para esta modalidade.");
  };

  const handleSave = async () => {
    if (!selectedEvent) return;
    setSaving(true);
    const response = await saveChampionshipIndividualEventLiveResults(
      selectedEvent.id,
      drafts.map((draft) => ({
        entry_id: draft.entryId,
      team_id: draft.teamId,
      athlete_id: isRelay ? null : draft.athleteId || null,
        starter_athlete_ids: isRelay
          ? draft.starterAthleteIds.filter((athleteId): athleteId is string => athleteId != null)
          : [],
        lane_number: Number(draft.laneNumber),
        status: draft.status,
        result_time_milliseconds: draft.resultTimeMilliseconds ? Number(draft.resultTimeMilliseconds) : null,
        attempt_one_centimeters: draft.attemptOneCentimeters ? Number(draft.attemptOneCentimeters) : null,
        attempt_two_centimeters: draft.attemptTwoCentimeters ? Number(draft.attemptTwoCentimeters) : null,
        attempt_three_centimeters: draft.attemptThreeCentimeters ? Number(draft.attemptThreeCentimeters) : null,
      })),
    );
    setSaving(false);
    if (response.error) {
      toast.error(response.error.message);
      return;
    }
    toast.success("Resultados registrados e classificação recalculada.");
    await onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1rem)] max-w-[min(96vw,1100px)] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Registrar provas - {session?.sports?.name ?? "Sessão individual"}</DialogTitle>
          <DialogDescription>Registre atletas, raias e resultados conforme a súmula física.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <div className="max-w-md space-y-1">
            <Label>Prova</Label>
            <Select value={selectedEvent?.id ?? ""} onValueChange={setSelectedEventId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{events.map((event) => <SelectItem key={event.id} value={event.id}>{event.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            {selectedEvent && isMeasurementEvent(selectedEvent.event_code)
              ? "Informe as três tentativas em centímetros. A melhor marca define a colocação."
              : "Informe o tempo em milissegundos. O menor tempo define a colocação."}
          </p>
          <div className="space-y-3">
            {drafts.map((draft, index) => {
              const teamAthletes = availableAthletes.filter((athlete) => athlete.team_id == draft.teamId);
              const measurement = selectedEvent ? isMeasurementEvent(selectedEvent.event_code) : false;
              return <div key={draft.key} className="space-y-3 rounded-xl border border-border/50 p-3">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_100px_160px_auto]">
                  <div className="space-y-1"><Label>Atlética</Label><Select value={draft.teamId} onValueChange={(teamId) => updateDraft(draft.key, { teamId, athleteId: "", starterAthleteIds: [] })} disabled={!canManage || saving}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{activeTeams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}</SelectContent></Select></div>
                  {isRelay ? <div className="space-y-1"><Label>Revezamento</Label><p className="pt-2 text-sm text-muted-foreground">4 titulares</p></div> : <div className="space-y-1"><Label>Atleta</Label><Select value={draft.athleteId} onValueChange={(athleteId) => updateDraft(draft.key, { athleteId })} disabled={!canManage || saving || !draft.teamId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{teamAthletes.map((athlete) => <SelectItem key={athlete.id} value={athlete.id}>{athlete.name}</SelectItem>)}</SelectContent></Select></div>}
                  <div className="space-y-1"><Label>Raia</Label><Input type="number" min={1} value={draft.laneNumber} onChange={(event) => updateDraft(draft.key, { laneNumber: event.target.value })} disabled={!canManage || saving} /></div>
                  <div className="space-y-1"><Label>Situação</Label><Select value={draft.status} onValueChange={(status) => updateDraft(draft.key, { status: status as ChampionshipIndividualEntryStatus })} disabled={!canManage || saving}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[ChampionshipIndividualEntryStatus.PENDING, ChampionshipIndividualEntryStatus.CONFIRMED, ChampionshipIndividualEntryStatus.DSQ, ChampionshipIndividualEntryStatus.WALKOVER].map((status) => <SelectItem key={status} value={status}>{INDIVIDUAL_ENTRY_STATUS_LABELS[status]}</SelectItem>)}</SelectContent></Select></div>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remover participante ${index + 1}`} disabled={!canManage || saving} onClick={() => setDrafts((current) => current.filter((candidate) => candidate.key != draft.key))}><Trash2 className="h-4 w-4" /></Button>
                </div>
                {isRelay ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, starterIndex) => <div key={starterIndex} className="space-y-1"><Label>{starterIndex + 1}º titular</Label><Select value={draft.starterAthleteIds[starterIndex] ?? ""} onValueChange={(athleteId) => selectRelayStarter(draft, starterIndex, athleteId)} disabled={!canManage || saving || !draft.teamId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{teamAthletes.map((athlete) => <SelectItem key={athlete.id} value={athlete.id} disabled={draft.starterAthleteIds.includes(athlete.id) && draft.starterAthleteIds[starterIndex] != athlete.id}>{athlete.name}</SelectItem>)}</SelectContent></Select></div>)}</div> : null}
                <div className="flex flex-col gap-2 sm:flex-row"><Input value={newAthleteNameByDraftKey[draft.key] ?? ""} placeholder="Nome do novo atleta" onChange={(event) => setNewAthleteNameByDraftKey((current) => ({ ...current, [draft.key]: event.target.value }))} disabled={!canManage || saving || !draft.teamId} /><Button type="button" variant="outline" onClick={() => void createAthlete(draft)} disabled={!canManage || saving || !draft.teamId}>Cadastrar atleta</Button></div>
                {measurement ? <div className="grid grid-cols-3 gap-2">{(["attemptOneCentimeters", "attemptTwoCentimeters", "attemptThreeCentimeters"] as const).map((field, attemptIndex) => <div key={field} className="space-y-1"><Label>{attemptIndex + 1}ª tentativa</Label><Input type="number" min={0} value={draft[field]} onChange={(event) => updateDraft(draft.key, { [field]: event.target.value })} disabled={!canManage || saving || draft.status != ChampionshipIndividualEntryStatus.CONFIRMED} /></div>)}</div> : <div className="max-w-sm space-y-1"><Label>Tempo (ms)</Label><Input type="number" min={0} value={draft.resultTimeMilliseconds} onChange={(event) => updateDraft(draft.key, { resultTimeMilliseconds: event.target.value })} disabled={!canManage || saving || draft.status != ChampionshipIndividualEntryStatus.CONFIRMED} /></div>}
              </div>;
            })}
          </div>
          <Button type="button" variant="outline" disabled={!canManage || saving} onClick={() => setDrafts((current) => [...current, emptyDraft(current.length)])}><Plus className="h-4 w-4" /> Adicionar participante</Button>
        </div>
        <div className="flex shrink-0 justify-end gap-2 pt-2"><Button type="button" onClick={() => void handleSave()} disabled={!canManage || saving || !selectedEvent}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Confirmar resultados</Button></div>
      </DialogContent>
    </Dialog>
  );
}
