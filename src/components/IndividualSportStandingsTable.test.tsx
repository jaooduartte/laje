import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IndividualSportStandingsTable } from "@/components/IndividualSportStandingsTable";
import {
  Tabs,
  TabsContent,
  TabsNavigationList,
  TabsNavigationTrigger,
} from "@/components/ui/tabs";
import { MatchNaipe } from "@/lib/enums";

const repositoryMocks = vi.hoisted(() => ({
  events: vi.fn(),
  entries: vi.fn(),
}));

vi.mock("@/domain/individual-events/championshipIndividualEvents.repository", () => ({
  fetchChampionshipIndividualEvents: (...args: unknown[]) =>
    repositoryMocks.events(...args),
  fetchChampionshipIndividualEventEntries: (...args: unknown[]) =>
    repositoryMocks.entries(...args),
}));

const masculineStandings = [
  {
    championship_id: "championship-1",
    season_year: 2026,
    sport_id: "swimming",
    naipe: MatchNaipe.MASCULINO,
    team_id: "team-1",
    team_name: "Atlética 1",
    division: null,
    total_points: 30,
    first_places: 1,
    second_places: 0,
    third_places: 0,
  },
  {
    championship_id: "championship-1",
    season_year: 2026,
    sport_id: "swimming",
    naipe: MatchNaipe.MASCULINO,
    team_id: "team-2",
    team_name: "Atlética 2",
    division: null,
    total_points: 20,
    first_places: 0,
    second_places: 1,
    third_places: 0,
  },
];

const allNaipeStandings = [
  ...masculineStandings,
  {
    championship_id: "championship-1",
    season_year: 2026,
    sport_id: "swimming",
    naipe: MatchNaipe.FEMININO,
    team_id: "team-1",
    team_name: "Atlética 1",
    division: null,
    total_points: 18,
    first_places: 0,
    second_places: 1,
    third_places: 0,
  },
  {
    championship_id: "championship-1",
    season_year: 2026,
    sport_id: "swimming",
    naipe: MatchNaipe.FEMININO,
    team_id: "team-2",
    team_name: "Atlética 2",
    division: null,
    total_points: 22,
    first_places: 1,
    second_places: 0,
    third_places: 0,
  },
];

const events = [
  {
    id: "event-1-m",
    championship_id: "championship-1",
    season_year: 2026,
    sport_id: "swimming",
    naipe: "MASCULINO",
    division: null,
    event_code: "SWIMMING_50_FREE",
    name: "50m crawl",
    kind: "INDIVIDUAL",
    display_order: 1,
    relay_multiplier: 1,
  },
  {
    id: "event-1-f",
    championship_id: "championship-1",
    season_year: 2026,
    sport_id: "swimming",
    naipe: "FEMININO",
    division: null,
    event_code: "SWIMMING_50_FREE",
    name: "50m crawl",
    kind: "INDIVIDUAL",
    display_order: 1,
    relay_multiplier: 1,
  },
  {
    id: "event-2-m",
    championship_id: "championship-1",
    season_year: 2026,
    sport_id: "swimming",
    naipe: "MASCULINO",
    division: null,
    event_code: "SWIMMING_4X50_FREE",
    name: "50m revezamento",
    kind: "RELAY",
    display_order: 2,
    relay_multiplier: 2,
  },
  {
    id: "event-2-f",
    championship_id: "championship-1",
    season_year: 2026,
    sport_id: "swimming",
    naipe: "FEMININO",
    division: null,
    event_code: "SWIMMING_4X50_FREE",
    name: "50m revezamento",
    kind: "RELAY",
    display_order: 2,
    relay_multiplier: 2,
  },
];

const entries = [
  {
    id: "entry-1-m",
    event_id: "event-1-m",
    team_id: "team-1",
    athlete_name: "Atleta A",
    final_position: 1,
    status: "FINISHED",
    points_awarded: 24,
    result_time_milliseconds: 28456,
    result_mark_centimeters: null,
    teams: { id: "team-1", name: "Atlética 1" },
  },
  {
    id: "entry-2-m",
    event_id: "event-1-m",
    team_id: "team-2",
    athlete_name: "Atleta B",
    final_position: 2,
    status: "FINISHED",
    points_awarded: 22,
    result_time_milliseconds: 29100,
    result_mark_centimeters: null,
    teams: { id: "team-2", name: "Atlética 2" },
  },
  {
    id: "entry-1-f",
    event_id: "event-1-f",
    team_id: "team-1",
    athlete_name: "Atleta C",
    final_position: 2,
    status: "FINISHED",
    points_awarded: 16,
    result_time_milliseconds: 30100,
    result_mark_centimeters: null,
    teams: { id: "team-1", name: "Atlética 1" },
  },
  {
    id: "entry-2-f",
    event_id: "event-1-f",
    team_id: "team-2",
    athlete_name: "Atleta D",
    final_position: 1,
    status: "FINISHED",
    points_awarded: 24,
    result_time_milliseconds: 29800,
    result_mark_centimeters: null,
    teams: { id: "team-2", name: "Atlética 2" },
  },
  {
    id: "relay-1-m",
    event_id: "event-2-m",
    team_id: "team-1",
    athlete_name: null,
    final_position: 1,
    status: "FINISHED",
    points_awarded: 48,
    result_time_milliseconds: 110000,
    result_mark_centimeters: null,
    teams: { id: "team-1", name: "Atlética 1" },
  },
  {
    id: "relay-2-f",
    event_id: "event-2-f",
    team_id: "team-2",
    athlete_name: null,
    final_position: 1,
    status: "FINISHED",
    points_awarded: 48,
    result_time_milliseconds: 112000,
    result_mark_centimeters: null,
    teams: { id: "team-2", name: "Atlética 2" },
  },
];

