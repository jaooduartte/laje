import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Championship, ChampionshipSport, Match, Sport, Team } from "@/lib/types";
import { ChampionshipCode, MatchNaipe, MatchStatus, TeamDivision } from "@/lib/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  doesChampionshipSportSupportNaipe,
  MATCH_NAIPE_LABELS,
  TEAM_DIVISION_BADGE_TONES,
  TEAM_DIVISION_LABELS,
  isMatchNaipe,
  isTeamDivision,
  resolveMatchNaipeBadgeTone,
  resolveMatchNaipeLabel,
  resolveMatchStatusBadgeTone,
  resolveMatchStatusLabel,
} from "@/lib/championship";
import { AppBadge } from "@/components/ui/app-badge";

interface Props {
  matches: Match[];
  championshipSports: ChampionshipSport[];
  teams: Team[];
  selectedChampionship: Championship;
  canManageMatches?: boolean;
  onRefetch: () => void;
  onRefetchChampionships: () => void;
}

interface MatchEditDraft {
  sportId: string;
  homeTeamId: string;
  awayTeamId: string;
  location: string;
  startTime: Date | null;
  endTime: Date | null;
  division: TeamDivision;
  naipe: MatchNaipe;
}

const NAIPE_OPTIONS: MatchNaipe[] = [MatchNaipe.MASCULINO, MatchNaipe.FEMININO, MatchNaipe.MISTO];
const ALL_MATCHES_SPORT_FILTER = "ALL_MATCHES_SPORTS";
const ALL_MATCHES_TEAM_FILTER = "ALL_MATCHES_TEAMS";
const ALL_MATCHES_NAIPE_FILTER = "ALL_MATCHES_NAIPES";

const MATCH_STATUS_SORT_ORDER: Record<MatchStatus, number> = {
  [MatchStatus.LIVE]: 0,
  [MatchStatus.SCHEDULED]: 1,
  [MatchStatus.FINISHED]: 2,
};

function resolveSportsByNaipe(championshipSports: ChampionshipSport[], naipe: MatchNaipe): Sport[] {
  const sportsById = new Map<string, Sport>();

  championshipSports
    .filter((championshipSport) => doesChampionshipSportSupportNaipe(championshipSport.naipe_mode, naipe))
    .forEach((championshipSport) => {
      const sport = championshipSport.sports;

      if (sport && !sportsById.has(sport.id)) {
        sportsById.set(sport.id, sport);
      }
    });

  return [...sportsById.values()].sort((firstSport, secondSport) => firstSport.name.localeCompare(secondSport.name));
}

