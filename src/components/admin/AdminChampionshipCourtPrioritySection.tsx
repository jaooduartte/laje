import { AdminListSkeleton } from "@/components/skeletons/AdminListSkeleton";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  LockKeyhole,
} from "lucide-react";
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
} from "@/domain/championship-brackets/championshipBracket.repository";
import type {
  BracketLocationSportPriorityGroup,
  BracketLocationSportPriorityUpdate,
  ChampionshipBracketCourtSequenceMode,
  ChampionshipBracketReconfigurationRequest,
} from "@/domain/championship-brackets/championshipBracket.types";

interface Props {
  bracketEditionId: string;
  isEditable: boolean;
  usesDivisions: boolean;
  sportNameBySportId: Record<string, string>;
  naipeOptionsBySportId: Record<string, MatchNaipe[]>;
  divisionOptionsBySportId: Record<string, TeamDivision[]>;
  onRequestReconfiguration: (request: ChampionshipBracketReconfigurationRequest) => Promise<boolean>;
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

interface PreviewDay {
  bracket_day_id: string;
  event_date: string;
  entries: PreviewEntry[];
}

interface ConsolidatedPriorityGroup {
  key: string;
  location_name: string;
  sport_id: string;

  occurrences: BracketLocationSportPriorityGroup[];

  availableNaipeOptions: MatchNaipe[];
  availableDivisionOptions: TeamDivision[];

  modeOptions: PriorityModeOption[];

  persistedPriorityMode: CourtPriorityMode | null;
  hasMixedPriorityModes: boolean;

  canDistributeAcrossCourts: boolean;
  hasFlexibleCourts: boolean;
  lockedCourtCount: number;
}

function normalizeLocationName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ");
}

