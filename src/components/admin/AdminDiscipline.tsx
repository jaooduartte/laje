import { useEffect, useMemo, useState } from "react";
import { YellowCardDisciplineTable } from "@/components/YellowCardDisciplineTable";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useChampionshipYellowCardDiscipline } from "@/hooks/useChampionshipYellowCardDiscipline";
import { ChampionshipSportNaipeMode, MatchNaipe } from "@/lib/enums";
import { MATCH_NAIPE_LABELS, TEAM_DIVISION_LABELS } from "@/lib/championship";
import { useChampionshipSeasonRuntime } from "@/hooks/useChampionshipSeasonRuntime";
import type { Championship, ChampionshipSport, Sport } from "@/lib/types";

const ALL_FILTER = "ALL";
const ALPHABETICAL_SORT = "ALPHABETICAL";
const TOTAL_CARDS_SORT = "TOTAL_CARDS";
const YELLOW_CARDS_SORT = "YELLOW_CARDS";
const DIRECT_RED_CARDS_SORT = "DIRECT_RED_CARDS";
const SUSPENDED_FIRST_SORT = "SUSPENDED_FIRST";

export function AdminDiscipline({
  championship,
  sports,
  championshipSports,
  availableSeasonYears,
}: {
  championship: Championship;
  sports: Sport[];
  championshipSports: ChampionshipSport[];
  availableSeasonYears: number[];
}) {
  const [seasonYear, setSeasonYear] = useState(String(championship.current_season_year));
  const [sportId, setSportId] = useState(ALL_FILTER);
  const [naipe, setNaipe] = useState(ALL_FILTER);
  const [division, setDivision] = useState(ALL_FILTER);
  const [teamId, setTeamId] = useState(ALL_FILTER);
  const [sort, setSort] = useState(ALPHABETICAL_SORT);
  const [athleteQuery, setAthleteQuery] = useState("");
  const [onlySuspended, setOnlySuspended] = useState(false);
  const { discipline, loading } = useChampionshipYellowCardDiscipline({
    championshipId: championship.id,
    seasonYear: Number(seasonYear),
  });
  const { usesDivisions } = useChampionshipSeasonRuntime({
    championship,
    seasonYear: Number(seasonYear),
  });

  const availableSports = useMemo(() => {
    const configuredSportIds = new Set(
      championshipSports.map((championshipSport) => championshipSport.sport_id),
    );
    const sportById = new Map(
      sports
        .filter((sport) => configuredSportIds.has(sport.id))
        .map((sport) => [sport.id, sport]),
    );

    (discipline?.athletes ?? []).forEach((athlete) => {
      if (!sportById.has(athlete.sport_id)) {
        sportById.set(athlete.sport_id, {
          id: athlete.sport_id,
          name: athlete.sport_name,
          created_at: "",
        });
      }
    });

    return [...sportById.values()].sort((firstSport, secondSport) =>
      firstSport.name.localeCompare(secondSport.name, "pt-BR"),
    );
  }, [championshipSports, discipline?.athletes, sports]);

  const availableNaipeOptions = useMemo(() => {
    const scopedChampionshipSports =
      sportId == ALL_FILTER
        ? championshipSports
        : championshipSports.filter(
            (championshipSport) => championshipSport.sport_id == sportId,
          );

    return [
      ...(scopedChampionshipSports.some(
        (championshipSport) =>
          championshipSport.naipe_mode ==
          ChampionshipSportNaipeMode.MASCULINO_FEMININO,
      )
        ? [MatchNaipe.MASCULINO, MatchNaipe.FEMININO]
        : []),
      ...(scopedChampionshipSports.some(
        (championshipSport) =>
          championshipSport.naipe_mode == ChampionshipSportNaipeMode.MISTO,
      )
        ? [MatchNaipe.MISTO]
        : []),
    ];
  }, [championshipSports, sportId]);

  useEffect(() => {
    if (sportId != ALL_FILTER && !availableSports.some((sport) => sport.id == sportId)) {
      setSportId(ALL_FILTER);
    }
  }, [availableSports, sportId]);

  useEffect(() => {
    if (naipe != ALL_FILTER && !availableNaipeOptions.includes(naipe as MatchNaipe)) {
      setNaipe(ALL_FILTER);
    }
  }, [availableNaipeOptions, naipe]);

  useEffect(() => {
    if (!usesDivisions && division != ALL_FILTER) {
      setDivision(ALL_FILTER);
    }
  }, [division, usesDivisions]);

  const athletesInSelectedContext = useMemo(() => {
    return (discipline?.athletes ?? []).filter(
      (athlete) =>
        (sportId == ALL_FILTER || athlete.sport_id == sportId) &&
        (naipe == ALL_FILTER || athlete.naipe == naipe) &&
        (division == ALL_FILTER || athlete.division == division),
    );
  }, [discipline?.athletes, division, naipe, sportId]);

  const availableTeams = useMemo(() => {
    const teamsById = new Map<string, string>();

    athletesInSelectedContext.forEach((athlete) => {
      teamsById.set(athlete.team_id, athlete.team_name);
    });

    return [...teamsById.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((firstTeam, secondTeam) =>
        firstTeam.name.localeCompare(secondTeam.name, "pt-BR"),
      );
  }, [athletesInSelectedContext]);

  useEffect(() => {
    if (teamId != ALL_FILTER && !availableTeams.some((team) => team.id == teamId)) {
      setTeamId(ALL_FILTER);
    }
  }, [availableTeams, teamId]);

  const athletes = useMemo(() => {
    const normalizedQuery = athleteQuery.trim().toLocaleLowerCase("pt-BR");
    const filteredAthletes = athletesInSelectedContext.filter(
      (athlete) =>
        (teamId == ALL_FILTER || athlete.team_id == teamId) &&
        (!onlySuspended || athlete.is_suspended) &&
        (!normalizedQuery || athlete.player_name.toLocaleLowerCase("pt-BR").includes(normalizedQuery)),
    );

    return filteredAthletes.sort((firstAthlete, secondAthlete) => {
      if (sort == SUSPENDED_FIRST_SORT && firstAthlete.is_suspended != secondAthlete.is_suspended) {
        return Number(secondAthlete.is_suspended) - Number(firstAthlete.is_suspended);
      }

      if (sort == TOTAL_CARDS_SORT) {
        const totalCardsDifference =
          secondAthlete.yellow_cards_total + secondAthlete.red_cards_direct_total -
          (firstAthlete.yellow_cards_total + firstAthlete.red_cards_direct_total);
        if (totalCardsDifference != 0) return totalCardsDifference;
      }

      if (sort == YELLOW_CARDS_SORT) {
        const yellowCardsDifference = secondAthlete.yellow_cards_total - firstAthlete.yellow_cards_total;
        if (yellowCardsDifference != 0) return yellowCardsDifference;
      }

      if (sort == DIRECT_RED_CARDS_SORT) {
        const directRedCardsDifference = secondAthlete.red_cards_direct_total - firstAthlete.red_cards_direct_total;
        if (directRedCardsDifference != 0) return directRedCardsDifference;
      }

      return firstAthlete.player_name.localeCompare(secondAthlete.player_name, "pt-BR");
    });
  }, [athleteQuery, athletesInSelectedContext, onlySuspended, sort, teamId]);

  return (
    <div className="space-y-6">
      <section className="glass-panel space-y-4 p-5">
        <div>
          <h2 className="text-xl font-display font-bold">Disciplina</h2>
          <p className="text-sm text-muted-foreground">
            Consulte cartões amarelos, vermelhos diretos e avisos de suspensão sem bloquear o andamento dos jogos.
          </p>
        </div>
        <div className={`grid gap-3 sm:grid-cols-2 ${usesDivisions ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
          <Select value={seasonYear} onValueChange={setSeasonYear}>
            <SelectTrigger className="app-input-field"><SelectValue placeholder="Temporada" /></SelectTrigger>
            <SelectContent>{[...new Set([...availableSeasonYears, championship.current_season_year])].sort((a, b) => b - a).map((year) => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={sportId} onValueChange={setSportId}>
            <SelectTrigger className="app-input-field"><SelectValue placeholder="Modalidade" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL_FILTER}>Todas as modalidades</SelectItem>{availableSports.map((sport) => <SelectItem key={sport.id} value={sport.id}>{sport.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={naipe} onValueChange={setNaipe}>
            <SelectTrigger className="app-input-field"><SelectValue placeholder="Naipe" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL_FILTER}>Todos os naipes</SelectItem>{availableNaipeOptions.map((item) => <SelectItem key={item} value={item}>{MATCH_NAIPE_LABELS[item]}</SelectItem>)}</SelectContent>
          </Select>
          {usesDivisions ? (
            <Select value={division} onValueChange={setDivision}>
              <SelectTrigger className="app-input-field"><SelectValue placeholder="Divisão" /></SelectTrigger>
              <SelectContent><SelectItem value={ALL_FILTER}>Todas as divisões</SelectItem>{Object.entries(TEAM_DIVISION_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          ) : null}
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger className="app-input-field"><SelectValue placeholder="Atlética" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL_FILTER}>Todas as atléticas</SelectItem>{availableTeams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="app-input-field"><SelectValue placeholder="Ordenar por" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALPHABETICAL_SORT}>Ordem alfabética</SelectItem>
              <SelectItem value={TOTAL_CARDS_SORT}>Mais cartões</SelectItem>
              <SelectItem value={YELLOW_CARDS_SORT}>Mais amarelos</SelectItem>
              <SelectItem value={DIRECT_RED_CARDS_SORT}>Mais vermelhos diretos</SelectItem>
              <SelectItem value={SUSPENDED_FIRST_SORT}>Suspensos primeiro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input value={athleteQuery} onChange={(event) => setAthleteQuery(event.target.value)} placeholder="Buscar atleta" className="app-input-field sm:w-2/3" />
          <label className="flex items-center gap-2 text-sm font-medium sm:shrink-0">
            <Switch checked={onlySuspended} onCheckedChange={setOnlySuspended} />
            Somente suspensos
          </label>
        </div>
      </section>
      <YellowCardDisciplineTable athletes={athletes} loading={loading} />
    </div>
  );
}
