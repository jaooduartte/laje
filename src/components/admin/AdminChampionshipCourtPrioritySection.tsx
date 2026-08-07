import { useCallback, useEffect, useMemo, useState } from "react";
import { Info, Loader2, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AppBadge } from "@/components/ui/app-badge";
import { AppBadgeTone, MatchNaipe, TeamDivision } from "@/lib/enums";
import {
  MATCH_NAIPE_BADGE_TONES,
  MATCH_NAIPE_LABELS,
  TEAM_DIVISION_BADGE_TONES,
  TEAM_DIVISION_LABELS,
} from "@/lib/championship";
import {
  buildCourtPriorityPreferencesForMode,
  type CourtPriorityMode,
} from "@/components/admin/adminCourtPriority.utils";
import {
  getBracketLocationSportPriorities,
  updateBracketLocationSportPriorities,
} from "@/domain/championship-brackets/championshipBracket.repository";
import type {
  BracketLocationSportPriorityGroup,
  BracketLocationSportPriorityUpdate,
  ChampionshipBracketCourtSequenceMode,
} from "@/domain/championship-brackets/championshipBracket.types";

interface Props {
  bracketEditionId: string;
  isEditable: boolean;
  usesDivisions: boolean;
  sportNameBySportId: Record<string, string>;
  naipeOptionsBySportId: Record<string, MatchNaipe[]>;
  divisionOptionsBySportId: Record<string, TeamDivision[]>;
  onSaved: () => void;
}

interface PriorityModeOption {
  value: CourtPriorityMode;
  label: string;
  helper: string;
}

interface PreviewEntry {
  court_group_id: string;
  court_name: string;
  preferred_naipe: MatchNaipe | null;
  preferred_division: TeamDivision | null;
  sequence_modes: ChampionshipBracketCourtSequenceMode[];
  is_sequence_locked: boolean;
}

function resolveSequenceModeLabel(
  sequenceModes: ChampionshipBracketCourtSequenceMode[],
): string {
  const groupsByNaipe = sequenceModes.includes("GROUP_NAIPE");

  const groupsByDivision = sequenceModes.includes("GROUP_DIVISION");

  if (groupsByNaipe && groupsByDivision) {
    return "Sequenciamento protegido";
  }

  if (groupsByNaipe) {
    return "Agrupado por naipe";
  }

  if (groupsByDivision) {
    return "Agrupado por divisão";
  }

  return "Sequenciamento flexível";
}

function resolvePriorityBadgeTone(mode: CourtPriorityMode): AppBadgeTone {
  if (mode === "NAIPE") {
    return AppBadgeTone.SKY;
  }

  if (mode === "DIVISION") {
    return AppBadgeTone.AMBER;
  }

  return AppBadgeTone.NEUTRAL;
}

function resolvePreferenceBadgeTone(entry: PreviewEntry): AppBadgeTone {
  if (entry.is_sequence_locked) {
    return AppBadgeTone.PRIMARY;
  }

  if (entry.preferred_naipe != null) {
    return MATCH_NAIPE_BADGE_TONES[entry.preferred_naipe];
  }

  if (entry.preferred_division != null) {
    return TEAM_DIVISION_BADGE_TONES[entry.preferred_division];
  }

  return AppBadgeTone.NEUTRAL;
}

function resolvePreferencePreviewLabel(entry: PreviewEntry): string {
  if (entry.is_sequence_locked) {
    return resolveSequenceModeLabel(entry.sequence_modes);
  }

  if (entry.preferred_naipe != null) {
    return MATCH_NAIPE_LABELS[entry.preferred_naipe];
  }

  if (entry.preferred_division != null) {
    return TEAM_DIVISION_LABELS[entry.preferred_division];
  }

  return "Sem prioridade";
}

function resolveModeOptions(params: {
  availableDivisionOptions: TeamDivision[];
  availableNaipeOptions: MatchNaipe[];
  usesDivisions: boolean;
}): PriorityModeOption[] {
  const options: PriorityModeOption[] = [
    {
      value: "NONE",
      label: "Sem prioridade fixa",
      helper:
        "As quadras ficam livres e a fila usa qualquer combinação disponível.",
    },
  ];

  if (params.availableNaipeOptions.length > 1) {
    options.push({
      value: "NAIPE",
      label: "Revezar por naipe",
      helper: `As quadras alternam entre ${params.availableNaipeOptions
        .map((naipeOption) => MATCH_NAIPE_LABELS[naipeOption])
        .join(" e ")}.`,
    });
  }

  if (params.usesDivisions && params.availableDivisionOptions.length > 1) {
    options.push({
      value: "DIVISION",
      label: "Revezar por divisão",
      helper: `As quadras alternam entre ${params.availableDivisionOptions
        .map((divisionOption) => TEAM_DIVISION_LABELS[divisionOption])
        .join(" e ")}.`,
    });
  }

  return options;
}

