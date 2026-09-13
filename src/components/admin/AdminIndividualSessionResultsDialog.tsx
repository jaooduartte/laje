import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  TabsNavigationList,
  TabsNavigationTrigger,
} from "@/components/ui/tabs";
import {
  fetchChampionshipIndividualEventPlacementCount,
  saveChampionshipIndividualEventTeamPlacements,
} from "@/domain/individual-events/championshipIndividualEvents.repository";
import { ChampionshipIndividualEntryStatus } from "@/lib/enums";
import type {
  ChampionshipIndividualEvent,
  ChampionshipIndividualEventEntry,
  ChampionshipIndividualSession,
  Team,
} from "@/lib/types";

const EMPTY_TEAM_ID = "__empty_team__";

interface PlacementDraft {
  finalPosition: number;
  teamId: string;
}

function buildPlacementDrafts(
  placementCount: number,
  entries: ChampionshipIndividualEventEntry[],
): PlacementDraft[] {
  const teamIdByPosition = new Map<number, string>();

  entries
    .filter(
      (entry) =>
        entry.status == ChampionshipIndividualEntryStatus.CONFIRMED &&
        entry.final_position != null,
    )
    .forEach((entry) => {
      if (!teamIdByPosition.has(entry.final_position!)) {
        teamIdByPosition.set(entry.final_position!, entry.team_id);
      }
    });

  return Array.from({ length: placementCount }, (_, index) => ({
    finalPosition: index + 1,
    teamId: teamIdByPosition.get(index + 1) ?? "",
  }));
}