function formatPriorityEventDate(value: string): string {
  const [, month, day] = value.split("-");

  if (!month || !day) {
    return value;
  }

  return `${day}/${month}`;
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
    const sequenceLabel =
      resolveSequenceModeLabel(entry.sequence_modes);

    if (entry.preferred_naipe != null) {
      return `${sequenceLabel} • ${
        MATCH_NAIPE_LABELS[entry.preferred_naipe]
      }`;
    }

    if (entry.preferred_division != null) {
      return `${sequenceLabel} • ${
        TEAM_DIVISION_LABELS[
          entry.preferred_division
        ]
      }`;
    }

    return sequenceLabel;
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
  canDistributeAcrossCourts: boolean;
}): PriorityModeOption[] {
  const options: PriorityModeOption[] = [
    {
      value: "NONE",
      label: "Sem prioridade fixa",
      helper:
        "As quadras ficam livres e a fila usa qualquer combinação disponível.",
    },
  ];

  if (
    params.canDistributeAcrossCourts &&
    params.availableNaipeOptions.length > 1
  ) {
    options.push({
      value: "NAIPE",
      label: "Revezar por naipe",
      helper: `As quadras alternam entre ${params.availableNaipeOptions
        .map((naipeOption) => MATCH_NAIPE_LABELS[naipeOption])
        .join(" e ")}.`,
    });
  }

  if (
    params.canDistributeAcrossCourts &&
    params.usesDivisions &&
    params.availableDivisionOptions.length > 1
  ) {
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

function resolvePriorityModeLabel(
  mode: CourtPriorityMode | null,
): string {
  if (mode === "NAIPE") {
    return "Revezar por naipe";
  }

  if (mode === "DIVISION") {
    return "Revezar por divisão";
  }

  if (mode === "NONE") {
    return "Sem prioridade fixa";
  }

  return "Configurações diferentes por data";
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
  onRequestReconfiguration,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [savingGroupKey, setSavingGroupKey] = useState<string | null>(null);
  const [priorityGroups, setPriorityGroups] = useState<
    BracketLocationSportPriorityGroup[]
  >([]);
  const [selectedModeByGroupKey, setSelectedModeByGroupKey] = useState<
    Record<string, CourtPriorityMode>
  >({});
  const [expandedGroupKeys, setExpandedGroupKeys] =
    useState<Set<string>>(new Set());

  function toggleGroupExpanded(groupKey: string) {
    setExpandedGroupKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);

      if (nextKeys.has(groupKey)) {
        nextKeys.delete(groupKey);
      } else {
        nextKeys.add(groupKey);
      }

      return nextKeys;
    });
  }

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

  const groupedCards = useMemo<
    ConsolidatedPriorityGroup[]
  >(() => {
    const consolidatedGroups = new Map<
      string,
      {
        key: string;
        location_name: string;
        sport_id: string;
        occurrences: BracketLocationSportPriorityGroup[];
      }
    >();

    priorityGroups.forEach((occurrence) => {
      const key = `${normalizeLocationName(
        occurrence.location_name,
      )}:${occurrence.sport_id}`;

      const existingGroup =
        consolidatedGroups.get(key);

      if (existingGroup) {
        existingGroup.occurrences.push(occurrence);
        return;
      }

      consolidatedGroups.set(key, {
        key,
        location_name: occurrence.location_name,
        sport_id: occurrence.sport_id,
        occurrences: [occurrence],
      });
    });

    return [...consolidatedGroups.values()]
      .map((group) => {
        const occurrences = [
          ...group.occurrences,
        ].sort((left, right) =>
          left.event_date.localeCompare(
            right.event_date,
          ),
        );

        const availableNaipeOptions =
          naipeOptionsBySportId[group.sport_id] ??
          [];

        const availableDivisionOptions =
          divisionOptionsBySportId[
            group.sport_id
          ] ?? [];

        const canDistributeAcrossCourts =
          occurrences.some(
            (occurrence) =>
              occurrence.courts.length >= 2 &&
              occurrence.courts.some(
                (court) =>
                  !court.is_sequence_locked,
              ),
          );

        const modeOptions = resolveModeOptions({
          availableDivisionOptions,
          availableNaipeOptions,
          usesDivisions,
          canDistributeAcrossCourts,
        });

        const persistedPriorityModes = [
          ...new Set(
            occurrences.map(
              (occurrence) =>
                occurrence.priority_mode as CourtPriorityMode,
            ),
          ),
        ];

        const persistedPriorityMode =
          persistedPriorityModes.length === 1
            ? persistedPriorityModes[0]
            : null;

        const allCourts = occurrences.flatMap(
          (occurrence) => occurrence.courts,
        );

        return {
          ...group,
          occurrences,

          availableNaipeOptions,
          availableDivisionOptions,
          modeOptions,

          persistedPriorityMode,

          hasMixedPriorityModes:
            persistedPriorityModes.length > 1,

          canDistributeAcrossCourts,

          hasFlexibleCourts:
            allCourts.some(
              (court) =>
                !court.is_sequence_locked,
            ),

          lockedCourtCount:
            allCourts.filter(
              (court) =>
                court.is_sequence_locked,
            ).length,
        };
      })
      .sort((left, right) => {
        const locationComparison =
          left.location_name.localeCompare(
            right.location_name,
            "pt-BR",
            {
              sensitivity: "base",
            },
          );

        if (locationComparison !== 0) {
          return locationComparison;
        }

        return (
          sportNameBySportId[left.sport_id] ??
          ""
        ).localeCompare(
          sportNameBySportId[right.sport_id] ??
            "",
          "pt-BR",
          {
            sensitivity: "base",
          },
        );
      });
  }, [
    divisionOptionsBySportId,
    naipeOptionsBySportId,
    priorityGroups,
    sportNameBySportId,
    usesDivisions,
  ]);

  function resolveSelectedMode(
    group: ConsolidatedPriorityGroup,
  ): CourtPriorityMode | null {
    return (
      selectedModeByGroupKey[group.key] ??
      group.persistedPriorityMode
    );
  }

  function hasPendingChanges(
    group: ConsolidatedPriorityGroup,
  ): boolean {
    const selectedMode =
      resolveSelectedMode(group);

    if (selectedMode == null) {
      return false;
    }

    return group.occurrences.some(
      (occurrence) =>
        occurrence.priority_mode !==
        selectedMode,
    );
  }

  function resolvePreviewDays(
    group: ConsolidatedPriorityGroup,
  ): PreviewDay[] {
    const selectedMode =
      resolveSelectedMode(group);

    return group.occurrences.map(
      (occurrence) => {
        const flexibleCourts =
          occurrence.courts.filter(
            (court) =>
              !court.is_sequence_locked,
          );

        const nextPreferences =
          selectedMode == null
            ? []
            : buildCourtPriorityPreferencesForMode({
                entries: flexibleCourts.map(
                  (court) => ({
                    preferred_naipe:
                      court.preferred_naipe,
                    preferred_division:
                      court.preferred_division,
                  }),
                ),
                mode: selectedMode,
                naipeOptions:
                  group.availableNaipeOptions,
                divisionOptions:
                  group.availableDivisionOptions,
              });

        const preferenceByCourtGroupId =
          flexibleCourts.reduce<
            Map<
              string,
              {
                preferred_naipe:
                  | MatchNaipe
                  | null;
                preferred_division:
                  | TeamDivision
                  | null;
              }
            >
          >((carry, court, index) => {
            const nextPreference =
              nextPreferences[index];

            carry.set(
              court.court_group_id,
              selectedMode == null
                ? {
                    preferred_naipe:
                      court.preferred_naipe,
                    preferred_division:
                      court.preferred_division,
                  }
                : {
                    preferred_naipe:
                      nextPreference
                        ?.preferred_naipe ??
                      null,

                    preferred_division:
                      nextPreference
                        ?.preferred_division ??
                      null,
                  },
            );

            return carry;
          }, new Map());

        const entries =
          occurrence.courts.map(
            (court): PreviewEntry => {
              const nextPreference =
                preferenceByCourtGroupId.get(
                  court.court_group_id,
                );

              return {
                court_group_id:
                  court.court_group_id,

                court_name:
                  court.court_name,

                preferred_naipe:
                  court.is_sequence_locked
                    ? court.preferred_naipe
                    : nextPreference
                        ?.preferred_naipe ??
                      null,

                preferred_division:
                  court.is_sequence_locked
                    ? court.preferred_division
                    : nextPreference
                        ?.preferred_division ??
                      null,

                sequence_modes:
                  court.sequence_modes,

                is_sequence_locked:
                  court.is_sequence_locked,
              };
            },
          );

        return {
          bracket_day_id:
            occurrence.bracket_day_id,

          event_date:
            occurrence.event_date,

          entries,
        };
      },
    );
  }

  async function saveGroup(
    group: ConsolidatedPriorityGroup,
  ) {
    const selectedMode =
      resolveSelectedMode(group);

    if (
      !group.hasFlexibleCourts ||
      selectedMode == null
    ) {
      return;
    }

    const uniqueUpdates =
      new Map<
        string,
        BracketLocationSportPriorityUpdate
      >();

    group.occurrences.forEach(
      (occurrence) => {
        const key = `${occurrence.location_group_id}:${occurrence.sport_id}`;

        uniqueUpdates.set(key, {
          location_group_id:
            occurrence.location_group_id,

          sport_id:
            occurrence.sport_id,

          priority_mode:
            selectedMode,
        });
      },
    );

    const updates = [
      ...uniqueUpdates.values(),
    ];

    const sportName =
      sportNameBySportId[group.sport_id] ??
      "Modalidade";

    const eventDates = group.occurrences
      .map((occurrence) => occurrence.event_date)
      .sort();

    const eventDateLabels = eventDates.map(
      formatPriorityEventDate,
    );

    const currentPriorityLabel =
      group.hasMixedPriorityModes
        ? "Configurações diferentes por data"
        : resolvePriorityModeLabel(
            group.persistedPriorityMode,
          );

    const targetPriorityLabel =
      resolvePriorityModeLabel(selectedMode);

    setSavingGroupKey(group.key);

    const previewCreated =
      await onRequestReconfiguration({
        action:
          "LOCATION_SPORT_PRIORITIES",

        label: `Prioridade de quadras em ${
          group.location_name
        } • ${sportName}`,

        payload: {
          priority_updates: updates,

          location_name:
            group.location_name,

          sport_name:
            sportName,

          occurrence_count:
            group.occurrences.length,

          event_dates:
            eventDates,

          event_date_labels:
            eventDateLabels,

          current_priority_mode:
            group.persistedPriorityMode,

          current_priority_label:
            currentPriorityLabel,

          target_priority_mode:
            selectedMode,

          target_priority_label:
            targetPriorityLabel,

          protected_court_count:
            group.lockedCourtCount,
        },
      });

    setSavingGroupKey(null);

    if (!previewCreated) {
      return;
    }
  }

  if (loading) {
    return (
      <AdminListSkeleton
        count={3}
        showActions
      />
    );
  }

  if (groupedCards.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        Nenhuma modalidade coletiva possui jogos agendados para configurar.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groupedCards.map((group) => {
        const selectedMode =
          resolveSelectedMode(group);

        const previewDays =
          resolvePreviewDays(group);

        const isSaving =
          savingGroupKey === group.key;

        const isExpanded =
          expandedGroupKeys.has(group.key);

        const selectedModeLabel =
          selectedMode == null
            ? "Configurações diferentes"
            : group.modeOptions.find(
                (modeOption) =>
                  modeOption.value ===
                  selectedMode,
              )?.label ??
              "Sem prioridade fixa";

        return (
          <div
            key={group.key}
            className="glass-card overflow-hidden"
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/20"
              aria-expanded={isExpanded}
              onClick={() =>
                toggleGroupExpanded(group.key)
              }
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold">
                    {group.location_name} •{" "}
                    {sportNameBySportId[
                      group.sport_id
                    ] ?? "Modalidade"}
                  </h4>

                  {group.hasMixedPriorityModes ? (
                    <AppBadge
                      tone={AppBadgeTone.AMBER}
                    >
                      Configurações diferentes
                    </AppBadge>
                  ) : null}

                  {group.lockedCourtCount > 0 ? (
                    <AppBadge
                      tone={AppBadgeTone.SILVER}
                    >
                      Configurações protegidas
                    </AppBadge>
                  ) : null}

                  {hasPendingChanges(group) ? (
                    <AppBadge
                      tone={AppBadgeTone.AMBER}
                    >
                      Alterações pendentes
                    </AppBadge>
                  ) : null}
                </div>

                <p className="text-xs text-muted-foreground">
                  {group.occurrences.length} data(s)
                  {" • "}
                  {selectedModeLabel}
                </p>
              </div>

              {isExpanded ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </button>

            {isExpanded ? (
              <div className="space-y-4 border-t border-border/40 p-4">
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">
                    Esta prioridade é aplicada às quadras elegíveis deste local
                    nos dias em que a modalidade possui jogos.
                  </p>
                </div>

                {group.lockedCourtCount > 0 ? (
                  <div className="flex items-start gap-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                    <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />

                    <p>
                      {group.lockedCourtCount === 1
                        ? "Uma quadra mantém"
                        : `${group.lockedCourtCount} quadras mantêm`}{" "}
                      o sequenciamento definido na etapa 11. A prioridade global
                      será aplicada somente às quadras flexíveis.
                    </p>
                  </div>
                ) : null}

                <div className="space-y-4">
                  {group.canDistributeAcrossCourts ? (
                    <RadioGroup
                      value={selectedMode ?? undefined}
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
                      className={`grid gap-2 ${
                        group.modeOptions.length >= 3
                          ? "md:grid-cols-3"
                          : group.modeOptions.length === 2
                            ? "md:grid-cols-2"
                            : "grid-cols-1"
                      }`}
                    >
                      {group.modeOptions.map((modeOption) => (
                        <label
                          key={modeOption.value}
                          className={`app-card-muted flex items-start gap-3 p-3 transition-opacity has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5 ${
                            isEditable &&
                            group.hasFlexibleCourts &&
                            savingGroupKey == null
                              ? "cursor-pointer"
                              : "cursor-default opacity-45"
                          }`}
                        >
                          <RadioGroupItem
                            value={modeOption.value}
                            className="mt-0.5 disabled:cursor-default"
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
                  ) : (
                    <div className="app-card-muted flex items-start gap-3 p-3">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          Sem distribuição entre quadras
                        </p>

                        <p className="text-xs text-muted-foreground">
                          Esta modalidade possui apenas uma quadra elegível em
                          cada data. Não há revezamento entre quadras para
                          configurar.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="app-card-muted space-y-3 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          Distribuição por data
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Veja como as quadras elegíveis ficarão em cada dia em
                          que a modalidade possui jogos.
                        </p>
                      </div>
                      <AppBadge
                        tone={
                          selectedMode != null
                            ? resolvePriorityBadgeTone(selectedMode)
                            : AppBadgeTone.NEUTRAL
                        }
                      >
                        {selectedModeLabel}
                      </AppBadge>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {previewDays.map((previewDay) => (
                        <div
                          key={previewDay.bracket_day_id}
                          className="space-y-2 rounded-xl border border-border/50 p-2.5"
                        >
                          <p className="text-xs font-semibold">
                            {formatPriorityEventDate(
                              previewDay.event_date,
                            )}
                          </p>

                          {previewDay.entries.map(
                            (entry) => (
                              <div
                                key={`${previewDay.bracket_day_id}:${entry.court_group_id}`}
                                className="rounded-lg border border-border/60 bg-background/40 px-3 py-2"
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

                                  <AppBadge
                                    tone={resolvePreferenceBadgeTone(
                                      entry,
                                    )}
                                  >
                                    {resolvePreferencePreviewLabel(
                                      entry,
                                    )}
                                  </AppBadge>
                                </div>

                                <p className="mt-1 text-xs text-muted-foreground">
                                  {resolvePreferencePreviewDescription({
                                    entry,
                                    mode:
                                      selectedMode ?? "NONE",

                                    availableDivisionOptions:
                                      group.availableDivisionOptions,

                                    availableNaipeOptions:
                                      group.availableNaipeOptions,

                                    usesDivisions,
                                  })}
                                </p>
                              </div>
                            ),
                          )}
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
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
