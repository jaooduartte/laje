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
import {
  doesChampionshipSportSupportNaipe,
  MATCH_NAIPE_BADGE_CLASS_NAMES,
  MATCH_NAIPE_LABELS,
  TEAM_DIVISION_LABELS,
  isMatchNaipe,
  isTeamDivision,
} from "@/lib/championship";
import { Badge } from "@/components/ui/badge";

interface Props {
  matches: Match[];
  championshipSports: ChampionshipSport[];
  teams: Team[];
  selectedChampionship: Championship;
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

const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  [MatchStatus.SCHEDULED]: "Agendado",
  [MatchStatus.LIVE]: "Ao Vivo",
  [MatchStatus.FINISHED]: "Encerrado",
};

const NAIPE_OPTIONS: MatchNaipe[] = [MatchNaipe.MASCULINO, MatchNaipe.FEMININO, MatchNaipe.MISTO];

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

  const championshipUsesDivisions = selectedChampionship.uses_divisions;
  const isClvChampionship = selectedChampionship.code === ChampionshipCode.CLV;

  const availableSportsForCreate = useMemo(() => {
    return resolveSportsByNaipe(championshipSports, naipe);
  }, [championshipSports, naipe]);

  const availableSportsForEditing = useMemo(() => {
    if (!editingMatchDraft) {
      return [];
    }

    return resolveSportsByNaipe(championshipSports, editingMatchDraft.naipe);
  }, [championshipSports, editingMatchDraft]);

  const eligibleTeams = useMemo(() => {
    if (!championshipUsesDivisions) {
      return teams;
    }

    return teams.filter((team) => team.division === division);
  }, [championshipUsesDivisions, division, teams]);

  const eligibleTeamsForEditingMatch = useMemo(() => {
    if (!championshipUsesDivisions || !editingMatchDraft) {
      return teams;
    }

    return teams.filter((team) => team.division === editingMatchDraft.division);
  }, [championshipUsesDivisions, editingMatchDraft, teams]);

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

  const handleSaveClvDefaultLocation = async () => {
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
    const { error } = await supabase.from("matches").delete().eq("id", matchId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Jogo removido.");
    onRefetch();
  };

  const handleStartEditingMatch = (match: Match) => {
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
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h3 className="font-display font-semibold">Novo Jogo - {selectedChampionship.name}</h3>

        {isClvChampionship ? (
          <div className="space-y-3 rounded-md border border-border bg-secondary/40 p-3">
            <p className="text-sm font-medium">Local padrão da Copa Laje de Verão (CLV)</p>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Ex.: Arena oficial do CLV"
                value={clvDefaultLocation}
                onChange={(event) => setClvDefaultLocation(event.target.value)}
                className="bg-secondary border-border"
              />
              <Button type="button" variant="secondary" onClick={handleSaveClvDefaultLocation} disabled={savingClvDefaultLocation}>
                Salvar local padrão
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={replicateClvDefaultLocation} onCheckedChange={setReplicateClvDefaultLocation} />
              <p className="text-sm text-muted-foreground">Replicar local padrão para todos os novos jogos do CLV</p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            value={naipe}
            onValueChange={(value) => {
              if (isMatchNaipe(value)) {
                setNaipe(value);
              }
            }}
          >
            <SelectTrigger className="bg-secondary border-border">
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

          <Select value={sportId} onValueChange={setSportId}>
            <SelectTrigger className="bg-secondary border-border">
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
              <SelectTrigger className="bg-secondary border-border">
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
            <div className="rounded-md border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground">
              Divisão unificada (Principal e Acesso juntas)
            </div>
          )}

          <Input
            placeholder={isClvChampionship && replicateClvDefaultLocation ? "Local replicado do padrão CLV" : "Local"}
            value={isClvChampionship && replicateClvDefaultLocation ? clvDefaultLocation : location}
            onChange={(event) => setLocation(event.target.value)}
            disabled={isClvChampionship && replicateClvDefaultLocation}
            className="bg-secondary border-border"
          />

          <Select value={homeTeamId} onValueChange={setHomeTeamId}>
            <SelectTrigger className="bg-secondary border-border">
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
            <SelectTrigger className="bg-secondary border-border">
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

          <DateTimePicker value={startTime} onChange={setStartTime} placeholder="Início da partida" />

          <DateTimePicker value={endTime} onChange={setEndTime} placeholder="Fim da partida" />
        </div>

        <Button onClick={handleAdd}>
          <Plus className="mr-1 h-4 w-4" /> Criar Jogo
        </Button>

        {availableSportsForCreate.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma modalidade vinculada ao campeonato para este naipe.</p>
        ) : null}
      </div>

      <div className="space-y-2">
        {matches.map((match) => (
          <div key={match.id} className="space-y-3 rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase text-muted-foreground">{match.sports?.name}</span>

                  <Badge className={MATCH_NAIPE_BADGE_CLASS_NAMES[match.naipe]}>{MATCH_NAIPE_LABELS[match.naipe]}</Badge>

                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      match.status === MatchStatus.LIVE
                        ? "bg-live/10 text-live"
                        : match.status === MatchStatus.FINISHED
                          ? "bg-secondary text-finished"
                          : "bg-secondary text-scheduled"
                    }`}
                  >
                    {MATCH_STATUS_LABELS[match.status]}
                  </span>

                  {match.division ? (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                      {TEAM_DIVISION_LABELS[match.division]}
                    </span>
                  ) : null}
                </div>

                <p className="text-sm font-display font-semibold">
                  {match.home_team?.name} {match.home_score} × {match.away_score} {match.away_team?.name}
                </p>

                <p className="text-xs text-muted-foreground">
                  {match.location} • {format(new Date(match.start_time), "dd/MM HH:mm", { locale: ptBR })}
                </p>
              </div>

              <div className="flex items-center gap-1">
                {editingMatchId === match.id ? (
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
            </div>

            {editingMatchId === match.id && editingMatchDraft ? (
              <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-secondary/30 p-3 sm:grid-cols-2 lg:grid-cols-3">
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
                  <SelectTrigger className="bg-secondary border-border">
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
                  <SelectTrigger className="bg-secondary border-border">
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
                    <SelectTrigger className="bg-secondary border-border">
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
                  <div className="rounded-md border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground">
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
                  className="bg-secondary border-border"
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
                  <SelectTrigger className="bg-secondary border-border">
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
                  <SelectTrigger className="bg-secondary border-border">
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
                  placeholder="Início da partida"
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
                  placeholder="Fim da partida"
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