export function AdminMatches({
  matches,
  championshipSports,
  teams,
  selectedChampionship,
  canManageMatches = true,
  onRefetch,
  onRefetchChampionships,
}: Props) {
  const [naipe, setNaipe] = useState<MatchNaipe>(MatchNaipe.MASCULINO);
  const [sportId, setSportId] = useState("");
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [location, setLocation] = useState("");
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [division, setDivision] = useState<TeamDivision>(TeamDivision.DIVISAO_PRINCIPAL);
  const [clvDefaultLocation, setClvDefaultLocation] = useState("");
  const [savingClvDefaultLocation, setSavingClvDefaultLocation] = useState(false);
  const [replicateClvDefaultLocation, setReplicateClvDefaultLocation] = useState(true);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editingMatchDraft, setEditingMatchDraft] = useState<MatchEditDraft | null>(null);
  const [matchesSportFilter, setMatchesSportFilter] = useState<string>(ALL_MATCHES_SPORT_FILTER);
  const [matchesTeamFilter, setMatchesTeamFilter] = useState<string>(ALL_MATCHES_TEAM_FILTER);
  const [matchesNaipeFilter, setMatchesNaipeFilter] = useState<string>(ALL_MATCHES_NAIPE_FILTER);

  const championshipUsesDivisions = selectedChampionship.uses_divisions;
  const isClvChampionship = selectedChampionship.code === ChampionshipCode.CLV;
  const locationIsLockedForClv = isClvChampionship && replicateClvDefaultLocation;

  const availableSportsForCreate = useMemo(() => {
    return resolveSportsByNaipe(championshipSports, naipe);
  }, [championshipSports, naipe]);

  const availableSportsForEditing = useMemo(() => {
    if (!editingMatchDraft) {
      return [];
    }

    return resolveSportsByNaipe(championshipSports, editingMatchDraft.naipe);
  }, [championshipSports, editingMatchDraft]);

  const teamsAllowedForMatches = useMemo(() => {
    return teams.filter((team) => team.division != null);
  }, [teams]);

  const eligibleTeams = useMemo(() => {
    if (!championshipUsesDivisions) {
      return teamsAllowedForMatches;
    }

    return teamsAllowedForMatches.filter((team) => team.division === division);
  }, [championshipUsesDivisions, division, teamsAllowedForMatches]);

  const eligibleTeamsForEditingMatch = useMemo(() => {
    if (!championshipUsesDivisions || !editingMatchDraft) {
      return teamsAllowedForMatches;
    }

    return teamsAllowedForMatches.filter((team) => team.division === editingMatchDraft.division);
  }, [championshipUsesDivisions, editingMatchDraft, teamsAllowedForMatches]);

  useEffect(() => {
    setNaipe(MatchNaipe.MASCULINO);
    setSportId("");
    setHomeTeamId("");
    setAwayTeamId("");
    const nextDefaultLocation = selectedChampionship.default_location ?? "";
    setClvDefaultLocation(nextDefaultLocation);
    setLocation(isClvChampionship && replicateClvDefaultLocation ? nextDefaultLocation : "");
    setStartTime(null);
    setEndTime(null);
    setDivision(TeamDivision.DIVISAO_PRINCIPAL);
    setEditingMatchId(null);
    setEditingMatchDraft(null);
    setMatchesSportFilter(ALL_MATCHES_SPORT_FILTER);
    setMatchesTeamFilter(ALL_MATCHES_TEAM_FILTER);
    setMatchesNaipeFilter(ALL_MATCHES_NAIPE_FILTER);
  }, [isClvChampionship, replicateClvDefaultLocation, selectedChampionship.default_location, selectedChampionship.id]);

  useEffect(() => {
    setSportId("");
    setHomeTeamId("");
    setAwayTeamId("");
  }, [naipe]);

  useEffect(() => {
    if (isClvChampionship && replicateClvDefaultLocation) {
      setLocation(clvDefaultLocation);
    }
  }, [clvDefaultLocation, isClvChampionship, replicateClvDefaultLocation]);

  const sportsForMatchesFilter = useMemo(() => {
    const sportsById = new Map<string, Sport>();

    matches.forEach((match) => {
      if (match.sports && !sportsById.has(match.sports.id)) {
        sportsById.set(match.sports.id, match.sports);
      }
    });

    return [...sportsById.values()].sort((firstSport, secondSport) => firstSport.name.localeCompare(secondSport.name));
  }, [matches]);

  const teamsForMatchesFilter = useMemo(() => {
    const teamIds = new Set<string>();

    matches.forEach((match) => {
      teamIds.add(match.home_team_id);
      teamIds.add(match.away_team_id);
    });

    return teams
      .filter((team) => teamIds.has(team.id))
      .sort((firstTeam, secondTeam) => firstTeam.name.localeCompare(secondTeam.name));
  }, [matches, teams]);

  const filteredAndSortedMatches = useMemo(() => {
    return [...matches]
      .filter((match) => {
        if (matchesSportFilter !== ALL_MATCHES_SPORT_FILTER && match.sport_id != matchesSportFilter) {
          return false;
        }

        if (matchesTeamFilter !== ALL_MATCHES_TEAM_FILTER) {
          const isHomeTeamMatch = match.home_team_id == matchesTeamFilter;
          const isAwayTeamMatch = match.away_team_id == matchesTeamFilter;

          if (!isHomeTeamMatch && !isAwayTeamMatch) {
            return false;
          }
        }

        if (matchesNaipeFilter !== ALL_MATCHES_NAIPE_FILTER && match.naipe != matchesNaipeFilter) {
          return false;
        }

        return true;
      })
      .sort((firstMatch, secondMatch) => {
        const statusOrderDifference = MATCH_STATUS_SORT_ORDER[firstMatch.status] - MATCH_STATUS_SORT_ORDER[secondMatch.status];

        if (statusOrderDifference != 0) {
          return statusOrderDifference;
        }

        return new Date(firstMatch.start_time).getTime() - new Date(secondMatch.start_time).getTime();
      });
  }, [matches, matchesNaipeFilter, matchesSportFilter, matchesTeamFilter]);

  const handleSaveClvDefaultLocation = async () => {
    if (!canManageMatches) {
      return;
    }

    if (!isClvChampionship) {
      return;
    }

    const normalizedDefaultLocation = clvDefaultLocation.trim();

    if (!normalizedDefaultLocation) {
      toast.error("Informe um local padrão do CLV.");
      return;
    }

    setSavingClvDefaultLocation(true);

    const { error } = await supabase
      .from("championships")
      .update({ default_location: normalizedDefaultLocation })
      .eq("id", selectedChampionship.id);

    setSavingClvDefaultLocation(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Local padrão do CLV salvo.");

    if (replicateClvDefaultLocation) {
      setLocation(normalizedDefaultLocation);
    }

    onRefetchChampionships();
  };

  const handleAdd = async () => {
    if (!canManageMatches) {
      return;
    }

    const resolvedLocation = isClvChampionship && replicateClvDefaultLocation ? clvDefaultLocation.trim() : location.trim();

    if (!sportId || !homeTeamId || !awayTeamId || !resolvedLocation || !startTime || !endTime) {
      toast.error("Preencha todos os campos.");
      return;
    }

    if (homeTeamId === awayTeamId) {
      toast.error("Times devem ser diferentes.");
      return;
    }

    const { error } = await supabase.from("matches").insert({
      championship_id: selectedChampionship.id,
      naipe,
      sport_id: sportId,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      location: resolvedLocation,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      division: championshipUsesDivisions ? division : null,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Jogo criado!");
    setHomeTeamId("");
    setAwayTeamId("");
    setLocation(isClvChampionship && replicateClvDefaultLocation ? clvDefaultLocation : "");
    setStartTime(null);
    setEndTime(null);
    onRefetch();
  };

  const handleDelete = async (matchId: string) => {
    if (!canManageMatches) {
      return;
    }

    const { error } = await supabase.from("matches").delete().eq("id", matchId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Jogo removido.");
    onRefetch();
  };

  const handleStartEditingMatch = (match: Match) => {
    if (!canManageMatches) {
      return;
    }

    setEditingMatchId(match.id);
    setEditingMatchDraft({
      sportId: match.sport_id,
      homeTeamId: match.home_team_id,
      awayTeamId: match.away_team_id,
      location: match.location,
      startTime: new Date(match.start_time),
      endTime: new Date(match.end_time),
      division: match.division ?? TeamDivision.DIVISAO_PRINCIPAL,
      naipe: match.naipe,
    });
  };

  const handleCancelEditingMatch = () => {
    setEditingMatchId(null);
    setEditingMatchDraft(null);
  };

  const handleSaveEditingMatch = async () => {
    if (!canManageMatches) {
      return;
    }

    if (!editingMatchId || !editingMatchDraft) {
      return;
    }

    const normalizedLocation = editingMatchDraft.location.trim();

    if (
      !editingMatchDraft.sportId ||
      !editingMatchDraft.homeTeamId ||
      !editingMatchDraft.awayTeamId ||
      !normalizedLocation ||
      !editingMatchDraft.startTime ||
      !editingMatchDraft.endTime
    ) {
      toast.error("Preencha todos os campos da edição.");
      return;
    }

    if (editingMatchDraft.homeTeamId === editingMatchDraft.awayTeamId) {
      toast.error("Times devem ser diferentes.");
      return;
    }

    const { error } = await supabase
      .from("matches")
      .update({
        naipe: editingMatchDraft.naipe,
        sport_id: editingMatchDraft.sportId,
        home_team_id: editingMatchDraft.homeTeamId,
        away_team_id: editingMatchDraft.awayTeamId,
        location: normalizedLocation,
        start_time: editingMatchDraft.startTime.toISOString(),
        end_time: editingMatchDraft.endTime.toISOString(),
        division: championshipUsesDivisions ? editingMatchDraft.division : null,
      })
      .eq("id", editingMatchId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Jogo atualizado.");
    handleCancelEditingMatch();
    onRefetch();
  };

  return (
    <div className="space-y-6">
      {canManageMatches ? (
        <div className="enter-section space-y-3 glass-card p-4">
          <h3 className="font-display font-semibold">Novo Jogo - {selectedChampionship.name}</h3>

          {isClvChampionship ? (
            <div className="space-y-3 glass-panel-muted p-3">
              <p className="text-sm font-medium">Local padrão da Copa Laje de Verão (CLV)</p>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder="Ex.: Arena oficial do CLV"
                  value={clvDefaultLocation}
                  onChange={(event) => setClvDefaultLocation(event.target.value)}
                  className="glass-input"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSaveClvDefaultLocation}
                  disabled={savingClvDefaultLocation}
                  className="bg-background/80 hover:bg-background"
                >
                  Salvar local padrão
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={replicateClvDefaultLocation} onCheckedChange={setReplicateClvDefaultLocation} />
                <p className="text-sm text-muted-foreground">Replicar local padrão para todos os novos jogos do CLV</p>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3">
          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
            <p className="text-xs font-medium text-muted-foreground">Naipe</p>
            <RadioGroup
              value={naipe}
              onValueChange={(value) => {
                if (isMatchNaipe(value)) {
                  setNaipe(value);
                }
              }}
              className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-5"
            >
              {NAIPE_OPTIONS.map((naipeOption) => {
                return (
                  <Label
                    key={naipeOption}
                    htmlFor={`create-match-naipe-${naipeOption}`}
                    className="flex cursor-pointer items-center gap-2 p-0 text-sm font-medium text-foreground"
                  >
                    <RadioGroupItem id={`create-match-naipe-${naipeOption}`} value={naipeOption} />
                    <span>{MATCH_NAIPE_LABELS[naipeOption]}</span>
                  </Label>
                );
              })}
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:col-span-2">
            <Select value={sportId} onValueChange={setSportId}>
              <SelectTrigger className="glass-input">
                <SelectValue placeholder="Modalidade" />
              </SelectTrigger>
              <SelectContent>
                {availableSportsForCreate.map((sport) => (
                  <SelectItem key={sport.id} value={sport.id}>
                    {sport.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {championshipUsesDivisions ? (
              <Select
                value={division}
                onValueChange={(value) => {
                  if (isTeamDivision(value)) {
                    setDivision(value);
                    setHomeTeamId("");
                    setAwayTeamId("");
                  }
                }}
              >
                <SelectTrigger className="glass-input">
                  <SelectValue placeholder="Divisão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TeamDivision.DIVISAO_PRINCIPAL}>
                    {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_PRINCIPAL]}
                  </SelectItem>
                  <SelectItem value={TeamDivision.DIVISAO_ACESSO}>{TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_ACESSO]}</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="glass-panel-muted px-3 py-2 text-sm text-muted-foreground">
                Divisão unificada
              </div>
            )}
          </div>

          {locationIsLockedForClv ? (
            <div className="glass-panel-muted px-3 py-2 text-sm text-muted-foreground">
              {clvDefaultLocation || "Local replicado do padrão CLV"}
            </div>
          ) : (
            <Input
              placeholder="Local"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className="glass-input"
            />
          )}

          <div className="grid grid-cols-2 gap-3 sm:col-span-2 md:col-span-3 md:grid-cols-2 lg:col-span-3 lg:grid-cols-4">
            <Select value={homeTeamId} onValueChange={setHomeTeamId}>
              <SelectTrigger className="glass-input">
                <SelectValue placeholder="Time Casa" />
              </SelectTrigger>
              <SelectContent>
                {eligibleTeams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={awayTeamId} onValueChange={setAwayTeamId}>
              <SelectTrigger className="glass-input">
                <SelectValue placeholder="Time Visitante" />
              </SelectTrigger>
              <SelectContent>
                {eligibleTeams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DateTimePicker value={startTime} onChange={setStartTime} placeholder="Início" />
            <DateTimePicker value={endTime} onChange={setEndTime} placeholder="Fim" />
          </div>
          </div>

          <Button onClick={handleAdd} className="shadow-[0_4px_10px_rgba(15,23,42,0.06)] hover:shadow-[0_6px_14px_rgba(15,23,42,0.08)]">
            <Plus className="mr-1 h-4 w-4" /> Criar Jogo
          </Button>

          {availableSportsForCreate.length == 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma modalidade vinculada ao campeonato para este naipe.</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Perfil em visualização: sem permissão para criar, editar ou remover jogos.</p>
      )}

      <div className="enter-section space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select value={matchesTeamFilter} onValueChange={setMatchesTeamFilter}>
            <SelectTrigger className="glass-input">
              <SelectValue placeholder="Filtrar por atlética" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_MATCHES_TEAM_FILTER}>Todas as atléticas</SelectItem>
              {teamsForMatchesFilter.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={matchesSportFilter} onValueChange={setMatchesSportFilter}>
            <SelectTrigger className="glass-input">
              <SelectValue placeholder="Filtrar por modalidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_MATCHES_SPORT_FILTER}>Todas as modalidades</SelectItem>
              {sportsForMatchesFilter.map((sport) => (
                <SelectItem key={sport.id} value={sport.id}>
                  {sport.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={matchesNaipeFilter} onValueChange={setMatchesNaipeFilter}>
            <SelectTrigger className="glass-input">
              <SelectValue placeholder="Filtrar por naipe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_MATCHES_NAIPE_FILTER}>Todos os naipes</SelectItem>
              {NAIPE_OPTIONS.map((naipeOption) => (
                <SelectItem key={naipeOption} value={naipeOption}>
                  {MATCH_NAIPE_LABELS[naipeOption]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filteredAndSortedMatches.length == 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum jogo encontrado para os filtros selecionados.</p>
        ) : null}

        {filteredAndSortedMatches.map((match) => (
          <div key={match.id} className="enter-item space-y-3 glass-card px-4 py-3">
            <div className="min-w-0 space-y-2">
              <div className="flex w-full items-center gap-2 overflow-x-auto pb-1">
                <span className="shrink-0 text-xs font-medium uppercase text-muted-foreground">{match.sports?.name}</span>

                <AppBadge tone={resolveMatchNaipeBadgeTone(String(match.naipe))} className="shrink-0 whitespace-nowrap">
                  {resolveMatchNaipeLabel(String(match.naipe))}
                </AppBadge>

                <AppBadge tone={resolveMatchStatusBadgeTone(match.status)} className="shrink-0 whitespace-nowrap">
                  {resolveMatchStatusLabel(match.status)}
                </AppBadge>

                {match.division ? (
                  <AppBadge tone={TEAM_DIVISION_BADGE_TONES[match.division]} className="shrink-0 whitespace-nowrap">
                    {TEAM_DIVISION_LABELS[match.division]}
                  </AppBadge>
                ) : null}
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex min-h-9 items-center gap-2 text-sm font-display font-semibold">
                    <span className="truncate">{match.home_team?.name}</span>
                    <span className="shrink-0 text-base font-bold score-text">
                      {match.home_score} × {match.away_score}
                    </span>
                    <span className="truncate">{match.away_team?.name}</span>
                  </div>

                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    <p>Local: {match.location}</p>
                    <p>Data e horário: {format(new Date(match.start_time), "dd/MM HH:mm", { locale: ptBR })}</p>
                  </div>
                </div>

                {canManageMatches ? (
                  <div className="flex shrink-0 flex-col items-center gap-1">
                    {editingMatchId == match.id ? (
                      <>
                        <Button variant="ghost" size="icon" onClick={handleSaveEditingMatch}>
                          <Save className="h-4 w-4 text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={handleCancelEditingMatch}>
                          <X className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="icon" onClick={() => handleStartEditingMatch(match)}>
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}

                    <Button variant="ghost" size="icon" onClick={() => handleDelete(match.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            {canManageMatches && editingMatchId == match.id && editingMatchDraft ? (
              <div className="grid grid-cols-1 gap-3 glass-panel-muted p-3 sm:grid-cols-2 lg:grid-cols-3">
                <Select
                  value={editingMatchDraft.naipe}
                  onValueChange={(value) => {
                    if (!isMatchNaipe(value)) {
                      return;
                    }

                    setEditingMatchDraft((currentDraft) =>
                      currentDraft
                        ? {
                            ...currentDraft,
                            naipe: value,
                            sportId: "",
                          }
                        : currentDraft,
                    );
                  }}
                >
                  <SelectTrigger className="glass-input">
                    <SelectValue placeholder="Naipe" />
                  </SelectTrigger>
                  <SelectContent>
                    {NAIPE_OPTIONS.map((naipeOption) => (
                      <SelectItem key={naipeOption} value={naipeOption}>
                        {MATCH_NAIPE_LABELS[naipeOption]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={editingMatchDraft.sportId}
                  onValueChange={(value) =>
                    setEditingMatchDraft((currentDraft) =>
                      currentDraft
                        ? {
                            ...currentDraft,
                            sportId: value,
                          }
                        : currentDraft,
                    )
                  }
                >
                  <SelectTrigger className="glass-input">
                    <SelectValue placeholder="Modalidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSportsForEditing.map((sport) => (
                      <SelectItem key={sport.id} value={sport.id}>
                        {sport.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {championshipUsesDivisions ? (
                  <Select
                    value={editingMatchDraft.division}
                    onValueChange={(value) => {
                      if (!isTeamDivision(value)) {
                        return;
                      }

                      setEditingMatchDraft((currentDraft) =>
                        currentDraft
                          ? {
                              ...currentDraft,
                              division: value,
                              homeTeamId: "",
                              awayTeamId: "",
                            }
                          : currentDraft,
                      );
                    }}
                  >
                    <SelectTrigger className="glass-input">
                      <SelectValue placeholder="Divisão" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TeamDivision.DIVISAO_PRINCIPAL}>
                        {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_PRINCIPAL]}
                      </SelectItem>
                      <SelectItem value={TeamDivision.DIVISAO_ACESSO}>{TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_ACESSO]}</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="glass-panel-muted px-3 py-2 text-sm text-muted-foreground">
                    Divisão unificada (Principal e Acesso juntas)
                  </div>
                )}

                <Input
                  value={editingMatchDraft.location}
                  onChange={(event) =>
                    setEditingMatchDraft((currentDraft) =>
                      currentDraft
                        ? {
                            ...currentDraft,
                            location: event.target.value,
                          }
                        : currentDraft,
                    )
                  }
                  className="glass-input"
                  placeholder="Local"
                />

                <Select
                  value={editingMatchDraft.homeTeamId}
                  onValueChange={(value) =>
                    setEditingMatchDraft((currentDraft) =>
                      currentDraft
                        ? {
                            ...currentDraft,
                            homeTeamId: value,
                          }
                        : currentDraft,
                    )
                  }
                >
                  <SelectTrigger className="glass-input">
                    <SelectValue placeholder="Time Casa" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleTeamsForEditingMatch.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={editingMatchDraft.awayTeamId}
                  onValueChange={(value) =>
                    setEditingMatchDraft((currentDraft) =>
                      currentDraft
                        ? {
                            ...currentDraft,
                            awayTeamId: value,
                          }
                        : currentDraft,
                    )
                  }
                >
                  <SelectTrigger className="glass-input">
                    <SelectValue placeholder="Time Visitante" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleTeamsForEditingMatch.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <DateTimePicker
                  value={editingMatchDraft.startTime}
                  onChange={(value) =>
                    setEditingMatchDraft((currentDraft) =>
                      currentDraft
                        ? {
                            ...currentDraft,
                            startTime: value,
                          }
                        : currentDraft,
                    )
                  }
                  placeholder="Início"
                />

                <DateTimePicker
                  value={editingMatchDraft.endTime}
                  onChange={(value) =>
                    setEditingMatchDraft((currentDraft) =>
                      currentDraft
                        ? {
                            ...currentDraft,
                            endTime: value,
                          }
                        : currentDraft,
                    )
                  }
                  placeholder="Fim"
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
