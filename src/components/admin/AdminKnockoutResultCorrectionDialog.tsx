import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type {
  KnockoutResultCorrectionPreview,
  KnockoutResultCorrectionScheduleCandidate,
} from "@/domain/championship-brackets/knockoutResultCorrection.types";

interface Props {
  open: boolean;
  preview: KnockoutResultCorrectionPreview | null;
  isGeneratingSchedule: boolean;
  isApplying: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerateSchedule: () => void | Promise<void>;
  onApply: (input: {
    scheduleCandidateId: string | null;
    reason: string;
  }) => void | Promise<void>;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Data não definida";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "--:--";
  return value.slice(0, 5);
}

function resolveImpactActionLabel(action: string): string {
  if (action == "REPLAY") return "Será refeita";
  if (action == "DEMATERIALIZE") return "Será desmaterializada";
  return "Slot será recalculado";
}

function resolveFinalSlotSummary(
  preview: KnockoutResultCorrectionPreview,
): string | null {
  const finalSlot = preview.final_slot;
  if (!finalSlot) return null;

  const preservedTeamName = finalSlot.preserved_team_name;
  if (!preservedTeamName) return "Participantes serão recalculados após o novo confronto.";

  if (finalSlot.pending_side == "HOME") {
    return `A definir x ${preservedTeamName}`;
  }

  if (finalSlot.pending_side == "AWAY") {
    return `${preservedTeamName} x A definir`;
  }

  return `Participante já confirmado: ${preservedTeamName}`;
}

function ScheduleCandidateOption({
  candidate,
}: {
  candidate: KnockoutResultCorrectionScheduleCandidate;
}) {
  return (
    <Label
      htmlFor={`knockout-correction-slot-${candidate.id}`}
      className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 bg-background/70 p-3 transition-colors hover:bg-secondary/40"
    >
      <RadioGroupItem
        id={`knockout-correction-slot-${candidate.id}`}
        value={candidate.id}
        className="mt-0.5"
      />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block font-medium text-foreground">
          {formatDate(candidate.scheduled_date)} · {candidate.start_time}–{candidate.end_time}
        </span>
        <span className="block text-xs text-muted-foreground">
          {candidate.location_name} · {candidate.court_name} · {candidate.duration_minutes} min
        </span>
      </span>
    </Label>
  );
}

