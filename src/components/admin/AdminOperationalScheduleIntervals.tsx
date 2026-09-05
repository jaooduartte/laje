import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  applyOperationalScheduleInterval,
  getBracketDaySchedules,
  previewOperationalScheduleInterval,
} from "@/domain/championship-brackets/championshipBracket.repository";
import type {
  BracketDayBreak,
  BracketDaySchedule,
  OperationalScheduleIntervalInput,
  OperationalScheduleIntervalPreview,
} from "@/domain/championship-brackets/championshipBracket.types";
import { ChampionshipStatus, MatchStatus } from "@/lib/enums";

interface Props {
  bracketEditionId: string;
  championshipStatus: ChampionshipStatus;
  canManageSchedule: boolean;
  onRefetchMatches: () => void;
  onRefetchChampionshipBracket: () => void;
}

interface IntervalForm {
  action: OperationalScheduleIntervalInput["action"];
  intervalId: string | null;
  scopeType: OperationalScheduleIntervalInput["scope_type"];
  courtIds: string[];
  startTime: string;
  endTime: string;
}

const EMPTY_FORM: IntervalForm = {
  action: "UPSERT",
  intervalId: null,
  scopeType: "ALL_COURTS",
  courtIds: [],
  startTime: "",
  endTime: "",
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatTime(value: string) {
  if (value.includes("T")) {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  }
  return value.slice(0, 5);
}

function formatMatchStatus(value: string | null) {
  if (value === MatchStatus.SCHEDULED) return "Agendado";
  if (value === MatchStatus.LIVE) return "Ao vivo";
  if (value === MatchStatus.FINISHED) return "Encerrado";
  return value;
}

export function AdminOperationalScheduleIntervals({
  bracketEditionId,
  championshipStatus,
  canManageSchedule,
  onRefetchMatches,
  onRefetchChampionshipBracket,
}: Props) {
  const [days, setDays] = useState<BracketDaySchedule[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<IntervalForm>(EMPTY_FORM);
  const [preview, setPreview] = useState<OperationalScheduleIntervalPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [acceptDayEndExtension, setAcceptDayEndExtension] = useState(false);

  const canOperate =
    canManageSchedule &&
    [ChampionshipStatus.REVIEW, ChampionshipStatus.IN_PROGRESS].includes(
      championshipStatus,
    );

  const loadDays = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getBracketDaySchedules(bracketEditionId);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setDays(data);
    setSelectedDate((currentDate) => currentDate || data[0]?.event_date || "");
    setLoading(false);
  }, [bracketEditionId]);

  useEffect(() => {
    void loadDays();
  }, [loadDays]);

  const selectedDay = useMemo(
    () => days.find((day) => day.event_date === selectedDate) ?? null,
    [days, selectedDate],
  );

  function closeDialog() {
    if (loadingPreview || applying) return;
    setDialogOpen(false);
    setForm(EMPTY_FORM);
    setPreview(null);
    setAcceptDayEndExtension(false);
  }

  function openCreate(
    scopeType: IntervalForm["scopeType"],
    defaultCourtId?: string,
  ) {
    if (!selectedDay) return;
    setForm({
      ...EMPTY_FORM,
      scopeType,
      courtIds:
        scopeType === "COURT"
          ? defaultCourtId
            ? [defaultCourtId]
            : selectedDay.courts.length === 1
              ? [selectedDay.courts[0].id]
              : []
          : [],
    });
    setPreview(null);
    setAcceptDayEndExtension(false);
    setDialogOpen(true);
  }

  function openExisting(interval: BracketDayBreak, action: IntervalForm["action"]) {
    setForm({
      action,
      intervalId: interval.id,
      scopeType: interval.scope_type,
      courtIds: interval.bracket_court_id ? [interval.bracket_court_id] : [],
      startTime: formatTime(interval.break_start_time),
      endTime: formatTime(interval.break_end_time),
    });
    setPreview(null);
    setAcceptDayEndExtension(false);
    setDialogOpen(true);
  }

  function buildInput(): OperationalScheduleIntervalInput | null {
    if (!selectedDay) return null;
    if (
      form.action === "UPSERT" &&
      (!form.startTime || !form.endTime || form.endTime <= form.startTime)
    ) {
      toast.error("Informe início e fim válidos para o intervalo.");
      return null;
    }
    if (
      form.action === "UPSERT" &&
      form.scopeType === "COURT" &&
      form.courtIds.length === 0
    ) {
      toast.error("Selecione pelo menos uma quadra.");
      return null;
    }
    return {
      event_date: selectedDay.event_date,
      action: form.action,
      interval_id: form.intervalId,
      scope_type: form.scopeType,
      court_ids: form.courtIds,
      start_time: form.action === "UPSERT" ? form.startTime : null,
      end_time: form.action === "UPSERT" ? form.endTime : null,
      accept_day_end_extension: acceptDayEndExtension,
    };
  }

  async function requestPreview() {
    const input = buildInput();
    if (!input) return;
    setLoadingPreview(true);
    const { data, error } = await previewOperationalScheduleInterval(
      bracketEditionId,
      input,
    );
    setLoadingPreview(false);
    if (error || !data) {
      toast.error(error?.message ?? "Não foi possível gerar a prévia.");
      return;
    }
    setPreview(data);
  }

  async function applyInterval() {
    const input = buildInput();
    if (!input || !preview) return;
    setApplying(true);
    const { error } = await applyOperationalScheduleInterval(
      bracketEditionId,
      input,
      preview.revision,
    );
    setApplying(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Intervalo operacional e programação atualizados.");
    closeDialog();
    await loadDays();
    onRefetchMatches();
    onRefetchChampionshipBracket();
  }

  function toggleCourt(courtId: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      courtIds: checked
        ? [...new Set([...current.courtIds, courtId])]
        : current.courtIds.filter((id) => id !== courtId),
    }));
    setPreview(null);
  }

  return (
    <section className="enter-section space-y-5">
      <div className="glass-card space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-bold">Locais e intervalos</h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Ajuste pausas gerais ou de quadras específicas e confira a nova
              programação antes de confirmar.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => openCreate("ALL_COURTS")}
            disabled={!canOperate || !selectedDay || loading}
          >
            <Plus className="mr-2 h-4 w-4" />
            Intervalo geral
          </Button>
        </div>

        {!canOperate ? (
          <p className="rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950 dark:text-amber-100">
            Esta operação requer permissão de edição da Agenda e campeonato em
            revisão ou em andamento.
          </p>
        ) : null}

        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="operational-interval-date">Dia</Label>
          <Select value={selectedDate} onValueChange={setSelectedDate} disabled={loading}>
            <SelectTrigger id="operational-interval-date" className="app-input-field">
              <SelectValue placeholder="Selecione o dia" />
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
      </div>

      {loading ? (
        <div className="glass-card flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando locais e quadras...
        </div>
      ) : !selectedDay ? (
        <div className="glass-card p-5 text-sm text-muted-foreground">
          Nenhum dia configurado para este campeonato.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="glass-card space-y-3 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Intervalos gerais</p>
                <p className="text-sm text-muted-foreground">{formatDate(selectedDay.event_date)} • {formatTime(selectedDay.start_time)} às {formatTime(selectedDay.end_time)}</p>
              </div>
            </div>
            {selectedDay.breaks.filter((interval) => interval.scope_type === "ALL_COURTS").length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum intervalo geral configurado.</p>
            ) : (
              selectedDay.breaks.filter((interval) => interval.scope_type === "ALL_COURTS").map((interval) => (
                <div key={interval.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/50 p-3 text-sm">
                  <span><CalendarClock className="mr-2 inline h-4 w-4" />{formatTime(interval.break_start_time)}–{formatTime(interval.break_end_time)}</span>
                  <span className="flex gap-1">
                    <Button type="button" variant="ghost" size="icon" disabled={!canOperate} aria-label="Editar intervalo geral" onClick={() => openExisting(interval, "UPSERT")}><Pencil className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" disabled={!canOperate} aria-label="Remover intervalo geral" onClick={() => openExisting(interval, "REMOVE")}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {selectedDay.locations.map((location) => (
              <article key={location.id} className="glass-card space-y-4 p-4 sm:p-5">
                <div>
                  <p className="font-semibold">{location.name}</p>
                  <p className="text-sm text-muted-foreground">{location.courts.length} quadra(s)</p>
                </div>
                {location.courts.map((court) => {
                  const intervals = selectedDay.breaks.filter((interval) => interval.scope_type === "COURT" && interval.bracket_court_id === court.id);
                  return (
                    <div key={court.id} className="space-y-2 rounded-lg border border-border/50 p-3">
                      <div className="flex items-center justify-between gap-2"><p className="font-medium">{court.name}</p><Button type="button" variant="ghost" size="icon" disabled={!canOperate} aria-label={`Adicionar intervalo em ${court.name}`} onClick={() => openCreate("COURT", court.id)}><Plus className="h-4 w-4" /></Button></div>
                      {intervals.length === 0 ? <p className="text-xs text-muted-foreground">Sem intervalo específico.</p> : intervals.map((interval) => <div key={interval.id} className="flex items-center justify-between gap-2 text-sm"><span>{formatTime(interval.break_start_time)}–{formatTime(interval.break_end_time)}</span><span className="flex gap-1"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={!canOperate} aria-label={`Editar intervalo de ${court.name}`} onClick={() => openExisting(interval, "UPSERT")}><Pencil className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={!canOperate} aria-label={`Remover intervalo de ${court.name}`} onClick={() => openExisting(interval, "REMOVE")}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></span></div>)}
                    </div>
                  );
                })}
              </article>
            ))}
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{form.action === "REMOVE" ? "Remover intervalo" : form.intervalId ? "Editar intervalo" : "Adicionar intervalo"}</DialogTitle>
            <DialogDescription>A confirmação atualiza somente a data e as quadras selecionadas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {form.action === "UPSERT" ? <><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="operational-interval-start">Início</Label><Input id="operational-interval-start" type="time" className="app-input-field" value={form.startTime} onChange={(event) => { setForm((current) => ({ ...current, startTime: event.target.value })); setPreview(null); }} /></div><div className="space-y-1"><Label htmlFor="operational-interval-end">Fim</Label><Input id="operational-interval-end" type="time" className="app-input-field" value={form.endTime} onChange={(event) => { setForm((current) => ({ ...current, endTime: event.target.value })); setPreview(null); }} /></div></div>
              {!form.intervalId ? <div className="space-y-3 rounded-lg border border-border p-3"><Label>Escopo</Label><Select value={form.scopeType} onValueChange={(value) => { if (value === "ALL_COURTS" || value === "COURT") { setForm((current) => ({ ...current, scopeType: value, courtIds: [] })); setPreview(null); } }}><SelectTrigger className="app-input-field"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL_COURTS">Todas as quadras do dia</SelectItem><SelectItem value="COURT">Quadras específicas</SelectItem></SelectContent></Select>{form.scopeType === "COURT" && selectedDay ? <div className="grid gap-2 pt-1 sm:grid-cols-2">{selectedDay.courts.map((court) => <label key={court.id} className="flex items-center gap-2 rounded-md border border-border/50 p-2 text-sm"><Checkbox checked={form.courtIds.includes(court.id)} onCheckedChange={(checked) => toggleCourt(court.id, checked === true)} />{court.label}</label>)}</div> : null}</div> : null}</> : <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">A janela ficará novamente disponível e os horários posteriores serão recalculados.</p>}

            {preview ? <div className="space-y-3 rounded-lg border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">Prévia da programação</p>{preview.extends_day_end ? <span className="text-sm text-amber-700 dark:text-amber-300">Fim do dia: {formatTime(preview.day_end_before)} → {formatTime(preview.day_end_after)}</span> : null}</div>{preview.blockers.length > 0 ? <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{[...new Set(preview.blockers)].map((blocker) => <p key={blocker}>{blocker}</p>)}</div> : null}{preview.extends_day_end ? <label className="flex items-start gap-2 text-sm"><Checkbox checked={acceptDayEndExtension} onCheckedChange={(checked) => setAcceptDayEndExtension(checked === true)} />Confirmo a ampliação do horário final deste dia.</label> : null}<div className="space-y-2">{preview.timeline.map((item) => <div key={item.item_id} className="rounded-md bg-muted/50 p-2 text-sm"><p>{item.location_name} • {item.court_name} • {item.label}{item.match_status ? ` • ${formatMatchStatus(item.match_status)}` : ""}</p><p className="text-muted-foreground">{formatTime(item.original_start_time)}–{formatTime(item.original_end_time)} → {formatTime(item.start_time)}–{formatTime(item.end_time)}</p></div>)}</div></div> : null}
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={closeDialog} disabled={loadingPreview || applying}>Cancelar</Button><Button type="button" variant="outline" onClick={() => void requestPreview()} disabled={loadingPreview || applying}>{loadingPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Gerar prévia</Button><Button type="button" onClick={() => void applyInterval()} disabled={!preview || preview.blockers.length > 0 || (preview.extends_day_end && !acceptDayEndExtension) || loadingPreview || applying}>{applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Confirmar ajuste</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