describe("IndividualSportStandingsTable", () => {
  beforeEach(() => {
    repositoryMocks.events.mockReset();
    repositoryMocks.entries.mockReset();
    repositoryMocks.events.mockResolvedValue({ data: events, error: null });
    repositoryMocks.entries.mockResolvedValue({
      data: entries,
      membersByEntryId: {},
      error: null,
    });
  });

  it("substitui as abas coletivas por provas e geral da modalidade", async () => {
    render(
      <Tabs defaultValue="groups">
        <TabsNavigationList>
          <TabsNavigationTrigger value="groups">Por grupos</TabsNavigationTrigger>
          <TabsNavigationTrigger value="overall">Geral coletiva</TabsNavigationTrigger>
        </TabsNavigationList>
        <TabsContent value="groups">
          <IndividualSportStandingsTable standings={masculineStandings} />
        </TabsContent>
      </Tabs>,
    );

    await screen.findByRole("tab", { name: "50m crawl" });

    await waitFor(() => {
      expect(
        screen.queryByRole("tab", { name: "Por grupos" }),
      ).not.toBeInTheDocument();
    });

    expect(
      screen.getByRole("tab", { name: "50m revezamento" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Geral da modalidade" }),
    ).toBeInTheDocument();
  });

  it("não duplica abas nem colunas por naipe quando todos os naipes estão selecionados", async () => {
    render(<IndividualSportStandingsTable standings={allNaipeStandings} />);

    await screen.findByRole("tab", { name: "50m crawl" });

    expect(screen.getAllByRole("tab", { name: "50m crawl" })).toHaveLength(1);
    expect(
      screen.getAllByRole("tab", { name: "50m revezamento" }),
    ).toHaveLength(1);

    const columnHeaders = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent);

    expect(columnHeaders).toEqual([
      "#",
      "Atlética",
      "50m crawl",
      "50m revezamento",
      "PTS",
    ]);
  });

  it("agrega a classificação geral por atlética quando todos os naipes estão selecionados", async () => {
    render(<IndividualSportStandingsTable standings={allNaipeStandings} />);

    await screen.findByRole("tab", { name: "50m crawl" });

    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("Atlética 1");
    expect(rows[1]).toHaveTextContent("48");
    expect(rows[2]).toHaveTextContent("Atlética 2");
    expect(rows[2]).toHaveTextContent("42");
  });

  it("soma na mesma coluna os pontos da mesma prova entre os naipes", async () => {
    render(<IndividualSportStandingsTable standings={allNaipeStandings} />);

    await screen.findByRole("tab", { name: "50m crawl" });

    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("40");
    expect(rows[2]).toHaveTextContent("46");
  });

  it("mantém o padrão visual dos três primeiros colocados", async () => {
    render(<IndividualSportStandingsTable standings={allNaipeStandings} />);

    await screen.findByRole("tab", { name: "50m crawl" });

    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveClass("bg-amber-100/40");
    expect(rows[2]).toHaveClass("bg-slate-100/70");
  });

  it("separa os resultados masculino e feminino dentro da mesma aba de prova", async () => {
    render(<IndividualSportStandingsTable standings={allNaipeStandings} />);

    const eventTab = await screen.findByRole("tab", { name: "50m crawl" });
    fireEvent.mouseDown(eventTab);
    fireEvent.click(eventTab);

    expect(await screen.findByText("Masculino")).toBeInTheDocument();
    expect(screen.getByText("Feminino")).toBeInTheDocument();
    expect(screen.getByText("Atleta A")).toBeInTheDocument();
    expect(screen.getByText("Atleta C")).toBeInTheDocument();
  });

  it("permite consultar a classificação e pontuação de cada prova por naipe", async () => {
    render(<IndividualSportStandingsTable standings={masculineStandings} />);

    const eventTab = await screen.findByRole("tab", { name: "50m crawl" });
    fireEvent.mouseDown(eventTab);
    fireEvent.click(eventTab);

    expect(await screen.findByText("Atleta A")).toBeInTheDocument();
    expect(screen.getByText("28.456 s")).toBeInTheDocument();
    expect(screen.getByText("24")).toHaveClass("text-primary");
    expect(screen.queryByText("Feminino")).not.toBeInTheDocument();
  });

  it("mantém a atlética desclassificada no fim da classificação geral", async () => {
    render(
      <IndividualSportStandingsTable
        standings={masculineStandings}
        disqualifiedTeamKeys={new Set(["team-1:WITHOUT_DIVISION"])}
      />,
    );

    await screen.findByRole("tab", { name: "50m crawl" });

    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Atlética 2");
    expect(rows[2]).toHaveTextContent("Atlética 1");
    expect(screen.getByText("Desclassificada")).toBeInTheDocument();
  });
});
