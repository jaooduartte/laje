import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveInterlajeOpeningCeremonyBonusEligibility,
  saveInterlajeOpeningCeremonyBonusPoints,
  saveInterlajeWalkoverPenaltyCounts,
  saveInterlajeWalkoverPenaltyPoints,
} from "@/domain/interlaje/interlajeOpeningCeremonyBonus.repository";
import { saveInterlajePositionPointSettings } from "@/domain/interlaje/interlajeOverallStandings.repository";
import { useInterlajeOpeningCeremonyBonus } from "@/hooks/useInterlajeOpeningCeremonyBonus";
import { useInterlajePositionPointSettings } from "@/hooks/useInterlajePositionPointSettings";
import { ChampionshipStatus } from "@/lib/enums";
import type { Championship, Team } from "@/lib/types";

interface Props {
  selectedChampionship: Championship;
  teams: Team[];
  loadingTeams: boolean;
  canManageOpeningCeremonyBonus: boolean;
  onSaved: () => void;
  availableSeasonYears?: number[];
}

export function AdminInterlajeOpeningCeremonyBonus({
  selectedChampionship,
  teams,
  loadingTeams,
  canManageOpeningCeremonyBonus,
  onSaved,
  availableSeasonYears = [],
}: Props) {
  const seasonYear = selectedChampionship.current_season_year;
  const [positionPointsSeasonYear, setPositionPointsSeasonYear] = useState(
    String(seasonYear),
  );
  const {
    settings,
    eligibleTeamIds,
    registeredTeamIds,
    walkoverPenaltyPoints,
    walkoverCounts,
    loading,
    refetch,
  } = useInterlajeOpeningCeremonyBonus({
      championshipId: selectedChampionship.id,
      seasonYear,
    });
  const [pointsDraft, setPointsDraft] = useState("");
  const [savingPoints, setSavingPoints] = useState(false);
  const [eligibleTeamIdsDraft, setEligibleTeamIdsDraft] = useState<string[]>([]);
  const [savingEligibility, setSavingEligibility] = useState(false);
  const [walkoverPenaltyPointsDraft, setWalkoverPenaltyPointsDraft] = useState("");
  const [savingWalkoverPenaltyPoints, setSavingWalkoverPenaltyPoints] = useState(false);
  const [walkoverCountsDraft, setWalkoverCountsDraft] = useState<Record<string, string>>({});
  const [savingWalkoverCounts, setSavingWalkoverCounts] = useState(false);
  const [positionPointsDraft, setPositionPointsDraft] = useState<Record<number, string>>({});
  const [savingPositionPoints, setSavingPositionPoints] = useState(false);
  const selectedPositionPointsSeasonYear = Number(positionPointsSeasonYear);
  const {
    settings: positionPointSettings,
    loading: positionPointSettingsLoading,
    refetch: refetchPositionPointSettings,
  } = useInterlajePositionPointSettings({
    championshipId: selectedChampionship.id,
    seasonYear: selectedPositionPointsSeasonYear,
  });
  const configuredPoints = settings?.points;

  useEffect(() => {
    setPointsDraft(configuredPoints != null ? String(configuredPoints) : "");
  }, [configuredPoints]);

  useEffect(() => {
    setWalkoverPenaltyPointsDraft(
      walkoverPenaltyPoints != null ? String(walkoverPenaltyPoints) : "",
    );
  }, [walkoverPenaltyPoints]);

  useEffect(() => {
    setWalkoverCountsDraft(
      Object.fromEntries(
        walkoverCounts.map((count) => [count.teamId, String(count.walkoverCount)]),
      ),
    );
  }, [walkoverCounts]);

  useEffect(() => {
    setPositionPointsSeasonYear(String(seasonYear));
  }, [seasonYear]);

  useEffect(() => {
    setPositionPointsDraft(
      Object.fromEntries(
        Array.from({ length: 20 }, (_, index) => {
          const finalPosition = index + 1;
          const setting = positionPointSettings.find(
            (item) => item.final_position == finalPosition,
          );
          return [finalPosition, setting ? String(setting.points) : "0"];
        }),
      ),
    );
  }, [positionPointSettings]);

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
  const canConfigureWalkoverPenalties = canManageOpeningCeremonyBonus && !isFinished;
  const canConfigurePositionPoints = canManageOpeningCeremonyBonus && !isFinished;
  const canManageWalkoverCounts =
    canConfigureWalkoverPenalties && walkoverPenaltyPoints != null;
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
  const persistedWalkoverCountByTeamId = useMemo(
    () => new Map(walkoverCounts.map((count) => [count.teamId, count.walkoverCount])),
    [walkoverCounts],
  );
  const hasWalkoverCountsChanges = registeredActiveTeams.some((team) => {
    const draftCount = Number(walkoverCountsDraft[team.id] ?? "0");
    return draftCount !== (persistedWalkoverCountByTeamId.get(team.id) ?? 0);
  });
  const hasPositionPointsChanges = Array.from({ length: 20 }, (_, index) => {
    const finalPosition = index + 1;
    const persistedValue = positionPointSettings.find(
      (setting) => setting.final_position == finalPosition,
    )?.points;
    return Number(positionPointsDraft[finalPosition] ?? "0") !== (persistedValue ?? 0);
  }).some(Boolean);
  const positionPointSeasonOptions = [...new Set([seasonYear, ...availableSeasonYears])]
    .filter((year): year is number => Number.isFinite(year))
    .sort((firstYear, secondYear) => secondYear - firstYear);

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

  async function handleSaveWalkoverPenaltyPoints() {
    const normalizedPoints = walkoverPenaltyPointsDraft.trim();
    if (!/^[1-9]\d*$/.test(normalizedPoints)) {
      toast.error("Informe uma quantidade inteira positiva de pontos por W.O.");
      return;
    }

    setSavingWalkoverPenaltyPoints(true);
    const { error } = await saveInterlajeWalkoverPenaltyPoints({
      championshipId: selectedChampionship.id,
      seasonYear,
      points: Number(normalizedPoints),
    });
    setSavingWalkoverPenaltyPoints(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    await refetch();
    onSaved();
    toast.success("Pontuação da penalidade por W.O. atualizada.");
  }

  function handleWalkoverCountChange(teamId: string, value: string) {
    setWalkoverCountsDraft((currentCounts) => ({
      ...currentCounts,
      [teamId]: value.replace(/\D/g, "").slice(0, 3),
    }));
  }

  async function handleSaveWalkoverCounts() {
    const counts = registeredActiveTeams.map((team) => ({
      teamId: team.id,
      walkoverCount: Number(walkoverCountsDraft[team.id] ?? "0"),
    }));
    setSavingWalkoverCounts(true);
    const { error } = await saveInterlajeWalkoverPenaltyCounts({
      championshipId: selectedChampionship.id,
      seasonYear,
      counts,
    });
    setSavingWalkoverCounts(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    await refetch();
    onSaved();
    toast.success("Penalidades por W.O. atualizadas.");
  }

  function handlePositionPointChange(finalPosition: number, value: string) {
    setPositionPointsDraft((currentPoints) => ({
      ...currentPoints,
      [finalPosition]: value.replace(/\D/g, "").slice(0, 3),
    }));
  }

  async function handleSavePositionPoints() {
    const settings = Array.from({ length: 20 }, (_, index) => {
      const finalPosition = index + 1;
      const value = positionPointsDraft[finalPosition] ?? "";
      return { finalPosition, value };
    });

    if (settings.some((setting) => !/^\d+$/.test(setting.value))) {
      toast.error("Informe uma quantidade inteira não negativa para todas as posições.");
      return;
    }

    setSavingPositionPoints(true);
    const { error } = await saveInterlajePositionPointSettings({
      championshipId: selectedChampionship.id,
      seasonYear: selectedPositionPointsSeasonYear,
      settings: settings.map((setting) => ({
        final_position: setting.finalPosition,
        points: Number(setting.value),
      })),
    });
    setSavingPositionPoints(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    await refetchPositionPointSettings();
    onSaved();
    toast.success("Pontuação por colocação atualizada.");
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="order-1 glass-card space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Pontuação por colocação
            </p>
            <p className="text-xs text-muted-foreground">
              A mesma tabela define os pontos do 1º ao 20º lugar para todas as modalidades, naipes e divisões da temporada.
            </p>
          </div>
          <div className="w-full sm:w-40">
            <Label className="sr-only" htmlFor="position-points-season">
              Temporada
            </Label>
            <Select
              value={positionPointsSeasonYear}
              onValueChange={setPositionPointsSeasonYear}
            >
              <SelectTrigger id="position-points-season" className="app-input-field">
                <SelectValue placeholder="Temporada" />
              </SelectTrigger>
              <SelectContent>
                {positionPointSeasonOptions.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {positionPointSettingsLoading ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-flow-col sm:grid-cols-2 sm:grid-rows-[repeat(10,minmax(0,1fr))] lg:grid-cols-4 lg:grid-rows-5 xl:grid-cols-5 xl:grid-rows-4">
            {Array.from({ length: 20 }, (_, index) => {
              const finalPosition = index + 1;
              return (
                <div
                  key={finalPosition}
                  className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2"
                >
                  <Label
                    htmlFor={`position-points-${finalPosition}`}
                    className="min-w-0 flex-1 text-sm font-medium"
                  >
                    {finalPosition}º lugar
                  </Label>
                  <Input
                    id={`position-points-${finalPosition}`}
                    inputMode="numeric"
                    min={0}
                    maxLength={3}
                    step={1}
                    value={positionPointsDraft[finalPosition] ?? ""}
                    disabled={!canConfigurePositionPoints || savingPositionPoints}
                    onChange={(event) =>
                      handlePositionPointChange(finalPosition, event.target.value)
                    }
                    className="w-16 text-center"
                  />
                </div>
              );
            })}
          </div>
        )}

        {canConfigurePositionPoints ? (
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => void handleSavePositionPoints()}
              disabled={
                savingPositionPoints ||
                positionPointSettingsLoading ||
                !hasPositionPointsChanges
              }
            >
              {savingPositionPoints ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar pontuação por colocação
            </Button>
          </div>
        ) : null}
      </section>

      <section className="order-3 glass-card space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Penalidades por W.O.
            </p>
            <p className="text-xs text-muted-foreground">
              Cada W.O. informado desconta o mesmo valor da classificação geral.
            </p>
          </div>

          {loading || loadingTeams ? (
            <Skeleton className="h-10 w-36" />
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <Label htmlFor="walkover-penalty-points" className="text-sm font-medium">
                Pontos por W.O.
              </Label>
              <Input
                id="walkover-penalty-points"
                inputMode="numeric"
                min={1}
                maxLength={2}
                step={1}
                value={walkoverPenaltyPointsDraft}
                placeholder="0"
                disabled={!canConfigureWalkoverPenalties || savingWalkoverPenaltyPoints}
                onChange={(event) =>
                  setWalkoverPenaltyPointsDraft(
                    event.target.value.replace(/\D/g, "").slice(0, 2),
                  )
                }
                className="w-16 text-center"
              />
              {canConfigureWalkoverPenalties ? (
                <Button
                  type="button"
                  onClick={() => void handleSaveWalkoverPenaltyPoints()}
                  disabled={
                    savingWalkoverPenaltyPoints ||
                    walkoverPenaltyPointsDraft === String(walkoverPenaltyPoints ?? "")
                  }
                >
                  {savingWalkoverPenaltyPoints ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Salvar penalidade
                </Button>
              ) : null}
            </div>
          )}
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
            {registeredActiveTeams.map((team) => (
              <div
                key={team.id}
                className="mb-2 flex min-h-12 w-full break-inside-avoid-column items-center gap-3 rounded-lg border border-border/60 px-3 py-2"
              >
                <Label htmlFor={`walkover-count-${team.id}`} className="min-w-0 flex-1 truncate text-sm font-medium">
                  {team.name}
                </Label>
                <Input
                  id={`walkover-count-${team.id}`}
                  aria-label={`W.O. de ${team.name}`}
                  inputMode="numeric"
                  min={0}
                  maxLength={3}
                  step={1}
                  value={walkoverCountsDraft[team.id] ?? ""}
                  placeholder="0"
                  disabled={!canManageWalkoverCounts || savingWalkoverCounts}
                  onChange={(event) => handleWalkoverCountChange(team.id, event.target.value)}
                  className="w-16 text-center"
                />
              </div>
            ))}
          </div>
        )}

        {canManageWalkoverCounts && registeredActiveTeams.length > 0 ? (
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => void handleSaveWalkoverCounts()}
              disabled={savingWalkoverCounts || !hasWalkoverCountsChanges}
            >
              {savingWalkoverCounts ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar penalidades
            </Button>
          </div>
        ) : null}

        {canConfigureWalkoverPenalties && walkoverPenaltyPoints == null ? (
          <p className="text-xs text-muted-foreground">
            Salve a pontuação antes de informar as penalidades por atlética.
          </p>
        ) : null}
      </section>

      <section className="order-2 glass-card space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Bônus da abertura
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
                  Salvar bônus
                </Button>
              ) : null}
            </div>
          )}
        </div>

        {isFinished ? (
          <p className="text-xs text-muted-foreground">
            Campeonato encerrado: a configuração está disponível somente para consulta.
          </p>
        ) : null}

        <div className="space-y-4 border-t border-border/60 pt-4">
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
        </div>
      </section>
    </div>
  );
}