export function AdminKnockoutResultCorrectionDialog({
  open,
  preview,
  isGeneratingSchedule,
  isApplying,
  onOpenChange,
  onGenerateSchedule,
  onApply,
}: Props) {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [reason, setReason] = useState(
    "Decisão da CO / correção retroativa do mata-mata",
  );

  useEffect(() => {
    setSelectedCandidateId("");
  }, [preview?.source?.match_id, preview?.schedule_preview_generated]);

  const finalSlotSummary = useMemo(
    () => (preview ? resolveFinalSlotSummary(preview) : null),
    [preview],
  );

  const canApply =
    preview != null &&
    !preview.blocked &&
    (!preview.requires_replay_schedule ||
      (preview.schedule_preview_generated && selectedCandidateId.length > 0));

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isApplying && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reprocessar chaveamento</DialogTitle>
          <DialogDescription>
            O W.O. altera o vencedor de um confronto já propagado. Revise o impacto antes de confirmar qualquer alteração.
          </DialogDescription>
        </DialogHeader>

        {preview ? (
          <div className="space-y-5">
            {preview.blocked ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{preview.block_reason ?? "O chaveamento não pode ser reprocessado agora."}</p>
                </div>
              </div>
            ) : null}

            {preview.source ? (
              <section className="space-y-2 rounded-lg border border-border/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Resultado que será corrigido
                </p>
                <p className="font-display text-base font-semibold">
                  {preview.source.home_team_name} x {preview.source.away_team_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  Classificado atual: <strong className="text-foreground">{preview.source.previous_winner_team_name ?? "Não definido"}</strong>
                  {" → "}
                  novo classificado: <strong className="text-foreground">{preview.source.corrected_winner_team_name}</strong>.
                </p>
              </section>
            ) : null}

            <section className="space-y-2">
              <div>
                <p className="font-display font-semibold">Impacto no mata-mata</p>
                <p className="text-sm text-muted-foreground">
                  Jogos já materializados no ramo afetado deixam de valer para a progressão oficial, mas serão preservados no histórico da correção.
                </p>
              </div>
              <div className="space-y-2">
                {preview.impacts.map((impact) => (
                  <div
                    key={impact.bracket_match_id}
                    className="flex flex-col gap-1 rounded-lg border border-border/60 bg-secondary/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {impact.home_team_name ?? "A definir"} x {impact.away_team_name ?? "A definir"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Rodada {impact.round_number} · slot {impact.slot_number}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                      {resolveImpactActionLabel(impact.action)}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {preview.replay_match ? (
              <section className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Novo confronto
                </p>
                <p className="mt-1 font-display text-lg font-bold">
                  {preview.replay_match.home_team_name ?? "A definir"} x {preview.replay_match.away_team_name ?? "A definir"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  O vencedor deste confronto voltará a alimentar normalmente a próxima fase.
                </p>
              </section>
            ) : null}

            {preview.final_slot ? (
              <section className="space-y-1 rounded-lg border border-border/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Slot da final preservado
                </p>
                <p className="font-display font-semibold">{finalSlotSummary}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(preview.final_slot.planned_scheduled_date)} · {formatTime(preview.final_slot.planned_start_time)}–{formatTime(preview.final_slot.planned_end_time)}
                  {preview.final_slot.planned_location_name ? ` · ${preview.final_slot.planned_location_name}` : ""}
                  {preview.final_slot.planned_court_name ? ` · ${preview.final_slot.planned_court_name}` : ""}
                </p>
              </section>
            ) : null}

            {preview.requires_replay_schedule ? (
              <section className="space-y-3 rounded-lg border border-border/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="flex items-center gap-2 font-display font-semibold">
                      <CalendarClock className="h-4 w-4" />
                      Programação da partida refeita
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {preview.remaining_event_days} dia(s) de programação ainda disponível(is). A prévia considera quadras compatíveis, intervalos, ocupação atual e o horário já reservado para as fases seguintes.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void onGenerateSchedule()}
                    disabled={isGeneratingSchedule || isApplying}
                    className="shrink-0"
                  >
                    {isGeneratingSchedule ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    {preview.schedule_preview_generated ? "Atualizar prévia" : "Gerar prévia de horários"}
                  </Button>
                </div>

                {preview.schedule_preview_generated ? (
                  preview.schedule_candidates.length > 0 ? (
                    <RadioGroup
                      value={selectedCandidateId}
                      onValueChange={setSelectedCandidateId}
                      className="max-h-72 space-y-2 overflow-y-auto pr-1"
                    >
                      {preview.schedule_candidates.map((candidate) => (
                        <ScheduleCandidateOption key={candidate.id} candidate={candidate} />
                      ))}
                    </RadioGroup>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                      Nenhum horário futuro válido foi encontrado antes da próxima fase. Ajuste a programação do campeonato e gere a prévia novamente.
                    </div>
                  )
                ) : null}
              </section>
            ) : (
              <div className="rounded-lg border border-border/70 bg-secondary/20 p-3 text-sm text-muted-foreground">
                O próximo confronto ainda não foi encerrado; a programação existente será preservada e apenas o participante proveniente deste ramo será atualizado.
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="knockout-correction-reason">Motivo da correção</Label>
              <Input
                id="knockout-correction-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={isApplying}
                placeholder="Ex.: decisão da CO em reunião"
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Calculando impacto do chaveamento...
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isApplying}
          >
            Voltar
          </Button>
          <Button
            type="button"
            onClick={() =>
              void onApply({
                scheduleCandidateId: selectedCandidateId || null,
                reason: reason.trim(),
              })
            }
            disabled={!canApply || isApplying || isGeneratingSchedule}
          >
            {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirmar e reprocessar chaveamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
