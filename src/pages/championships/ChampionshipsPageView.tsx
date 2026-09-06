import { useEffect, useMemo, useRef, useState } from "react";
import { Award, HelpCircle, Medal, Trophy } from "lucide-react";
import { Header } from "@/components/Header";
import { PageContentSkeleton } from "@/components/skeletons/PageContentSkeleton";
import { CardListSkeleton } from "@/components/skeletons/CardListSkeleton";
import { MatchCard } from "@/components/MatchCard";
import {
  TeamStandingsTable,
  type TeamStandingsBadge,
} from "@/components/TeamStandingsTable";
import { IndividualSportStandingsTable } from "@/components/IndividualSportStandingsTable";
import { YellowCardDisciplineTable } from "@/components/YellowCardDisciplineTable";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsNavigationList,
  TabsNavigationTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatStandingsPoints,
  type TeamStandingAggregate,
} from "@/lib/standings";
import type { InterlajeCompetitionStanding } from "@/domain/interlaje/interlajeOverallStandings.repository";
import type {
  Championship,
  ChampionshipIndividualEvent,
  ChampionshipIndividualEventEntry,
  ChampionshipIndividualTeamStanding,
  CompetitionTeamDisqualification,
  Match,
  Sport,
  Standing,
  Team,
} from "@/lib/types";
import type {
  BracketGroupFilterOption,
  MatchBracketContext,
} from "@/lib/championship";
import type { ChampionshipChampionYearGroup } from "@/lib/championshipHistory";
import {
  compareAwardsRankingGoalScorers,
  type ChampionshipAwardsRankings,
} from "@/hooks/useChampionshipAwardsRankings";
import type { ChampionshipYellowCardDiscipline } from "@/hooks/useChampionshipYellowCardDiscipline";
import { ChampionshipCode, MatchNaipe, TeamDivision } from "@/lib/enums";
import { MATCH_NAIPE_LABELS, TEAM_DIVISION_LABELS } from "@/lib/championship";
import { resolveChampionshipSportSupportsAwards } from "@/lib/championshipAwards";
import type { ModalidadeConfig } from "@/lib/modalidadeConfig";
import { INDIVIDUAL_ENTRY_STATUS_LABELS } from "@/lib/individualEvents";
import {
  hasIndividualEventEntryResult,
  resolveIndividualEventsWithResults,
} from "@/pages/championships/championshipIndividualResults.utils";

const DISCIPLINE_ALL_FILTER = "ALL";
const DISCIPLINE_ALPHABETICAL_SORT = "ALPHABETICAL";
const DISCIPLINE_TOTAL_CARDS_SORT = "TOTAL_CARDS";
const DISCIPLINE_YELLOW_CARDS_SORT = "YELLOW_CARDS";
const DISCIPLINE_DIRECT_RED_CARDS_SORT = "DIRECT_RED_CARDS";
const DISCIPLINE_SUSPENDED_FIRST_SORT = "SUSPENDED_FIRST";

interface ChampionshipsPageViewProps {
  isLoading: boolean;
  isChampionshipContentLoading?: boolean;
  isStandingsLoading: boolean;
  championships: Championship[];
  selectedChampionship: Championship | null;
  selectedChampionshipCode: ChampionshipCode;
  selectedChampionshipIsFinished: boolean;
  championshipCardImageByCode: Record<ChampionshipCode, string>;
  sports: Sport[];
  nextMatches: Match[];
  isNextMatchesFetching: boolean;
  standingsSportFilter: string;
  standingsNaipeFilter: string;
  availableStandingsNaipeOptions?: MatchNaipe[];
  standingsYearFilter: string;
  standingsDivisionFilter: string;
  allStandingsSportFilter: string;
  allStandingsNaipeFilter: string;
  allStandingsDivisionFilter: string;
  selectedChampionshipHasDivisions: boolean;
  filteredStandings: TeamStandingAggregate[];
  standingsGroups?: Array<{
    label: string;
    standings: TeamStandingAggregate[];
  }>;
  isInterlajeCompetitionStandingsAvailable?: boolean;
  interlajeCompetitionStandings?: InterlajeCompetitionStanding[];
  hasInterlajeCompetitionProjectedPlacement?: boolean;
  hasInterlajeOverallProjectedPlacement?: boolean;
  pendingTieBreakTeamIds?: ReadonlySet<string>;
  teamBadgesByTeamId?: ReadonlyMap<string, TeamStandingsBadge[]>;
  isIndividualStandingsView?: boolean;
  individualStandingsRows?: Array<ChampionshipIndividualTeamStanding | Standing>;
  individualEvents?: ChampionshipIndividualEvent[];
  individualEntriesByEventId?: Record<
    string,
    ChampionshipIndividualEventEntry[]
  >;
  disqualifiedTeamKeys?: ReadonlySet<string>;
  isStandingsNaipeFilterLocked: boolean;
  standingsModalidadeConfig?: ModalidadeConfig;
  teamFilter: string;
  yearFilter: string;
  groupFilter: string;
  allTeamFilter: string;
  allYearFilter: string;
  availableStandingsYears: string[];
  historyGroupOptions: BracketGroupFilterOption[];
  historyTeams: Team[];
  historyYears: string[];
  filteredHistoryMatches: Match[];
  isHistoryMatchesFetching: boolean;
  championshipChampionHistory: ChampionshipChampionYearGroup[];
  overallPodiumStandings: TeamStandingAggregate[];
  awardsRankings: ChampionshipAwardsRankings | null;
  yellowCardDiscipline: ChampionshipYellowCardDiscipline | null;
  yellowCardDisciplineLoading?: boolean;
  yellowCardDisciplineError?: string | null;
  onRetryYellowCardDiscipline?: () => void;
  awardsSeasonYear: number | null;
  competitionDisqualifications?: CompetitionTeamDisqualification[];
  matchBracketContextByMatchId: Record<string, MatchBracketContext>;
  matchRepresentationByMatchId: Record<string, string>;
  estimatedStartTimeByMatchId: Record<string, string>;
  onSelectChampionshipCode: (value: ChampionshipCode) => void;
  onStandingsSportFilterChange: (value: string) => void;
  onStandingsNaipeFilterChange: (value: string) => void;
  onStandingsDivisionFilterChange: (value: string) => void;
  onStandingsYearFilterChange: (value: string) => void;
  onTeamFilterChange: (value: string) => void;
  onYearFilterChange: (value: string) => void;
  onGroupFilterChange: (value: string) => void;
}

