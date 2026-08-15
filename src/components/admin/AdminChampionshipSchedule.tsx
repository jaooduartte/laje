import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Loader2, CalendarClock, Trophy, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TimeInput } from "@/components/ui/time-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminChampionshipQualificationSection } from "@/components/admin/AdminChampionshipQualificationSection";
import { AdminChampionshipCourtPrioritySection } from "@/components/admin/AdminChampionshipCourtPrioritySection";
import { AdminChampionshipGeneratedLocationsSection } from "@/components/admin/AdminChampionshipGeneratedLocationsSection";
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
} from "@/domain/championship-brackets/championshipBracket.repository";
import type {
  BracketDayBreak,
  BracketDayBreakScopeType,
  BracketDayCourtOption,
  BracketDaySchedule,
  BracketDayScheduleUpdate,
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
  saving: boolean;
}

type DayScheduleSnapshot = Omit<DayScheduleDraft, "saving">;

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
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
  const [activeSection, setActiveSection] = useState("schedule");
  const [pendingReconfiguration, setPendingReconfiguration] = useState<ChampionshipBracketReconfigurationRequest | null>(null);
  const [reconfigurationPreview, setReconfigurationPreview] = useState<ChampionshipBracketReconfigurationPreview | null>(null);
  const [loadingReconfigurationPreview, setLoadingReconfigurationPreview] = useState(false);
  const [applyingReconfiguration, setApplyingReconfiguration] = useState(false);
  const savedDaysRef = useRef<DayScheduleSnapshot[]>([]);
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
      saving: false,
    }));

    setDays(drafts);
    savedDaysRef.current = drafts.map(({ saving: _saving, ...rest }) => rest);

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

  function addBreak(dayId: string) {
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
              scope_type: "ALL_COURTS",
              bracket_court_id: null,
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

  return (
    <div className="space-y-6">
      {!isEditable ? (
        <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950 dark:text-amber-100">
          Somente leitura: a reprogramação só pode ser feita com o campeonato em "Em revisão".
        </div>
      ) : null}

      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto p-1">
          <TabsTrigger value="schedule">Horários e intervalos</TabsTrigger>
          <TabsTrigger value="sessions">Sessões individuais</TabsTrigger>
          <TabsTrigger value="qualification">Classificação para o mata-mata</TabsTrigger>
          <TabsTrigger value="court-priorities">Prioridades de quadra</TabsTrigger>
          <TabsTrigger value="knockout-priorities">Prioridades do mata-mata</TabsTrigger>
          <TabsTrigger value="locations">Locais e quadras</TabsTrigger>
        </TabsList>

      <TabsContent value="schedule" className="mt-6">
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Horários e intervalos
          </h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : days.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Nenhum dia configurado na agenda deste campeonato.
          </p>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
            {days.map((day) => (
              <div key={day.id} className="glass-card space-y-4 p-4">
                <h3 className="font-medium text-sm">{formatDate(day.event_date)}</h3>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`start-${day.id}`}
                      className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      Início
                    </Label>
                    <TimeInput
                      id={`start-${day.id}`}
                      value={day.start_time}
                      disabled={!isEditable || day.saving}
                      onChange={(value) => updateDay(day.id, { start_time: value })}
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
                      value={day.end_time}
                      disabled={!isEditable || day.saving}
                      onChange={(value) => updateDay(day.id, { end_time: value })}
                      className="h-10 border-border/40 bg-background/50"
                    />
                  </div>
                </div>

                {day.breaks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Intervalos
                    </p>
                    {day.breaks.map((brk) => (
                      <div
                        key={brk.localId}
                        className="app-card-muted grid gap-2 p-3 xl:grid-cols-[220px_minmax(0,1fr)_auto_minmax(0,1fr)_auto] xl:items-center"
                      >
                        <Select
                          value={brk.scope_type === "COURT" ? `COURT:${brk.bracket_court_id ?? ""}` : "ALL_COURTS"}
                          disabled={!isEditable || day.saving}
                          onValueChange={(value) => {
                            if (value === "ALL_COURTS") {
                              updateBreak(day.id, brk.localId, {
                                scope_type: "ALL_COURTS",
                                bracket_court_id: null,
                              });
                              return;
                            }

                            updateBreak(day.id, brk.localId, {
                              scope_type: "COURT",
                              bracket_court_id: value.replace("COURT:", ""),
                            });
                          }}
                        >
                          <SelectTrigger className="app-input-field h-10">
                            <SelectValue placeholder="Escopo do intervalo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL_COURTS">Todas as quadras</SelectItem>
                            {day.courts.map((court) => (
                              <SelectItem key={court.id} value={`COURT:${court.id}`}>
                                {court.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <TimeInput
                          value={brk.break_start_time}
                          disabled={!isEditable || day.saving}
                          onChange={(value) =>
                            updateBreak(day.id, brk.localId, { break_start_time: value })
                          }
                          className="h-10 border-border/40 bg-background/50"
                          placeholder="Início"
                        />
                        <span className="text-xs text-muted-foreground sm:text-center">até</span>
                        <TimeInput
                          value={brk.break_end_time}
                          disabled={!isEditable || day.saving}
                          onChange={(value) =>
                            updateBreak(day.id, brk.localId, { break_end_time: value })
                          }
                          className="h-10 border-border/40 bg-background/50"
                          placeholder="Fim"
                        />
                        {isEditable && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={day.saving}
                            onClick={() => removeBreak(day.id, brk.localId)}
                            className="shrink-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {isEditable && (
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={day.saving}
                      onClick={() => addBreak(day.id)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Intervalo
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      disabled={day.saving || !isDayDirty(day)}
                      onClick={() => saveDay(day)}
                    >
                      {day.saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                      Salvar dia
                    </Button>
                  </div>
                )}
              </div>
            ))}
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

      <TabsContent value="locations" className="mt-6"><section className="space-y-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Locais e quadras
          </h3>
        </div>

        <AdminChampionshipGeneratedLocationsSection
          bracketEditionId={bracketEditionId}
          isEditable={isEditable}
          onRequestReconfiguration={requestReconfiguration}
        />
      </section>
      </TabsContent>
      </Tabs>

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
