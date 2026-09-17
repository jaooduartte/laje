import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const standings = [
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
    naipe: MatchNaipe.FEMININO,
    team_id: "team-1",
    team_name: "Atlética 1",
    division: null,
    total_points: 20,
    first_places: 0,
    second_places: 1,
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
    total_points: 17,
    first_places: 0,
    second_places: 0,
    third_places: 1,
  },
  {
    championship_id: "championship-1",
    season_year: 2026,
    sport_id: "swimming",
    naipe: MatchNaipe.MASCULINO,
    team_id: "team-3",
    team_name: "Atlética 3",
    division: null,
    total_points: 10,
    first_places: 0,
    second_places: 0,
    third_places: 1,
  },
  {
    championship_id: "championship-1",
    season_year: 2026,
    sport_id: "swimming",
    naipe: MatchNaipe.FEMININO,
    team_id: "team-3",
    team_name: "Atlética 3",
    division: null,
    total_points: 8,
    first_places: 0,
    second_places: 0,
    third_places: 0,
  },
];

const events = [
  {
    id: "crawl-m",
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
    id: "crawl-f",
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
    id: "relay-m",
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
    id: "relay-f",
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
    id: "crawl-m-1",
    event_id: "crawl-m",
    team_id: "team-1",
    athlete_name: "Atleta A",
    final_position: 1,
    status: "CONFIRMED",
    points_awarded: 24,
    result_time_milliseconds: 28456,
    result_mark_centimeters: null,
    teams: { id: "team-1", name: "Atlética 1" },
  },
  {
    id: "crawl-m-2",
    event_id: "crawl-m",
    team_id: "team-2",
    athlete_name: "Atleta B",
    final_position: 2,
    status: "CONFIRMED",
    points_awarded: 22,
    result_time_milliseconds: 29100,
    result_mark_centimeters: null,
    teams: { id: "team-2", name: "Atlética 2" },
  },
  {
    id: "crawl-f-1",
    event_id: "crawl-f",
    team_id: "team-1",
    athlete_name: "Atleta C",
    final_position: 1,
    status: "CONFIRMED",
    points_awarded: 24,
    result_time_milliseconds: 30100,
    result_mark_centimeters: null,
    teams: { id: "team-1", name: "Atlética 1" },
  },
  {
    id: "relay-m-1",
    event_id: "relay-m",
    team_id: "team-1",
    athlete_name: null,
    final_position: 1,
    status: "CONFIRMED",
    points_awarded: 48,
    result_time_milliseconds: null,
    result_mark_centimeters: null,
    teams: { id: "team-1", name: "Atlética 1" },
  },
  {
    id: "relay-f-1",
    event_id: "relay-f",
    team_id: "team-2",
    athlete_name: null,
    final_position: 1,
    status: "CONFIRMED",
    points_awarded: 48,
    result_time_milliseconds: null,
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

  it("não renderiza a tabela geral antes de carregar as provas", async () => {
    let resolveEvents: ((value: { data: typeof events; error: null }) => void) | null =
      null;

    repositoryMocks.events.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveEvents = resolve;
        }),
    );

    render(<IndividualSportStandingsTable standings={standings} />);

    expect(screen.queryByRole("columnheader", { name: "PTS" })).not.toBeInTheDocument();
    expect(
      screen.queryByText("Nenhuma prova configurada foi encontrada para o recorte selecionado."),
    ).not.toBeInTheDocument();

    await act(async () => {
      resolveEvents?.({ data: events, error: null });
    });

    expect(
      await screen.findByRole("tab", { name: "50m crawl" }),
    ).toBeInTheDocument();
  });

  it("substitui as abas coletivas por uma aba de cada prova e a geral", async () => {
    render(
      <Tabs defaultValue="groups">
        <TabsNavigationList>
          <TabsNavigationTrigger value="groups">Por grupos</TabsNavigationTrigger>
          <TabsNavigationTrigger value="overall">Geral coletiva</TabsNavigationTrigger>
        </TabsNavigationList>
        <TabsContent value="groups">
          <IndividualSportStandingsTable standings={standings} />
        </TabsContent>
      </Tabs>,
    );

    await screen.findByRole("tab", { name: "50m crawl" });

    await waitFor(() => {
      expect(
        screen.queryByRole("tab", { name: "Por grupos" }),
      ).not.toBeInTheDocument();
    });

    expect(screen.getAllByRole("tab", { name: "50m crawl" })).toHaveLength(1);
    expect(
      screen.getAllByRole("tab", { name: "50m revezamento" }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("tab", { name: "Geral da modalidade" }),
    ).toBeInTheDocument();
  });

  it("agrega os naipes na geral e mantém uma coluna por prova", async () => {
    render(<IndividualSportStandingsTable standings={standings} />);

    await screen.findByRole("tab", { name: "50m crawl" });

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent);

    expect(headers).toEqual([
      "#",
      "Atlética",
      "50m crawl",
      "50m revezamento",
      "PTS",
    ]);

    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Atlética 1");
    expect(rows[1]).toHaveTextContent("50");
    expect(rows[2]).toHaveTextContent("Atlética 2");
    expect(rows[3]).toHaveTextContent("Atlética 3");
    expect(screen.getAllByText("Atlética 1")).toHaveLength(1);
  });

  it("usa somente #, Atlética e PTS nas tabelas por prova", async () => {
    render(<IndividualSportStandingsTable standings={standings} />);

    const crawlTab = await screen.findByRole("tab", { name: "50m crawl" });
    fireEvent.mouseDown(crawlTab);
    fireEvent.click(crawlTab);

    expect(await screen.findByText("Masculino")).toBeInTheDocument();
    expect(screen.getByText("Feminino")).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Atleta" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Equipe" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Resultado" }),
    ).not.toBeInTheDocument();

    const crawlHeaders = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    expect(crawlHeaders).toEqual([
      "#",
      "Atlética",
      "PTS",
      "#",
      "Atlética",
      "PTS",
    ]);

    const relayTab = screen.getByRole("tab", { name: "50m revezamento" });
    fireEvent.mouseDown(relayTab);
    fireEvent.click(relayTab);

    expect(
      screen.queryByRole("columnheader", { name: "Atleta" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Equipe" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Resultado" }),
    ).not.toBeInTheDocument();
  });

  it("mantém as cores dos três primeiros colocados", async () => {
    render(<IndividualSportStandingsTable standings={standings} />);

    await screen.findByRole("tab", { name: "50m crawl" });

    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveClass("bg-amber-100/40");
    expect(rows[2]).toHaveClass("bg-slate-100/70");
    expect(rows[3]).toHaveClass("bg-orange-100/40");
  });

  it("mantém a atlética desclassificada no fim da classificação geral", async () => {
    render(
      <IndividualSportStandingsTable
        standings={standings}
        disqualifiedTeamKeys={new Set(["team-1:WITHOUT_DIVISION"])}
      />,
    );

    await screen.findByRole("tab", { name: "50m crawl" });

    const rows = screen.getAllByRole("row");
    expect(rows[3]).toHaveTextContent("Atlética 1");
    expect(screen.getByText("Desclassificada")).toBeInTheDocument();
  });
});
