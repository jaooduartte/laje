import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Loader2, CalendarClock, Trophy, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TimeInput } from "@/components/ui/time-input";
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
import { getBracketDaySchedules, updateBracketDaySchedule } from "@/domain/championship-brackets/championshipBracket.repository";
import type {
  BracketDayBreak,
  BracketDayBreakScopeType,
  BracketDayCourtOption,
  BracketDaySchedule,
  BracketDayScheduleUpdate,
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
  const savedDaysRef = useRef<DayScheduleSnapshot[]>([]);
  const individualSportIds = useMemo(() => resolveIndividualSportIds(sports), [sports]);
  const { events: individualEvents, sessions: individualSessions } = useChampionshipIndividualEvents({
    championshipId,
    seasonYear,
    sportIds: individualSportIds,
  });

  const isEditable = canManageSchedule && championshipStatus === ChampionshipStatus.UPCOMING;

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

    const { error: saveError } = await updateBracketDaySchedule(bracketEditionId, [update]);

    if (saveError) {
      toast.error(saveError.message);
      updateDay(day.id, { saving: false });
      return;
    }

    toast.success("Horários do dia atualizados e jogos redistribuídos.");
    updateDay(day.id, { saving: false });
    savedDaysRef.current = savedDaysRef.current.map((s) =>
      s.id === day.id
        ? {
            id: day.id,
            event_date: day.event_date,
            start_time: day.start_time,
            end_time: day.end_time,
            breaks: day.breaks,
            courts: day.courts,
          }
        : s,
    );
    onRefetchMatches();
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
          Somente leitura: as configurações só podem ser editadas com o campeonato em
          "Configurando campeonato".
        </div>
      ) : null}

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

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Classificação para o mata-mata
          </h3>
        </div>

        <AdminChampionshipQualificationSection
          competitions={competitions}
          isEditable={isEditable}
          onSaved={onRefetchChampionshipBracket}
        />
      </section>

      <section className="space-y-4">
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
          onSaved={() => {
            onRefetchMatches();
            onRefetchChampionshipBracket();
          }}
        />
      </section>

      <section className="space-y-4">
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
          onSaved={() => {
            onRefetchMatches();
            onRefetchChampionshipBracket();
          }}
        />
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Locais e quadras
          </h3>
        </div>

        <AdminChampionshipGeneratedLocationsSection
          bracketEditionId={bracketEditionId}
          isEditable={isEditable}
          onSaved={() => {
            onRefetchMatches();
            onRefetchChampionshipBracket();
          }}
        />
      </section>
    </div>
  );
}
