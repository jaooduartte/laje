import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IndividualSportStandingsTable } from "@/components/IndividualSportStandingsTable";
import {
  Tabs,
  TabsContent,
  TabsNavigationList,
  TabsNavigationTrigger,
} from "@/components/ui/tabs";

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
    naipe: "MASCULINO" as const,
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
    naipe: "MASCULINO" as const,
    team_id: "team-2",
    team_name: "Atlética 2",
    division: null,
    total_points: 20,
    first_places: 0,
    second_places: 1,
    third_places: 0,
  },
];

const events = [
  {
    id: "event-1",
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
    id: "event-2",
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
];

const entries = [
  {
    id: "entry-1",
    event_id: "event-1",
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
    id: "entry-2",
    event_id: "event-1",
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
    id: "entry-3",
    event_id: "event-2",
    team_id: "team-1",
    athlete_name: null,
    final_position: 1,
    status: "FINISHED",
    points_awarded: 48,
    result_time_milliseconds: 110000,
    result_mark_centimeters: null,
    teams: { id: "team-1", name: "Atlética 1" },
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

    expect(
      screen.getByRole("tab", { name: "50m revezamento" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Geral da modalidade" }),
    ).toBeInTheDocument();
  });

  it("exibe uma coluna por prova e mantém PTS no fim da geral", async () => {
    render(<IndividualSportStandingsTable standings={standings} />);

    await screen.findByRole("tab", { name: "50m crawl" });

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
    expect(screen.getByText("30")).toHaveClass("text-primary");
  });

  it("permite consultar a classificação e pontuação de cada prova", async () => {
    render(<IndividualSportStandingsTable standings={standings} />);

    const eventTab = await screen.findByRole("tab", { name: "50m crawl" });
    fireEvent.mouseDown(eventTab);
    fireEvent.click(eventTab);

    expect(await screen.findByText("Atleta A")).toBeInTheDocument();
    expect(screen.getByText("28.456 s")).toBeInTheDocument();
    expect(screen.getByText("24")).toHaveClass("text-primary");
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
    expect(rows[1]).toHaveTextContent("Atlética 2");
    expect(rows[2]).toHaveTextContent("Atlética 1");
    expect(screen.getByText("Desclassificada")).toBeInTheDocument();
  });
});