export function AdminIndividualSessionResultsDialog({
  open,
  onOpenChange,
  session,
  events,
  entries,
  teams,
  isLoading,
  canManage,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ChampionshipIndividualSession | null;
  events: ChampionshipIndividualEvent[];
  entries: ChampionshipIndividualEventEntry[];
  teams: Team[];
  isLoading: boolean;
  canManage: boolean;
  onSaved: () => Promise<void>;
}) {
  const [selectedEventId, setSelectedEventId] = useState("");
  const [placementCount, setPlacementCount] = useState<number | null>(null);
  const [placementCountLoading, setPlacementCountLoading] = useState(false);
  const [placements, setPlacements] = useState<PlacementDraft[]>([]);
  const [walkoverTeamIds, setWalkoverTeamIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dialogHeight, setDialogHeight] = useState<number | null>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const restoredDraftKeyRef = useRef<string | null>(null);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id == selectedEventId) ?? events[0] ?? null,
    [events, selectedEventId],
  );
  const eventEntries = useMemo(
    () => entries.filter((entry) => entry.event_id == selectedEvent?.id),
    [entries, selectedEvent?.id],
  );
  const resultEntries = useMemo(() => {
    const teamPlacementEntries = eventEntries.filter(
      (entry) => entry.recording_mode == "TEAM_PLACEMENT",
    );

    return teamPlacementEntries.length > 0 ? teamPlacementEntries : eventEntries;
  }, [eventEntries]);
  const persistedResultEntriesKey = useMemo(
    () =>
      resultEntries
        .map((entry) =>
          [
            entry.id,
            entry.team_id,
            entry.status,
            entry.final_position ?? "",
            entry.recording_mode ?? "ATHLETE_METRIC",
          ].join(":"),
        )
        .sort()
        .join("|"),
    [resultEntries],
  );
  const registeredEventIds = useMemo(
    () =>
      new Set(
        entries
          .filter(
            (entry) =>
              (entry.status == ChampionshipIndividualEntryStatus.CONFIRMED &&
                entry.final_position != null) ||
              entry.status == ChampionshipIndividualEntryStatus.WALKOVER ||
              entry.status == ChampionshipIndividualEntryStatus.DNS,
          )
          .map((entry) => entry.event_id),
      ),
    [entries],
  );
  const activeTeams = useMemo(
    () =>
      teams
        .filter((team) => team.is_active != false)
        .sort((left, right) => left.name.localeCompare(right.name, "pt-BR")),
    [teams],
  );
  const placementColumns = useMemo(() => {
    const placementsPerColumn = Math.ceil(placements.length / 3);

    return Array.from({ length: 3 }, (_, columnIndex) =>
      placements.slice(
        columnIndex * placementsPerColumn,
        (columnIndex + 1) * placementsPerColumn,
      ),
    ).filter((column) => column.length > 0);
  }, [placements]);
  const loading = isLoading || placementCountLoading;
  const hasResult =
    placements.some((placement) => placement.teamId) || walkoverTeamIds.length > 0;

  useLayoutEffect(() => {
    if (!open) {
      setDialogHeight(null);
      return;
    }

    if (loading || !selectedEvent || !dialogContentRef.current) {
      return;
    }

    setDialogHeight(Math.ceil(dialogContentRef.current.getBoundingClientRect().height));
  }, [activeTeams.length, loading, open, placements.length, selectedEvent, walkoverTeamIds.length]);

  useEffect(() => {
    if (open && !events.some((event) => event.id == selectedEventId)) {
      setSelectedEventId(events[0]?.id ?? "");
    }
  }, [events, open, selectedEventId]);

  useEffect(() => {
    if (!open || !selectedEventId) {
      setPlacementCount(null);
      restoredDraftKeyRef.current = null;
      return;
    }

    let isMounted = true;
    setPlacementCountLoading(true);
    setPlacementCount(null);

    void fetchChampionshipIndividualEventPlacementCount(selectedEventId)
      .then((response) => {
        if (!isMounted) {
          return;
        }

        if (response.error || !response.data) {
          toast.error(
            response.error?.message ??
              "Não foi possível carregar as posições configuradas.",
          );
          return;
        }

        setPlacementCount(response.data);
      })
      .finally(() => {
        if (isMounted) {
          setPlacementCountLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [open, selectedEventId]);

  useEffect(() => {
    if (!selectedEventId || placementCount == null) {
      return;
    }

    const restoredDraftKey = [
      selectedEventId,
      placementCount,
      persistedResultEntriesKey,
    ].join("|");

    if (restoredDraftKeyRef.current == restoredDraftKey) {
      return;
    }

    restoredDraftKeyRef.current = restoredDraftKey;
    setPlacements(buildPlacementDrafts(placementCount, resultEntries));
    setWalkoverTeamIds(
      resultEntries
        .filter(
          (entry) =>
            entry.status == ChampionshipIndividualEntryStatus.WALKOVER ||
            entry.status == ChampionshipIndividualEntryStatus.DNS,
        )
        .map((entry) => entry.team_id),
    );
  }, [placementCount, persistedResultEntriesKey, resultEntries, selectedEventId]);

  const updatePlacement = (finalPosition: number, teamId: string) => {
    setPlacements((current) =>
      current.map((placement) =>
        placement.finalPosition == finalPosition
          ? { ...placement, teamId }
          : placement,
      ),
    );

    if (teamId) {
      setWalkoverTeamIds((current) =>
        current.filter((walkoverTeamId) => walkoverTeamId != teamId),
      );
    }
  };

  const toggleWalkover = (teamId: string) => {
    setWalkoverTeamIds((current) => {
      if (current.includes(teamId)) {
        return current.filter((walkoverTeamId) => walkoverTeamId != teamId);
      }

      return [...current, teamId];
    });
    setPlacements((current) =>
      current.map((placement) =>
        placement.teamId == teamId ? { ...placement, teamId: "" } : placement,
      ),
    );
  };

  const handleSave = async () => {
    if (!selectedEvent || !hasResult) {
      return;
    }

    setSaving(true);
    const response = await saveChampionshipIndividualEventTeamPlacements({
      eventId: selectedEvent.id,
      placements: placements
        .filter((placement) => placement.teamId)
        .map((placement) => ({
          finalPosition: placement.finalPosition,
          teamId: placement.teamId,
        })),
      walkoverTeamIds,
    });
    setSaving(false);

    if (response.error) {
      toast.error(response.error.message);
      return;
    }

    toast.success("Classificação registrada e pontuação recalculada.");
    await onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        className="flex max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1rem)] max-w-[min(96vw,1100px)] flex-col overflow-hidden"
        style={dialogHeight ? { minHeight: `${dialogHeight}px` } : undefined}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>
            Registrar classificação - {session?.sports?.name ?? "Sessão individual"}
          </DialogTitle>
          <DialogDescription>
            Registre as colocações oficiais das atléticas conforme a súmula.
          </DialogDescription>
        </DialogHeader>

        <div className="-m-2 flex min-h-0 flex-1 flex-col space-y-5 overflow-y-auto p-2">
          {events.length > 0 ? (
            <Tabs
              value={selectedEvent?.id ?? ""}
              onValueChange={setSelectedEventId}
            >
              <TabsNavigationList className="h-auto w-full justify-start">
                {events.map((event) => {
                  const isRegistered = registeredEventIds.has(event.id);

                  return (
                    <TabsNavigationTrigger
                      key={event.id}
                      value={event.id}
                      className="group gap-1.5 px-3 py-2.5"
                      disabled={saving || isLoading}
                      aria-label={
                        isRegistered
                          ? `${event.name} — classificação registrada`
                          : event.name
                      }
                    >
                      {event.name}
                      {isRegistered ? (
                        <CheckCircle2
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 text-emerald-600 group-data-[state=active]:text-primary-foreground"
                        />
                      ) : null}
                    </TabsNavigationTrigger>
                  );
                })}
              </TabsNavigationList>
            </Tabs>
          ) : null}

          {loading ? (
            <div className="flex min-h-48 flex-1 items-center justify-center">
              <Loader2
                aria-label="Carregando classificação da prova"
                className="h-5 w-5 animate-spin text-primary"
              />
            </div>
          ) : selectedEvent ? (
            <>
              <section className="space-y-3">
                <div>
                  <h3 className="font-semibold">Colocações</h3>
                  <p className="text-sm text-muted-foreground">
                    Selecione a atlética de cada posição. Posições vazias não pontuam.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {placementColumns.map((column, columnIndex) => (
                    <div key={columnIndex} className="space-y-3">
                      {column.map((placement) => (
                        <div key={placement.finalPosition} className="space-y-1">
                          <Label htmlFor={`placement-${placement.finalPosition}`}>
                            {placement.finalPosition}ª colocação
                          </Label>
                          <Select
                            value={placement.teamId || EMPTY_TEAM_ID}
                            onValueChange={(teamId) =>
                              updatePlacement(
                                placement.finalPosition,
                                teamId == EMPTY_TEAM_ID ? "" : teamId,
                              )
                            }
                            disabled={!canManage || saving}
                          >
                            <SelectTrigger id={`placement-${placement.finalPosition}`}>
                              <SelectValue placeholder="Sem classificação" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={EMPTY_TEAM_ID}>
                                Sem classificação
                              </SelectItem>
                              {activeTeams.map((team) => (
                                <SelectItem key={team.id} value={team.id}>
                                  {team.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-border/50 p-4">
                <div>
                  <h3 className="font-semibold">W.O. na prova</h3>
                  <p className="text-sm text-muted-foreground">
                    O W.O. vale apenas para esta prova e não concede pontos.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeTeams.map((team) => {
                    const selected = walkoverTeamIds.includes(team.id);
                    const hasPlacement = placements.some(
                      (placement) => placement.teamId == team.id,
                    );

                    return (
                      <Button
                        key={team.id}
                        type="button"
                        variant={selected ? "destructive" : "outline"}
                        size="sm"
                        aria-pressed={selected}
                        onClick={() => toggleWalkover(team.id)}
                        disabled={!canManage || saving || hasPlacement}
                      >
                        {team.name}
                      </Button>
                    );
                  })}
                </div>
              </section>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Não há provas configuradas para esta sessão.
            </p>
          )}
        </div>

        <div className="flex shrink-0 justify-center gap-2 pt-2">
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canManage || saving || loading || !selectedEvent || !hasResult}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirmar classificação
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