function resolvePreferencePreviewDescription(params: {
  entry: PreviewEntry;
  mode: CourtPriorityMode;
  availableDivisionOptions: TeamDivision[];
  availableNaipeOptions: MatchNaipe[];
  usesDivisions: boolean;
}): string {
  const {
    entry,
    mode,
    availableDivisionOptions,
    availableNaipeOptions,
    usesDivisions,
  } = params;

  if (entry.is_sequence_locked) {
    return [
      "Esta quadra mantém o sequenciamento",
      "estrito definido na etapa 11 e não",
      "será alterada pela prioridade global",
      "da agenda.",
    ].join(" ");
  }

  if (mode === "NAIPE" && entry.preferred_naipe != null) {
    const alternatingDivisions =
      usesDivisions && availableDivisionOptions.length > 1
        ? ` e alterna ${availableDivisionOptions.map((divisionOption) => TEAM_DIVISION_LABELS[divisionOption]).join("/")} quando possível.`
        : ".";

    return `Essa quadra prioriza jogos do naipe ${MATCH_NAIPE_LABELS[entry.preferred_naipe]}${alternatingDivisions}`;
  }

  if (mode === "DIVISION" && entry.preferred_division != null) {
    const alternatingNaipes =
      availableNaipeOptions.length > 1
        ? ` e alterna ${availableNaipeOptions.map((naipeOption) => MATCH_NAIPE_LABELS[naipeOption]).join("/")} quando possível.`
        : ".";

    return `Essa quadra prioriza jogos da ${TEAM_DIVISION_LABELS[entry.preferred_division]}${alternatingNaipes}`;
  }

  return "Essa quadra continua livre para receber qualquer combinação disponível.";
}

