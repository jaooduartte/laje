import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  saveInterlajeOpeningCeremonyBonusEligibility,
  saveInterlajeOpeningCeremonyBonusPoints,
} from "@/domain/interlaje/interlajeOpeningCeremonyBonus.repository";
import { useInterlajeOpeningCeremonyBonus } from "@/hooks/useInterlajeOpeningCeremonyBonus";
import { ChampionshipStatus } from "@/lib/enums";
import type { Championship, Team } from "@/lib/types";

interface Props {
  selectedChampionship: Championship;
  teams: Team[];
  loadingTeams: boolean;
  canManageOpeningCeremonyBonus: boolean;
  onSaved: () => void;
}

export function AdminInterlajeOpeningCeremonyBonus({
  selectedChampionship,
  teams,
  loadingTeams,
  canManageOpeningCeremonyBonus,
  onSaved,
}: Props) {
  const seasonYear = selectedChampionship.current_season_year;
  const { settings, eligibleTeamIds, registeredTeamIds, loading, refetch } =
    useInterlajeOpeningCeremonyBonus({
      championshipId: selectedChampionship.id,
      seasonYear,
  });
  const [pointsDraft, setPointsDraft] = useState("");
  const [savingPoints, setSavingPoints] = useState(false);
  const [eligibleTeamIdsDraft, setEligibleTeamIdsDraft] = useState<string[]>([]);
  const [savingEligibility, setSavingEligibility] = useState(false);
  const configuredPoints = settings?.points;

  useEffect(() => {
    setPointsDraft(configuredPoints != null ? String(configuredPoints) : "");
  }, [configuredPoints]);

  useEffect(() => {
    setEligibleTeamIdsDraft((currentTeamIds) => {
      const currentTeamIdsSet = new Set(currentTeamIds);
      const hasSameEligibleTeams =
        currentTeamIds.length === eligibleTeamIds.length &&
        eligibleTeamIds.every((teamId) => currentTeamIdsSet.has(teamId));

      return hasSameEligibleTeams ? currentTeamIds : eligibleTeamIds;
    });
  }, [eligibleTeamIds]);

  const registeredTeamIdsSet = useMemo(
    () => new Set(registeredTeamIds),
    [registeredTeamIds],
  );
  const registeredActiveTeams = useMemo(() => {
    return teams
      .filter(
        (team) =>
          team.is_active !== false && registeredTeamIdsSet.has(team.id),
      )
      .sort((firstTeam, secondTeam) => firstTeam.name.localeCompare(secondTeam.name));
  }, [registeredTeamIdsSet, teams]);
  const isFinished = selectedChampionship.status === ChampionshipStatus.FINISHED;
  const canConfigurePoints = canManageOpeningCeremonyBonus && !isFinished;
  const canManageEligibility =
    canManageOpeningCeremonyBonus &&
    (selectedChampionship.status === ChampionshipStatus.REVIEW ||
      selectedChampionship.status === ChampionshipStatus.IN_PROGRESS);
  const eligibleTeamIdsDraftSet = useMemo(
    () => new Set(eligibleTeamIdsDraft),
    [eligibleTeamIdsDraft],
  );
  const eligibleTeamIdsSet = useMemo(() => new Set(eligibleTeamIds), [eligibleTeamIds]);
  const hasEligibilityChanges = registeredActiveTeams.some(
    (team) => eligibleTeamIdsDraftSet.has(team.id) !== eligibleTeamIdsSet.has(team.id),
  );
  const allRegisteredActiveTeamsEligible =
    registeredActiveTeams.length > 0 &&
    registeredActiveTeams.every((team) => eligibleTeamIdsDraftSet.has(team.id));
  const hasEligibleRegisteredActiveTeam = registeredActiveTeams.some((team) =>
    eligibleTeamIdsDraftSet.has(team.id),
  );

  async function handleSavePoints() {
    const normalizedPoints = pointsDraft.trim();
    if (!/^[1-9]\d*$/.test(normalizedPoints)) {
      toast.error("Informe uma quantidade inteira positiva de pontos.");
      return;
    }

    setSavingPoints(true);
    const { error } = await saveInterlajeOpeningCeremonyBonusPoints({
      championshipId: selectedChampionship.id,
      seasonYear,
      points: Number(normalizedPoints),
    });
    setSavingPoints(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    await refetch();
    onSaved();
    toast.success("Pontuação da abertura atualizada.");
  }

  function handleEligibleChange(teamId: string, eligible: boolean) {
    setEligibleTeamIdsDraft((currentTeamIds) => {
      if (eligible) {
        return currentTeamIds.includes(teamId) ? currentTeamIds : [...currentTeamIds, teamId];
      }

      return currentTeamIds.filter((currentTeamId) => currentTeamId !== teamId);
    });
  }

  function handleSelectAllEligibleTeams(eligible: boolean) {
    setEligibleTeamIdsDraft(
      eligible ? registeredActiveTeams.map((team) => team.id) : [],
    );
  }

  async function handleSaveEligibility() {
    const changes = registeredActiveTeams.filter(
      (team) => eligibleTeamIdsDraftSet.has(team.id) !== eligibleTeamIdsSet.has(team.id),
    );
    setSavingEligibility(true);
    const results = await Promise.all(
      changes.map((team) =>
        saveInterlajeOpeningCeremonyBonusEligibility({
          championshipId: selectedChampionship.id,
          seasonYear,
          teamId: team.id,
          eligible: eligibleTeamIdsDraftSet.has(team.id),
        }),
      ),
    );
    setSavingEligibility(false);

    const error = results.find((result) => result.error)?.error;
    await refetch();
    onSaved();

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Atléticas presentes na abertura atualizadas.");
  }

  return (
    <div className="space-y-6">
      <section className="glass-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Pontuação da abertura
            </p>
            <p className="text-xs text-muted-foreground">
              O mesmo valor é aplicado a todas as atléticas confirmadas nesta temporada.
            </p>
          </div>

          {loading || loadingTeams ? (
            <Skeleton className="h-10 w-36" />
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <Label className="sr-only" htmlFor="opening-ceremony-bonus-points">
                Pontos
              </Label>
              <Input
                id="opening-ceremony-bonus-points"
                inputMode="numeric"
                min={1}
                maxLength={2}
                step={1}
                value={pointsDraft}
                disabled={!canConfigurePoints || savingPoints}
                onChange={(event) =>
                  setPointsDraft(event.target.value.replace(/\D/g, "").slice(0, 2))
                }
                className="w-16 text-center"
              />
              {canConfigurePoints ? (
                <Button
                  type="button"
                  onClick={() => void handleSavePoints()}
                  disabled={savingPoints || pointsDraft === String(settings?.points ?? "")}
                >
                  {savingPoints ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Salvar pontos
                </Button>
              ) : null}
            </div>
          )}
        </div>

        {isFinished ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Campeonato encerrado: a configuração está disponível somente para consulta.
          </p>
        ) : null}
      </section>

      <section className="glass-card space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Atléticas presentes na abertura
            </p>
            <p className="text-xs text-muted-foreground">
              {canManageEligibility
                ? "Selecione as atléticas que receberão o bônus desta temporada e salve as alterações."
                : "A seleção de atléticas fica disponível somente em revisão ou em andamento."}
            </p>
          </div>

          {canManageEligibility && settings ? (
            <div className="flex shrink-0 items-center gap-3">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={
                    allRegisteredActiveTeamsEligible
                      ? true
                      : hasEligibleRegisteredActiveTeam
                        ? "indeterminate"
                        : false
                  }
                  disabled={savingEligibility}
                  onCheckedChange={(checked) =>
                    handleSelectAllEligibleTeams(checked === true)
                  }
                />
                Selecionar todas
              </Label>
              <Button
                type="button"
                onClick={() => void handleSaveEligibility()}
                disabled={savingEligibility || !hasEligibilityChanges}
              >
                {savingEligibility ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salvar atléticas
              </Button>
            </div>
          ) : null}
        </div>

        {loading || loadingTeams ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : registeredActiveTeams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma atlética ativa inscrita nesta temporada.
          </p>
        ) : (
          <div className="columns-1 gap-2 sm:columns-2 lg:columns-3">
            {registeredActiveTeams.map((team) => {
              const isEligible = eligibleTeamIdsDraftSet.has(team.id);

              return (
                <Label
                  key={team.id}
                  className="mb-2 flex min-h-12 w-full break-inside-avoid-column items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm font-medium"
                >
                  <Checkbox
                    checked={isEligible}
                    disabled={!canManageEligibility || !settings || savingEligibility}
                    onCheckedChange={(checked) =>
                      handleEligibleChange(team.id, checked === true)
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{team.name}</span>
                </Label>
              );
            })}
          </div>
        )}

        {canManageEligibility && !settings ? (
          <p className="text-xs text-muted-foreground">
            Salve a quantidade de pontos antes de selecionar as atléticas.
          </p>
        ) : null}
      </section>
    </div>
  );
}