export function ChampionshipsPageView({
  isLoading,
  isChampionshipContentLoading = false,
  isStandingsLoading,
  championships,
  selectedChampionship,
  selectedChampionshipCode,
  selectedChampionshipIsFinished,
  championshipCardImageByCode,
  sports,
  nextMatches,
  isNextMatchesFetching,
  standingsSportFilter,
  standingsNaipeFilter,
  availableStandingsNaipeOptions = [
    MatchNaipe.MASCULINO,
    MatchNaipe.FEMININO,
    MatchNaipe.MISTO,
  ],
  standingsYearFilter,
  standingsDivisionFilter,
  allStandingsSportFilter,
  allStandingsNaipeFilter,
  allStandingsDivisionFilter,
  selectedChampionshipHasDivisions,
  filteredStandings,
  standingsGroups = [],
  isInterlajeCompetitionStandingsAvailable = false,
  interlajeCompetitionStandings = [],
  hasInterlajeCompetitionProjectedPlacement = false,
  hasInterlajeOverallProjectedPlacement = false,
  pendingTieBreakTeamIds,
  teamBadgesByTeamId,
  isIndividualStandingsView = false,
  individualStandingsRows = [],
  individualEvents = [],
  individualEntriesByEventId = {},
  disqualifiedTeamKeys,
  isStandingsNaipeFilterLocked,
  standingsModalidadeConfig,
  teamFilter,
  yearFilter,
  groupFilter,
  allTeamFilter,
  allYearFilter,
  availableStandingsYears,
  historyGroupOptions,
  historyTeams,
  historyYears,
  filteredHistoryMatches,
  isHistoryMatchesFetching,
  championshipChampionHistory,
  overallPodiumStandings,
  awardsRankings,
  yellowCardDiscipline,
  yellowCardDisciplineLoading = false,
  yellowCardDisciplineError = null,
  onRetryYellowCardDiscipline,
  awardsSeasonYear,
  competitionDisqualifications = [],
  matchBracketContextByMatchId,
  matchRepresentationByMatchId,
  estimatedStartTimeByMatchId,
  onSelectChampionshipCode,
  onStandingsSportFilterChange,
  onStandingsNaipeFilterChange,
  onStandingsDivisionFilterChange,
  onStandingsYearFilterChange,
  onTeamFilterChange,
  onYearFilterChange,
  onGroupFilterChange,
}: ChampionshipsPageViewProps) {
  const [interlajeStandingsView, setInterlajeStandingsView] = useState<
    "groups" | "overall"
  >("groups");
  const interlajeCompetitionStandingsByDivision = useMemo(() => {
    const standingsByDivision = new Map<string, InterlajeCompetitionStanding[]>();

    interlajeCompetitionStandings.forEach((standing) => {
      const key = standing.division ?? "WITHOUT_DIVISION";
      standingsByDivision.set(key, [
        ...(standingsByDivision.get(key) ?? []),
        standing,
      ]);
    });

    return [...standingsByDivision.entries()].map(([division, standings]) => ({
      label:
        division == "WITHOUT_DIVISION"
          ? null
          : TEAM_DIVISION_LABELS[division as TeamDivision],
      standings,
    }));
  }, [interlajeCompetitionStandings]);

  useEffect(() => {
    setInterlajeStandingsView("groups");
  }, [standingsDivisionFilter, standingsNaipeFilter, standingsSportFilter, standingsYearFilter]);
  const firstPlaceTeam = overallPodiumStandings[0] ?? null;
  const secondPlaceTeam = overallPodiumStandings[1] ?? null;
  const thirdPlaceTeam = overallPodiumStandings[2] ?? null;
  const [isStandingsHelpTooltipHoverOpen, setIsStandingsHelpTooltipHoverOpen] =
    useState(false);
  const [isStandingsHelpTooltipClickOpen, setIsStandingsHelpTooltipClickOpen] =
    useState(false);
  const standingsHelpTooltipTimeoutReference = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const isStandingsHelpTooltipOpen =
    isStandingsHelpTooltipHoverOpen || isStandingsHelpTooltipClickOpen;
  const isInterlajeOverallStandingsView =
    selectedChampionship?.code == ChampionshipCode.INTERLAJE &&
    standingsSportFilter == allStandingsSportFilter &&
    standingsNaipeFilter == allStandingsNaipeFilter &&
    (!selectedChampionshipHasDivisions ||
      standingsDivisionFilter == allStandingsDivisionFilter);
  const [cardsSportFilter, setCardsSportFilter] = useState(
    DISCIPLINE_ALL_FILTER,
  );
  const [cardsNaipeFilter, setCardsNaipeFilter] = useState(
    DISCIPLINE_ALL_FILTER,
  );
  const [cardsDivisionFilter, setCardsDivisionFilter] = useState(
    DISCIPLINE_ALL_FILTER,
  );
  const [cardsTeamFilter, setCardsTeamFilter] = useState(
    DISCIPLINE_ALL_FILTER,
  );
  const [cardsSort, setCardsSort] = useState(DISCIPLINE_ALPHABETICAL_SORT);
  const [cardsAthleteQuery, setCardsAthleteQuery] = useState("");
  const [cardsOnlySuspended, setCardsOnlySuspended] = useState(false);
  const individualEventsWithResults = resolveIndividualEventsWithResults(
    individualEvents,
    individualEntriesByEventId,
  );
  const cardsSeasonYearFilter =
    standingsYearFilter == allYearFilter
      ? String(awardsSeasonYear ?? availableStandingsYears[0] ?? "")
      : standingsYearFilter;
  const availableCardSports = useMemo(() => {
    const sportsById = new Map<string, { id: string; name: string }>();

    (yellowCardDiscipline?.athletes ?? []).forEach((athlete) => {
      sportsById.set(athlete.sport_id, {
        id: athlete.sport_id,
        name: athlete.sport_name,
      });
    });

    return [...sportsById.values()].sort((firstSport, secondSport) =>
      firstSport.name.localeCompare(secondSport.name, "pt-BR"),
    );
  }, [yellowCardDiscipline?.athletes]);
  const availableCardNaipeOptions = useMemo(
    () =>
      [MatchNaipe.MASCULINO, MatchNaipe.FEMININO, MatchNaipe.MISTO].filter(
        (naipe) =>
          (yellowCardDiscipline?.athletes ?? []).some(
            (athlete) =>
              athlete.naipe == naipe &&
              (cardsSportFilter == DISCIPLINE_ALL_FILTER ||
                athlete.sport_id == cardsSportFilter),
          ),
      ),
    [cardsSportFilter, yellowCardDiscipline?.athletes],
  );
  const cardAthletesInSelectedContext = useMemo(
    () =>
      (yellowCardDiscipline?.athletes ?? []).filter(
        (athlete) =>
          (cardsSportFilter == DISCIPLINE_ALL_FILTER ||
            athlete.sport_id == cardsSportFilter) &&
          (cardsNaipeFilter == DISCIPLINE_ALL_FILTER ||
            athlete.naipe == cardsNaipeFilter) &&
          (cardsDivisionFilter == DISCIPLINE_ALL_FILTER ||
            athlete.division == cardsDivisionFilter),
      ),
    [
      cardsDivisionFilter,
      cardsNaipeFilter,
      cardsSportFilter,
      yellowCardDiscipline?.athletes,
    ],
  );
  const availableCardTeams = useMemo(() => {
    const teamsById = new Map<string, string>();

    cardAthletesInSelectedContext.forEach((athlete) => {
      teamsById.set(athlete.team_id, athlete.team_name);
    });

    return [...teamsById.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((firstTeam, secondTeam) =>
        firstTeam.name.localeCompare(secondTeam.name, "pt-BR"),
      );
  }, [cardAthletesInSelectedContext]);
  const filteredYellowCardAthletes = useMemo(() => {
    const normalizedQuery = cardsAthleteQuery.trim().toLocaleLowerCase("pt-BR");
    const athletes = cardAthletesInSelectedContext.filter(
      (athlete) =>
        (cardsTeamFilter == DISCIPLINE_ALL_FILTER ||
          athlete.team_id == cardsTeamFilter) &&
        (!cardsOnlySuspended || athlete.is_suspended) &&
        (!normalizedQuery ||
          athlete.player_name
            .toLocaleLowerCase("pt-BR")
            .includes(normalizedQuery)),
    );

    return athletes.sort((firstAthlete, secondAthlete) => {
      if (
        cardsSort == DISCIPLINE_SUSPENDED_FIRST_SORT &&
        firstAthlete.is_suspended != secondAthlete.is_suspended
      ) {
        return Number(secondAthlete.is_suspended) - Number(firstAthlete.is_suspended);
      }

      if (cardsSort == DISCIPLINE_TOTAL_CARDS_SORT) {
        const difference =
          secondAthlete.yellow_cards_total +
          secondAthlete.red_cards_direct_total -
          (firstAthlete.yellow_cards_total +
            firstAthlete.red_cards_direct_total);

        if (difference != 0) return difference;
      }

      if (cardsSort == DISCIPLINE_YELLOW_CARDS_SORT) {
        const difference =
          secondAthlete.yellow_cards_total - firstAthlete.yellow_cards_total;

        if (difference != 0) return difference;
      }

      if (cardsSort == DISCIPLINE_DIRECT_RED_CARDS_SORT) {
        const difference =
          secondAthlete.red_cards_direct_total -
          firstAthlete.red_cards_direct_total;

        if (difference != 0) return difference;
      }

      return firstAthlete.player_name.localeCompare(
        secondAthlete.player_name,
        "pt-BR",
      );
    });
  }, [
    cardAthletesInSelectedContext,
    cardsAthleteQuery,
    cardsOnlySuspended,
    cardsSort,
    cardsTeamFilter,
  ]);

  useEffect(() => {
    if (
      cardsSportFilter != DISCIPLINE_ALL_FILTER &&
      !availableCardSports.some((sport) => sport.id == cardsSportFilter)
    ) {
      setCardsSportFilter(DISCIPLINE_ALL_FILTER);
    }
  }, [availableCardSports, cardsSportFilter]);

  useEffect(() => {
    if (
      cardsNaipeFilter != DISCIPLINE_ALL_FILTER &&
      !availableCardNaipeOptions.includes(cardsNaipeFilter as MatchNaipe)
    ) {
      setCardsNaipeFilter(DISCIPLINE_ALL_FILTER);
    }
  }, [availableCardNaipeOptions, cardsNaipeFilter]);

  useEffect(() => {
    if (
      !selectedChampionshipHasDivisions &&
      cardsDivisionFilter != DISCIPLINE_ALL_FILTER
    ) {
      setCardsDivisionFilter(DISCIPLINE_ALL_FILTER);
    }
  }, [cardsDivisionFilter, selectedChampionshipHasDivisions]);

  useEffect(() => {
    if (
      cardsTeamFilter != DISCIPLINE_ALL_FILTER &&
      !availableCardTeams.some((team) => team.id == cardsTeamFilter)
    ) {
      setCardsTeamFilter(DISCIPLINE_ALL_FILTER);
    }
  }, [availableCardTeams, cardsTeamFilter]);

  useEffect(() => {
    return () => {
      if (standingsHelpTooltipTimeoutReference.current) {
        clearTimeout(standingsHelpTooltipTimeoutReference.current);
      }
    };
  }, []);

  const handleStandingsHelpClick = () => {
    if (standingsHelpTooltipTimeoutReference.current) {
      clearTimeout(standingsHelpTooltipTimeoutReference.current);
    }

    setIsStandingsHelpTooltipClickOpen(true);
    standingsHelpTooltipTimeoutReference.current = setTimeout(() => {
      setIsStandingsHelpTooltipClickOpen(false);
      standingsHelpTooltipTimeoutReference.current = null;
    }, 3000);
  };

  if (isLoading) {
    return (
      <div className="app-page">
        <Header />

        <main className="container py-8">
          <PageContentSkeleton filterCount={3} contentCount={3} />
        </main>
      </div>
    );
  }

  if (!selectedChampionship) {
    return (
      <div className="app-page">
        <Header />
        <main className="container py-8">
          <div className="glass-panel p-5">
            <p className="text-sm text-muted-foreground">
              Nenhum campeonato disponível.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-page">
      <Header />
      <main className="container py-8 space-y-6">
        <section className="glass-panel enter-section space-y-4 p-5">
          <h1 className="text-center text-2xl font-display font-bold">
            Campeonatos LAJE
          </h1>
          <div className="grid gap-3 md:grid-cols-3">
            {championships.map((championship) => {
              const isSelected = championship.code == selectedChampionshipCode;

              return (
                <button
                  key={championship.id}
                  type="button"
                  onClick={() => onSelectChampionshipCode(championship.code)}
                  className={`list-item-card list-item-card-hover enter-item relative h-52 overflow-hidden text-left transition-colors ${
                    isSelected ? "app-card-live-active" : ""
                  }`}
                >
                  <img
                    src={championshipCardImageByCode[championship.code]}
                    alt={`Arte do campeonato ${championship.name}`}
                    className="h-full w-full bg-background object-contain p-3 dark:bg-[hsl(0_0%_10%)]"
                    loading="lazy"
                  />

                  {isSelected ? (
                    <div className="pointer-events-none absolute inset-0 bg-primary/10" />
                  ) : null}

                  <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-background/90 via-background/70 to-transparent p-3">
                    <p className="font-display text-base font-bold leading-tight">
                      {championship.name}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <Tabs defaultValue="standings" className="enter-section space-y-4">
          <TabsNavigationList className="grid w-full grid-cols-3">
            <TabsNavigationTrigger value="standings">
              Classificação
            </TabsNavigationTrigger>

            <TabsNavigationTrigger value="cards">
              Cartões
            </TabsNavigationTrigger>

            <TabsNavigationTrigger value="champions">
              Campeões
            </TabsNavigationTrigger>
          </TabsNavigationList>

          {isChampionshipContentLoading ? (
            <>
              <TabsContent value="standings" className="space-y-6">
                <PageContentSkeleton
                  filterCount={selectedChampionshipHasDivisions ? 4 : 3}
                  contentCount={1}
                />
              </TabsContent>

              <TabsContent value="cards" className="space-y-6">
                <PageContentSkeleton
                  filterCount={selectedChampionshipHasDivisions ? 4 : 3}
                  contentCount={1}
                />
              </TabsContent>

              <TabsContent
                value="champions"
                className="glass-panel enter-section space-y-4 p-5"
              >
                <h2 className="text-center text-xl font-display font-bold">
                  Campeões por modalidade
                </h2>

                <CardListSkeleton
                  count={4}
                  className="grid-cols-1 md:grid-cols-2"
                />
              </TabsContent>
            </>
          ) : (
            <>
              <TabsContent value="standings" className="space-y-6">
                <section className="glass-panel enter-section space-y-4 p-5">
                  <div className="flex items-center justify-center gap-2">
                    <h2 className="text-xl font-display font-bold">
                      Classificação
                    </h2>
                    <Tooltip
                      open={isStandingsHelpTooltipOpen}
                      onOpenChange={setIsStandingsHelpTooltipHoverOpen}
                    >
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={handleStandingsHelpClick}
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Informação sobre pontuação"
                        >
                          <HelpCircle className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                        {isInterlajeOverallStandingsView ? (
                          <>
                            Nesta classificação geral do INTERLAJE, o PTS não é
                            a soma direta dos jogos. Ele soma os pontos de
                            colocação de cada modalidade, naipe e divisão, o
                            bônus de abertura e desconta as penalidades por
                            W.O. Durante o mata-mata, esses pontos de colocação
                            podem ser projetados pelo chaveamento até a final.
                          </>
                        ) : (
                          <>
                            Algumas pontuações podem aparecer em formato
                            decimal. Isso ocorre quando um multiplicador de
                            1,5× é aplicado para equalização proporcional da
                            classificação entre atléticas que jogaram em chaves
                            de tamanhos diferentes.
                          </>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  <div
                    className={`grid grid-cols-1 gap-3 ${selectedChampionshipHasDivisions ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}
                  >
                    <Select
                      value={standingsYearFilter}
                      onValueChange={onStandingsYearFilterChange}
                    >
                      <SelectTrigger className="app-input-field w-full">
                        <SelectValue placeholder="Filtrar ano" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={allYearFilter}>
                          Todos os anos
                        </SelectItem>
                        {availableStandingsYears.map((year) => (
                          <SelectItem key={year} value={year}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={standingsSportFilter}
                      onValueChange={onStandingsSportFilterChange}
                    >
                      <SelectTrigger className="app-input-field w-full">
                        <SelectValue placeholder="Filtrar modalidade" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={allStandingsSportFilter}>
                          Todas as modalidades
                        </SelectItem>
                        {sports.map((sport) => (
                          <SelectItem key={sport.id} value={sport.id}>
                            {sport.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={standingsNaipeFilter}
                      onValueChange={onStandingsNaipeFilterChange}
                    >
                      <SelectTrigger
                        className={`app-input-field w-full ${
                          isStandingsNaipeFilterLocked
                            ? "cursor-not-allowed opacity-60"
                            : ""
                        }`}
                        disabled={isStandingsNaipeFilterLocked}
                      >
                        <SelectValue placeholder="Filtrar naipe" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={allStandingsNaipeFilter}>
                          Todos os naipes
                        </SelectItem>
                        {availableStandingsNaipeOptions.map((naipe) => (
                          <SelectItem key={naipe} value={naipe}>
                            {MATCH_NAIPE_LABELS[naipe]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {selectedChampionshipHasDivisions ? (
                      <Select
                        value={standingsDivisionFilter}
                        onValueChange={onStandingsDivisionFilterChange}
                      >
                        <SelectTrigger className="app-input-field w-full">
                          <SelectValue placeholder="Filtrar divisão" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={allStandingsDivisionFilter}>
                            Todas as divisões
                          </SelectItem>
                          <SelectItem value={TeamDivision.DIVISAO_PRINCIPAL}>
                            {
                              TEAM_DIVISION_LABELS[
                                TeamDivision.DIVISAO_PRINCIPAL
                              ]
                            }
                          </SelectItem>
                          <SelectItem value={TeamDivision.DIVISAO_ACESSO}>
                            {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_ACESSO]}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>

                  {isInterlajeCompetitionStandingsAvailable ? (
                    <Tabs
                      value={interlajeStandingsView}
                      onValueChange={(value) =>
                        setInterlajeStandingsView(value as "groups" | "overall")
                      }
                    >
                      <TabsNavigationList className="mx-auto mb-4 !flex w-fit">
                        <TabsNavigationTrigger value="groups">
                          Por grupos
                        </TabsNavigationTrigger>
                        <TabsNavigationTrigger value="overall">
                          Geral da modalidade
                        </TabsNavigationTrigger>
                      </TabsNavigationList>
                      <TabsContent value="groups">
                        {isIndividualStandingsView ? (
                          <IndividualSportStandingsTable
                            standings={individualStandingsRows}
                            isLoading={isStandingsLoading}
                            disqualifiedTeamKeys={disqualifiedTeamKeys}
                          />
                        ) : (
                          <div className="space-y-5">
                            {(standingsGroups.length > 0
                              ? standingsGroups
                              : [{ label: null, standings: filteredStandings }]
                            ).map((standingsGroup) => (
                              <section key={standingsGroup.label ?? "overall"} className="space-y-2">
                                {standingsGroup.label ? (
                                  <h3 className="text-base font-display font-bold">
                                    {standingsGroup.label}
                                  </h3>
                                ) : null}
                                <TeamStandingsTable
                                  standings={standingsGroup.standings}
                                  modalidadeConfig={standingsModalidadeConfig}
                                  isLoading={isStandingsLoading}
                                  variant="public"
                                  disqualifiedTeamKeys={disqualifiedTeamKeys}
                                />
                              </section>
                            ))}
                          </div>
                        )}
                      </TabsContent>
                      <TabsContent value="overall" className="space-y-5">
                        <p className="text-xs text-muted-foreground">
                          {hasInterlajeCompetitionProjectedPlacement
                            ? "A colocação usada para pontuar a classificação geral é projetada pelo chaveamento atual e pode mudar até a final."
                            : "A posição desta tabela define os pontos da modalidade na classificação geral do INTERLAJE."}
                        </p>
                        {(interlajeCompetitionStandingsByDivision.length > 0
                          ? interlajeCompetitionStandingsByDivision
                          : [{ label: null, standings: [] }]
                        ).map((standingsGroup) => (
                          <section key={standingsGroup.label ?? "overall"} className="space-y-2">
                            {standingsGroup.label ? (
                              <h3 className="text-base font-display font-bold">
                                {standingsGroup.label}
                              </h3>
                            ) : null}
                            <TeamStandingsTable
                              standings={standingsGroup.standings}
                              modalidadeConfig={standingsModalidadeConfig}
                              isLoading={isStandingsLoading}
                              variant="public"
                              disqualifiedTeamKeys={disqualifiedTeamKeys}
                            />
                          </section>
                        ))}
                      </TabsContent>
                    </Tabs>
                  ) : isIndividualStandingsView ? (
                    <IndividualSportStandingsTable
                      standings={individualStandingsRows}
                      isLoading={isStandingsLoading}
                      disqualifiedTeamKeys={disqualifiedTeamKeys}
                    />
                  ) : (
                    <div className="space-y-5">
                      {hasInterlajeOverallProjectedPlacement ? (
                        <p className="text-xs text-center text-muted-foreground">
                          PTS projetados: os pontos de colocação podem mudar conforme os próximos jogos do mata-mata.
                        </p>
                      ) : null}
                      {(standingsGroups.length > 0
                        ? standingsGroups
                        : [{ label: null, standings: filteredStandings }]
                      ).map((standingsGroup) => (
                        <section key={standingsGroup.label ?? "overall"} className="space-y-2">
                          {standingsGroup.label ? (
                            <h3 className="text-base font-display font-bold">
                              {standingsGroup.label}
                            </h3>
                          ) : null}
                          <TeamStandingsTable
                            standings={standingsGroup.standings}
                            modalidadeConfig={standingsModalidadeConfig}
                            isLoading={isStandingsLoading}
                            variant="public"
                            disqualifiedTeamKeys={disqualifiedTeamKeys}
                            pendingTieBreakTeamIds={pendingTieBreakTeamIds}
                            teamBadgesByTeamId={teamBadgesByTeamId}
                            showMobileBadgeLegend={isInterlajeOverallStandingsView}
                          />
                        </section>
                      ))}
                    </div>
                  )}
                {isIndividualStandingsView &&
                individualEventsWithResults.length > 0 ? (
                  <div className="space-y-3 border-t border-border/60 pt-5">
                    <div>
                      <h3 className="text-lg font-display font-bold">
                        Resultados por prova
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        O app registra a ordem oficial final definida pela CO
                        para Atletismo e Natação.
                      </p>
                    </div>

                    <div className="space-y-2">
                      {individualEventsWithResults.map((event) => (
                        <details
                          key={event.id}
                          className="rounded-2xl border border-border/60 bg-background/40 p-4"
                        >
                          <summary className="cursor-pointer list-none">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <span className="font-medium">{event.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {event.naipe} •{" "}
                                {event.scheduled_date ?? "Sem data"} •{" "}
                                {event.location ?? "Local a definir"}
                              </span>
                            </div>
                          </summary>
                          <div className="mt-4 space-y-2">
                            {(individualEntriesByEventId[event.id] ?? [])
                              .filter(hasIndividualEventEntryResult)
                              .map(
                                (entry) => (
                                  <div
                                    key={entry.id}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-border/40 px-3 py-2 text-sm"
                                  >
                                    <div>
                                      <p className="font-medium">
                                        {entry.teams?.name ?? "-"}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {[
                                          entry.athlete_name ??
                                            entry.members
                                              ?.filter(
                                                (member) => member.is_starter,
                                              )
                                              .map(
                                                (member) => member.athlete_name,
                                              )
                                              .join(", "),
                                          entry.lane_number
                                            ? `Raia ${entry.lane_number}`
                                            : null,
                                        ].filter(Boolean).join(" • ") || "-"}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className="font-semibold">
                                        {entry.final_position != null
                                          ? `${entry.final_position}º`
                                          : INDIVIDUAL_ENTRY_STATUS_LABELS[
                                              entry.status
                                            ]}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {entry.points_awarded} pts
                                      </p>
                                    </div>
                                  </div>
                                ),
                              )}
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                ) : null}
                </section>
              </TabsContent>

              <TabsContent value="cards" className="space-y-6">
                <section className="glass-panel enter-section space-y-4 p-5">
                  <div>
                    <h2 className="text-center text-xl font-display font-bold">
                      Cartões
                    </h2>
                    <p className="mt-1 text-center text-sm text-muted-foreground">
                      Histórico individual de cartões e situação disciplinar.
                    </p>
                  </div>
                  <div
                    className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${
                      selectedChampionshipHasDivisions
                        ? "lg:grid-cols-6"
                        : "lg:grid-cols-5"
                    }`}
                  >
                    <Select
                      value={cardsSeasonYearFilter}
                      onValueChange={onStandingsYearFilterChange}
                    >
                      <SelectTrigger className="app-input-field w-full">
                        <SelectValue placeholder="Filtrar ano" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableStandingsYears.map((year) => (
                          <SelectItem key={year} value={year}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={cardsSportFilter}
                      onValueChange={setCardsSportFilter}
                    >
                      <SelectTrigger className="app-input-field w-full">
                        <SelectValue placeholder="Filtrar modalidade" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DISCIPLINE_ALL_FILTER}>
                          Todas as modalidades
                        </SelectItem>
                        {availableCardSports.map((sport) => (
                          <SelectItem key={sport.id} value={sport.id}>
                            {sport.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={cardsNaipeFilter}
                      onValueChange={setCardsNaipeFilter}
                    >
                      <SelectTrigger className="app-input-field w-full">
                        <SelectValue placeholder="Filtrar naipe" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DISCIPLINE_ALL_FILTER}>
                          Todos os naipes
                        </SelectItem>
                        {availableCardNaipeOptions.map((naipe) => (
                          <SelectItem key={naipe} value={naipe}>
                            {MATCH_NAIPE_LABELS[naipe]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedChampionshipHasDivisions ? (
                      <Select
                        value={cardsDivisionFilter}
                        onValueChange={setCardsDivisionFilter}
                      >
                        <SelectTrigger className="app-input-field w-full">
                          <SelectValue placeholder="Filtrar divisão" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={DISCIPLINE_ALL_FILTER}>
                            Todas as divisões
                          </SelectItem>
                          {Object.entries(TEAM_DIVISION_LABELS).map(
                            ([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    ) : null}
                    <Select
                      value={cardsTeamFilter}
                      onValueChange={setCardsTeamFilter}
                    >
                      <SelectTrigger className="app-input-field w-full">
                        <SelectValue placeholder="Filtrar atlética" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DISCIPLINE_ALL_FILTER}>
                          Todas as atléticas
                        </SelectItem>
                        {availableCardTeams.map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={cardsSort} onValueChange={setCardsSort}>
                      <SelectTrigger className="app-input-field w-full">
                        <SelectValue placeholder="Ordenar por" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DISCIPLINE_ALPHABETICAL_SORT}>
                          Ordem alfabética
                        </SelectItem>
                        <SelectItem value={DISCIPLINE_TOTAL_CARDS_SORT}>
                          Mais cartões
                        </SelectItem>
                        <SelectItem value={DISCIPLINE_YELLOW_CARDS_SORT}>
                          Mais amarelos
                        </SelectItem>
                        <SelectItem value={DISCIPLINE_DIRECT_RED_CARDS_SORT}>
                          Mais vermelhos diretos
                        </SelectItem>
                        <SelectItem value={DISCIPLINE_SUSPENDED_FIRST_SORT}>
                          Suspensos primeiro
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Input
                      value={cardsAthleteQuery}
                      onChange={(event) => setCardsAthleteQuery(event.target.value)}
                      placeholder="Buscar atleta"
                      className="app-input-field sm:w-2/3"
                    />
                    <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
                      <Switch
                        checked={cardsOnlySuspended}
                        onCheckedChange={setCardsOnlySuspended}
                      />
                      Somente suspensos
                    </label>
                  </div>
                  <YellowCardDisciplineTable
                    athletes={filteredYellowCardAthletes}
                    loading={yellowCardDisciplineLoading}
                    error={yellowCardDisciplineError}
                    onRetry={onRetryYellowCardDiscipline}
                  />
                </section>
              </TabsContent>

              <TabsContent
                value="champions"
                className="glass-panel enter-section space-y-4 p-5"
              >
                <h2 className="text-center text-xl font-display font-bold">
                  Campeões por modalidade
                </h2>

                {championshipChampionHistory.length == 0 ? (
                  <p className="text-center text-sm text-muted-foreground">
                    Nenhum campeão identificado para este campeonato.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {championshipChampionHistory.map(
                      (championshipChampionYearGroup, index) => (
                        <div
                          key={championshipChampionYearGroup.year}
                          className="space-y-4 rounded-2xl app-card-muted p-4 text-center"
                        >
                          <div className="flex flex-col items-center justify-center gap-1">
                            <h3 className="font-display text-lg font-bold">
                              {championshipChampionYearGroup.year}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {championshipChampionYearGroup.champions.length}{" "}
                              modalidade(s)
                            </p>
                          </div>

                          {index === 0 &&
                          (firstPlaceTeam ||
                            secondPlaceTeam ||
                            thirdPlaceTeam) ? (
                            <div className="space-y-2">
                              <p className="text-sm font-semibold text-muted-foreground">
                                Pódio geral (tempo real)
                              </p>
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                {firstPlaceTeam ? (
                                  <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-center md:order-2">
                                    <div className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:bg-amber-500/25 dark:text-amber-200">
                                      <Trophy className="h-3.5 w-3.5" />
                                      1º lugar
                                    </div>
                                    <p className="mt-3 font-display text-lg font-bold">
                                      {firstPlaceTeam.team_name}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {formatStandingsPoints(
                                        firstPlaceTeam.points,
                                      )}{" "}
                                      pts
                                    </p>
                                  </div>
                                ) : null}

                                {secondPlaceTeam ? (
                                  <div className="rounded-2xl app-card-emphasis p-4 text-center md:order-1">
                                    <div className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">
                                      <Medal className="h-3.5 w-3.5" />
                                      2º lugar
                                    </div>
                                    <p className="mt-3 font-display text-lg font-bold">
                                      {secondPlaceTeam.team_name}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {formatStandingsPoints(
                                        secondPlaceTeam.points,
                                      )}{" "}
                                      pts
                                    </p>
                                  </div>
                                ) : null}

                                {thirdPlaceTeam ? (
                                  <div className="rounded-2xl app-card-emphasis p-4 text-center md:order-3">
                                    <div className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-600 dark:bg-orange-500/20 dark:text-orange-300">
                                      <Award className="h-3.5 w-3.5" />
                                      3º lugar
                                    </div>
                                    <p className="mt-3 font-display text-lg font-bold">
                                      {thirdPlaceTeam.team_name}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {formatStandingsPoints(
                                        thirdPlaceTeam.points,
                                      )}{" "}
                                      pts
                                    </p>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : null}

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {championshipChampionYearGroup.champions.map(
                              (championshipChampion) => {
                                const isCurrentYear =
                                  String(awardsSeasonYear) ===
                                  championshipChampionYearGroup.year;
                                const supportsAwards =
                                  resolveChampionshipSportSupportsAwards(
                                    selectedChampionship.code,
                                    championshipChampion.sport_name,
                                  );
                                const pendingAwardContext =
                                  awardsRankings?.pending_award_contexts?.find(
                                    (pendingContext) =>
                                      pendingContext.naipe ===
                                        championshipChampion.naipe &&
                                      pendingContext.division ===
                                        (championshipChampion.division ?? null),
                                  ) ?? null;
                                const awardsReady =
                                  supportsAwards &&
                                  isCurrentYear &&
                                  awardsRankings != null &&
                                  (awardsRankings.pending_award_contexts != null
                                    ? pendingAwardContext == null
                                    : awardsRankings.pending_matches_count ===
                                      0);
                                const scorerDrawResult =
                                  awardsRankings?.award_draw_results?.find(
                                    (r) =>
                                      r.award_type === "TOP_SCORER" &&
                                      r.naipe === championshipChampion.naipe &&
                                      r.division ===
                                        (championshipChampion.division ?? null),
                                  ) ?? null;
                                const defenseDrawResult =
                                  awardsRankings?.award_draw_results?.find(
                                    (r) =>
                                      r.award_type === "BEST_GOALKEEPER" &&
                                      r.naipe === championshipChampion.naipe &&
                                      r.division ===
                                        (championshipChampion.division ?? null),
                                  ) ?? null;

                                const filteredScorers = isCurrentYear
                                  ? [
                                      ...(awardsRankings?.top_scorers ?? []),
                                    ].filter(
                                      (s) =>
                                        s.naipe ===
                                          championshipChampion.naipe &&
                                        s.division ===
                                          championshipChampion.division &&
                                        !competitionDisqualifications.some(
                                          (disqualification) => {
                                            return (
                                              disqualification.naipe ===
                                                championshipChampion.naipe &&
                                              disqualification.division ===
                                                championshipChampion.division &&
                                              disqualification.team_id ===
                                                s.team_id
                                            );
                                          },
                                        ),
                                    )
                                  : [];
                                const sortedScorers = isCurrentYear
                                  ? [...filteredScorers].sort(
                                      (firstScorer, secondScorer) =>
                                        compareAwardsRankingGoalScorers(
                                          firstScorer,
                                          secondScorer,
                                          {
                                            drawWinnerPlayerId:
                                              scorerDrawResult?.winner_player_id ??
                                              null,
                                          },
                                        ),
                                    )
                                  : [];
                                const topScorer = isCurrentYear
                                  ? (sortedScorers[0] ?? null)
                                  : null;

                                const filteredBestDefenses = isCurrentYear
                                  ? [
                                      ...(awardsRankings?.best_defenses ?? []),
                                    ].filter(
                                      (g) =>
                                        g.naipe ===
                                          championshipChampion.naipe &&
                                        g.division ===
                                          championshipChampion.division &&
                                        !competitionDisqualifications.some(
                                          (disqualification) => {
                                            return (
                                              disqualification.naipe ===
                                                championshipChampion.naipe &&
                                              disqualification.division ===
                                                championshipChampion.division &&
                                              disqualification.team_id ===
                                                g.team_id
                                            );
                                          },
                                        ),
                                    )
                                  : [];
                                const bestDefense = isCurrentYear
                                  ? ((defenseDrawResult
                                      ? (filteredBestDefenses.find(
                                          (g) =>
                                            g.team_id ===
                                            defenseDrawResult.winner_team_id,
                                        ) ??
                                        filteredBestDefenses.sort(
                                          (a, b) =>
                                            a.goals_against_average -
                                              b.goals_against_average ||
                                            a.goals_against - b.goals_against ||
                                            b.matches_count - a.matches_count,
                                        )[0])
                                      : filteredBestDefenses.sort(
                                          (a, b) =>
                                            a.goals_against_average -
                                              b.goals_against_average ||
                                            a.goals_against - b.goals_against ||
                                            b.matches_count - a.matches_count,
                                        )[0]) ?? null)
                                  : null;

                                return (
                                  <div
                                    key={championshipChampion.match_id}
                                    className="rounded-2xl app-card-emphasis p-4 text-center shadow-lg"
                                  >
                                    <div className="space-y-1 text-center">
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                        {championshipChampion.sport_name}
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        {
                                          MATCH_NAIPE_LABELS[
                                            championshipChampion.naipe
                                          ]
                                        }
                                        {championshipChampion.division
                                          ? ` • ${TEAM_DIVISION_LABELS[championshipChampion.division]}`
                                          : ""}
                                      </p>
                                    </div>

                                    <div className="mt-4 flex flex-col items-center gap-3">
                                      <div className="flex w-full flex-col items-center justify-center gap-1 text-center">
                                        <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-600 dark:bg-amber-500/25 dark:text-amber-200">
                                          <Trophy className="h-3.5 w-3.5" />
                                          Campeã
                                        </span>
                                        <p className="font-display text-lg font-bold">
                                          {
                                            championshipChampion.champion_team_name
                                          }
                                        </p>
                                      </div>

                                      {championshipChampion.runner_up_team_name ||
                                      championshipChampion.third_place_team_name ? (
                                        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                                          {championshipChampion.runner_up_team_name ? (
                                            <div className="rounded-lg border border-border/40 px-2 py-1.5 text-center">
                                              <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">
                                                <Medal className="h-3 w-3" />
                                                Vice
                                              </span>
                                              <p className="mt-1 text-sm font-medium text-foreground/90">
                                                {
                                                  championshipChampion.runner_up_team_name
                                                }
                                              </p>
                                            </div>
                                          ) : null}

                                          {championshipChampion.third_place_team_name ? (
                                            <div className="rounded-lg border border-border/40 px-2 py-1.5 text-center">
                                              <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-orange-600 dark:bg-orange-500/20 dark:text-orange-300">
                                                <Award className="h-3 w-3" />
                                                3º lugar
                                              </span>
                                              <p className="mt-1 text-sm font-medium text-foreground/90">
                                                {
                                                  championshipChampion.third_place_team_name
                                                }
                                              </p>
                                            </div>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </div>

                                    {supportsAwards && isCurrentYear ? (
                                      <div className="mt-3 border-t border-border/40 pt-3 space-y-1.5">
                                        <div className="flex items-center justify-between gap-2 text-xs">
                                          <span className="text-muted-foreground shrink-0">
                                            Artilheiro
                                          </span>
                                          {awardsReady && topScorer ? (
                                            <span className="truncate text-right font-medium">
                                              {topScorer.player_name}
                                              <span className="ml-1 text-muted-foreground">
                                                • {topScorer.team_name} •{" "}
                                                {topScorer.goals}{" "}
                                                {topScorer.goals === 1
                                                  ? "gol"
                                                  : "gols"}
                                              </span>
                                            </span>
                                          ) : (
                                            <span className="text-muted-foreground">
                                              —
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center justify-between gap-2 text-xs">
                                          <span className="text-muted-foreground shrink-0">
                                            Melhor defesa
                                          </span>
                                          {awardsReady && bestDefense ? (
                                            <span className="truncate text-right font-medium">
                                              {bestDefense.team_name}
                                              <span className="ml-1 text-muted-foreground">
                                                •{" "}
                                                {bestDefense.goals_against_average.toLocaleString(
                                                  "pt-BR",
                                                  {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                  },
                                                )}{" "}
                                                de média •{" "}
                                                {bestDefense.goals_against}{" "}
                                                {bestDefense.goals_against === 1
                                                  ? "gol sofrido"
                                                  : "gols sofridos"}
                                              </span>
                                            </span>
                                          ) : (
                                            <span className="text-muted-foreground">
                                              —
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              },
                            )}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </TabsContent>
            </>
          )}
        </Tabs>
      </main>
    </div>
  );
}