export function AdminChampionshipCourtPrioritySection({
  bracketEditionId,
  isEditable,
  usesDivisions,
  sportNameBySportId,
  naipeOptionsBySportId,
  divisionOptionsBySportId,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [savingGroupKey, setSavingGroupKey] = useState<string | null>(null);
  const [priorityGroups, setPriorityGroups] = useState<
    BracketLocationSportPriorityGroup[]
  >([]);
  const [selectedModeByGroupKey, setSelectedModeByGroupKey] = useState<
    Record<string, CourtPriorityMode>
  >({});

  const loadPriorityGroups = useCallback(
    async (options?: { preserveDrafts?: boolean }) => {
      setLoading(true);

      const { data, error } =
        await getBracketLocationSportPriorities(bracketEditionId);

      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      setPriorityGroups(data);

      if (!options?.preserveDrafts) {
        setSelectedModeByGroupKey({});
      }

      setLoading(false);
    },
    [bracketEditionId],
  );

  useEffect(() => {
    void loadPriorityGroups();
  }, [loadPriorityGroups]);

  const groupedCards = useMemo(() => {
    return priorityGroups.map((group) => {
      const key = `${group.location_group_id}:${group.sport_id}`;
      const availableNaipeOptions = naipeOptionsBySportId[group.sport_id] ?? [];
      const availableDivisionOptions =
        divisionOptionsBySportId[group.sport_id] ?? [];
      const modeOptions = resolveModeOptions({
        availableDivisionOptions,
        availableNaipeOptions,
        usesDivisions,
      });

      const flexibleCourts = group.courts.filter(
        (court) => !court.is_sequence_locked,
      );

      const lockedCourts = group.courts.filter(
        (court) => court.is_sequence_locked,
      );

      return {
        ...group,
        key,
        availableNaipeOptions,
        availableDivisionOptions,
        modeOptions,
        flexibleCourts,
        lockedCourts,
        hasFlexibleCourts: flexibleCourts.length > 0,
        hasLockedCourts: lockedCourts.length > 0,
      };
    });
  }, [
    divisionOptionsBySportId,
    naipeOptionsBySportId,
    priorityGroups,
    usesDivisions,
  ]);

  function resolveSelectedMode(
    group: (typeof groupedCards)[number],
  ): CourtPriorityMode {
    return selectedModeByGroupKey[group.key] ?? group.priority_mode;
  }

  function hasPendingChanges(group: (typeof groupedCards)[number]): boolean {
    return resolveSelectedMode(group) !== group.priority_mode;
  }

  function resolvePreviewEntries(
    group: (typeof groupedCards)[number],
  ): PreviewEntry[] {
    const nextPreferences = buildCourtPriorityPreferencesForMode({
      entries: group.flexibleCourts.map(() => ({
        preferred_naipe: null,
        preferred_division: null,
      })),
      mode: resolveSelectedMode(group),
      naipeOptions: group.availableNaipeOptions,
      divisionOptions: group.availableDivisionOptions,
    });

    const preferenceByCourtGroupId = group.flexibleCourts.reduce<
      Map<
        string,
        {
          preferred_naipe: MatchNaipe | null;
          preferred_division: TeamDivision | null;
        }
      >
    >((carry, court, index) => {
      carry.set(court.court_group_id, {
        preferred_naipe: nextPreferences[index]?.preferred_naipe ?? null,

        preferred_division: nextPreferences[index]?.preferred_division ?? null,
      });

      return carry;
    }, new Map());

    return group.courts.map((court) => {
      const nextPreference = preferenceByCourtGroupId.get(court.court_group_id);

      return {
        court_group_id: court.court_group_id,
        court_name: court.court_name,

        preferred_naipe: nextPreference?.preferred_naipe ?? null,

        preferred_division: nextPreference?.preferred_division ?? null,

        sequence_modes: court.sequence_modes,

        is_sequence_locked: court.is_sequence_locked,
      };
    });
  }

  async function saveGroup(group: (typeof groupedCards)[number]) {
    if (!group.hasFlexibleCourts) {
      return;
    }
    const updates: BracketLocationSportPriorityUpdate[] = [
      {
        location_group_id: group.location_group_id,
        sport_id: group.sport_id,
        priority_mode: resolveSelectedMode(group),
      },
    ];

    setSavingGroupKey(group.key);

    const { error } = await updateBracketLocationSportPriorities(
      bracketEditionId,
      updates,
    );

    setSavingGroupKey(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Prioridade global salva para ${group.location_name}.`);
    await loadPriorityGroups({ preserveDrafts: true });
    setSelectedModeByGroupKey((previousState) => {
      const nextState = { ...previousState };
      delete nextState[group.key];
      return nextState;
    });
    onSaved();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (groupedCards.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        Nenhum local possui duas ou mais quadras para a mesma modalidade.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          Escolha uma lógica única por local e modalidade para toda a edição. Ao
          salvar, a fila é reorganizada automaticamente com base nesse
          revezamento.
        </p>
        <div className="flex items-start gap-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p>
            A prioridade global continua flexível. Quadras com agrupamento
            estrito definido na etapa 11 permanecem protegidas e não são
            alteradas por esta configuração.
          </p>
        </div>
      </div>

      {groupedCards.map((group) => {
        const selectedMode = resolveSelectedMode(group);
        const previewEntries = resolvePreviewEntries(group);
        const isSaving = savingGroupKey === group.key;

        return (
          <div key={group.key} className="glass-card space-y-4 p-4">
            <div className="flex flex-col gap-1">
              <h4 className="text-sm font-medium">
                {group.location_name} •{" "}
                {sportNameBySportId[group.sport_id] ?? "Modalidade"}
              </h4>
              <p className="text-xs text-muted-foreground">
                Essa regra vale para todas as quadras desse local ao longo de
                todos os dias da edição.
              </p>
            </div>

            {group.hasLockedCourts ? (
              <div className="flex items-start gap-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />

                <p>
                  {group.lockedCourts.length === 1
                    ? "Uma quadra mantém"
                    : `${group.lockedCourts.length} quadras mantêm`}{" "}
                  o sequenciamento definido na etapa 11. A prioridade global
                  será aplicada somente às quadras flexíveis.
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.95fr)]">
              <div className="space-y-3">
                <RadioGroup
                  value={selectedMode}
                  disabled={
                    !isEditable ||
                    !group.hasFlexibleCourts ||
                    savingGroupKey != null
                  }
                  onValueChange={(value) =>
                    setSelectedModeByGroupKey((previousState) => ({
                      ...previousState,
                      [group.key]: value as CourtPriorityMode,
                    }))
                  }
                  className="space-y-2"
                >
                  {group.modeOptions.map((modeOption) => (
                    <label
                      key={modeOption.value}
                      className="app-card-muted flex cursor-pointer items-start gap-3 p-3 has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5"
                    >
                      <RadioGroupItem
                        value={modeOption.value}
                        className="mt-0.5"
                      />
                      <span className="space-y-0.5">
                        <span className="block text-sm font-medium">
                          {modeOption.label}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {modeOption.helper}
                        </span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </div>

              <div className="app-card-muted space-y-3 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      Preview da distribuição
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Veja como cada quadra ficará após salvar.
                    </p>
                  </div>
                  <AppBadge tone={resolvePriorityBadgeTone(selectedMode)}>
                    {group.modeOptions.find(
                      (modeOption) => modeOption.value === selectedMode,
                    )?.label ?? "Sem prioridade fixa"}
                  </AppBadge>
                </div>

                <div className="space-y-2">
                  {previewEntries.map((entry) => (
                    <div
                      key={`${group.key}:${entry.court_group_id}`}
                      className="rounded-xl border border-border/60 bg-background/40 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {entry.is_sequence_locked ? (
                            <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-primary" />
                          ) : null}

                          <p className="truncate text-sm font-medium">
                            {entry.court_name}
                          </p>
                        </div>
                        <AppBadge tone={resolvePreferenceBadgeTone(entry)}>
                          {resolvePreferencePreviewLabel(entry)}
                        </AppBadge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {resolvePreferencePreviewDescription({
                          entry,
                          mode: selectedMode,
                          availableDivisionOptions:
                            group.availableDivisionOptions,
                          availableNaipeOptions: group.availableNaipeOptions,
                          usesDivisions,
                        })}
                      </p>
                    </div>
                  ))}
                </div>

                {isEditable ? (
                  <div className="flex justify-end pt-1">
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        !group.hasFlexibleCourts ||
                        !hasPendingChanges(group) ||
                        savingGroupKey != null
                      }
                      onClick={() => void saveGroup(group)}
                    >
                      {isSaving ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : null}
                      Salvar prioridades
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
