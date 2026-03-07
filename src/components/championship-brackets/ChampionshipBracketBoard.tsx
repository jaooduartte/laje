import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ChampionshipBracketView } from "@/lib/types";
import { MatchNaipe, TeamDivision } from "@/lib/enums";
import {
  BRACKET_EDITION_STATUS_LABELS,
  BRACKET_THIRD_PLACE_MODE_LABELS,
  MATCH_NAIPE_LABELS,
  TEAM_DIVISION_LABELS,
  resolveMatchStatusLabel,
} from "@/lib/championship";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  championshipBracketView: ChampionshipBracketView;
  loading?: boolean;
  emptyMessage?: string;
}

const ALL_FILTER = "ALL_FILTER";

export function ChampionshipBracketBoard({
  championshipBracketView,
  loading = false,
  emptyMessage = "Nenhuma chave de campeonato encontrada.",
}: Props) {
  const [sportFilter, setSportFilter] = useState(ALL_FILTER);
  const [naipeFilter, setNaipeFilter] = useState(ALL_FILTER);
  const [divisionFilter, setDivisionFilter] = useState(ALL_FILTER);

  const availableSports = useMemo(() => {
    const sportsById = new Map<string, string>();

    championshipBracketView.competitions.forEach((competition) => {
      sportsById.set(competition.sport_id, competition.sport_name);
    });

    return [...sportsById.entries()].map(([id, name]) => ({ id, name }));
  }, [championshipBracketView.competitions]);

  const availableDivisions = useMemo(() => {
    const divisionSet = new Set<TeamDivision>();

    championshipBracketView.competitions.forEach((competition) => {
      if (competition.division) {
        divisionSet.add(competition.division);
      }
    });

    return [...divisionSet];
  }, [championshipBracketView.competitions]);

  const filteredCompetitions = useMemo(() => {
    return championshipBracketView.competitions.filter((competition) => {
      if (sportFilter != ALL_FILTER && competition.sport_id != sportFilter) {
        return false;
      }

      if (naipeFilter != ALL_FILTER && competition.naipe != naipeFilter) {
        return false;
      }

      if (divisionFilter != ALL_FILTER) {
        const currentDivision = competition.division ?? "";

        if (currentDivision != divisionFilter) {
          return false;
        }
      }

      return true;
    });
  }, [championshipBracketView.competitions, divisionFilter, naipeFilter, sportFilter]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Carregando chaves...</p>;
  }

  if (championshipBracketView.competitions.length == 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select value={sportFilter} onValueChange={setSportFilter}>
          <SelectTrigger className="glass-input">
            <SelectValue placeholder="Filtrar modalidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER}>Todas as modalidades</SelectItem>
            {availableSports.map((sport) => (
              <SelectItem key={sport.id} value={sport.id}>
                {sport.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={naipeFilter} onValueChange={setNaipeFilter}>
          <SelectTrigger className="glass-input">
            <SelectValue placeholder="Filtrar naipe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER}>Todos os naipes</SelectItem>
            <SelectItem value={MatchNaipe.MASCULINO}>{MATCH_NAIPE_LABELS[MatchNaipe.MASCULINO]}</SelectItem>
            <SelectItem value={MatchNaipe.FEMININO}>{MATCH_NAIPE_LABELS[MatchNaipe.FEMININO]}</SelectItem>
            <SelectItem value={MatchNaipe.MISTO}>{MATCH_NAIPE_LABELS[MatchNaipe.MISTO]}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={divisionFilter} onValueChange={setDivisionFilter}>
          <SelectTrigger className="glass-input">
            <SelectValue placeholder="Filtrar divisão" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER}>Todas as divisões</SelectItem>
            {availableDivisions.map((division) => (
              <SelectItem key={division} value={division}>
                {TEAM_DIVISION_LABELS[division]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {championshipBracketView.edition ? (
        <p className="text-xs text-muted-foreground">
          Edição atual: {BRACKET_EDITION_STATUS_LABELS[championshipBracketView.edition.status]}
        </p>
      ) : null}

      {filteredCompetitions.length == 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma competição encontrada para os filtros selecionados.</p>
      ) : null}

      {filteredCompetitions.map((competition) => {
        return (
          <div key={competition.id} className="space-y-3 rounded-xl border border-border/50 bg-background/35 p-4">
            <div className="space-y-1">
              <h3 className="font-display text-lg font-bold">
                {competition.sport_name} • {MATCH_NAIPE_LABELS[competition.naipe]}
                {competition.division ? ` • ${TEAM_DIVISION_LABELS[competition.division]}` : ""}
              </h3>
              <p className="text-xs text-muted-foreground">
                Chaves: {competition.groups_count} • Classificados/chave: {competition.qualifiers_per_group} • 3º lugar: {" "}
                {BRACKET_THIRD_PLACE_MODE_LABELS[competition.third_place_mode]}
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {competition.groups.map((group) => (
                <div key={group.id} className="rounded-lg border border-border/40 bg-background/50 p-3">
                  <p className="text-sm font-semibold">Chave {group.group_number}</p>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {group.teams.map((team) => (
                      <p key={`${group.id}-${team.team_id}`}>
                        {team.position}. {team.team_name}
                      </p>
                    ))}
                  </div>

                  <div className="mt-3 space-y-2">
                    {group.matches.map((match) => (
                      <div key={match.id} className="rounded-md border border-border/30 bg-background/60 p-2 text-xs">
                        <p className="font-semibold">
                          {match.home_team_name ?? "A definir"} x {match.away_team_name ?? "A definir"}
                        </p>
                        <p className="text-muted-foreground">
                          {match.status ? resolveMatchStatusLabel(match.status) : "Sem status"}
                          {match.start_time
                            ? ` • ${format(new Date(match.start_time), "dd/MM HH:mm", { locale: ptBR })}`
                            : ""}
                        </p>
                        <p className="text-muted-foreground">
                          {match.location ?? "Local a definir"}
                          {match.court_name ? ` • ${match.court_name}` : ""}
                        </p>
                      </div>
                    ))}

                    {group.matches.length == 0 ? (
                      <p className="text-xs text-muted-foreground">Sem jogos gerados nesta chave.</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 rounded-lg border border-border/40 bg-background/50 p-3">
              <p className="text-sm font-semibold">Mata-mata</p>

              {competition.knockout_matches.length == 0 ? (
                <p className="text-xs text-muted-foreground">Mata-mata ainda não gerado.</p>
              ) : (
                <div className="space-y-2">
                  {competition.knockout_matches.map((match) => (
                    <div key={match.id} className="rounded-md border border-border/30 bg-background/60 p-2 text-xs">
                      <p className="font-semibold">
                        Rodada {match.round_number} • Slot {match.slot_number}
                        {match.is_third_place ? " • 3º lugar" : ""}
                        {match.is_bye ? " • BYE" : ""}
                      </p>
                      <p>
                        {match.home_team_name ?? "A definir"} x {match.away_team_name ?? "A definir"}
                      </p>
                      <p className="text-muted-foreground">
                        {match.status ? resolveMatchStatusLabel(match.status) : "Aguardando definição"}
                        {match.start_time
                          ? ` • ${format(new Date(match.start_time), "dd/MM HH:mm", { locale: ptBR })}`
                          : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
