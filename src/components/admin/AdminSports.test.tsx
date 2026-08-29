import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminSports } from "@/components/admin/AdminSports";
import {
  ChampionshipCode,
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
  ChampionshipStatus,
} from "@/lib/enums";
import type { Championship, ChampionshipSport, Sport } from "@/lib/types";

const {
  championshipSportsUpdateMock,
  sportsUpdateMock,
} = vi.hoisted(() => ({
  championshipSportsUpdateMock: vi.fn(),
  sportsUpdateMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table == "championship_sports") {
        return {
          update: (...args: unknown[]) => championshipSportsUpdateMock(...args),
        };
      }

      if (table == "sports") {
        return {
          update: (...args: unknown[]) => sportsUpdateMock(...args),
        };
      }

      return {};
    }),
  },
}));

vi.mock("@/domain/championship-brackets/championshipBracket.repository", () => ({
  updateBracketLocationSportPriorities: vi.fn(),
}));

describe("AdminSports", () => {
  const championship: Championship = {
    id: "championship-1",
    code: ChampionshipCode.SOCIETY,
    name: "Copa Laje Society",
    status: ChampionshipStatus.UPCOMING,
    current_season_year: 2026,
    uses_divisions: true,
    default_location: null,
    created_at: "2026-06-15T00:00:00.000Z",
  };

  const sports: Sport[] = [
    {
      id: "sport-1",
      name: "Futebol Society",
      default_match_duration_minutes: 40,
      created_at: "2026-06-15T00:00:00.000Z",
    },
  ];

  const championshipSports: ChampionshipSport[] = [
    {
      id: "championship-sport-1",
      championship_id: championship.id,
      sport_id: "sport-1",
      naipe_mode: ChampionshipSportNaipeMode.MASCULINO_FEMININO,
      result_rule: ChampionshipSportResultRule.POINTS,
      supports_cards: true,
      tie_breaker_rule: ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY,
      default_match_duration_minutes: 30,
      show_estimated_start_time_on_cards: true,
      points_win: 3,
      points_draw: 1,
      points_loss: 0,
      created_at: "2026-06-15T00:00:00.000Z",
      walkover_winner_points: 3,
      walkover_winner_set_count: 1,
      awards_include_knockout_phase: true,
      supports_individual_awards: true,
    },
  ];

  beforeEach(() => {
    championshipSportsUpdateMock.mockReset();
    sportsUpdateMock.mockReset();
    championshipSportsUpdateMock.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    sportsUpdateMock.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  it("prioriza o valor salvo em sports para preencher a duração da modalidade", () => {
    render(
      <AdminSports
        sports={sports}
        championshipSports={championshipSports}
        selectedChampionship={championship}
      />,
    );

    expect(screen.getByDisplayValue("40")).toBeInTheDocument();
  });

  it("exibe a nova nomenclatura e os critérios de premiação", () => {
    render(
      <AdminSports
        sports={sports}
        championshipSports={championshipSports}
        selectedChampionship={championship}
      />,
    );

    expect(screen.getByText("Cadastro de atletas na súmula")).toBeInTheDocument();
    expect(screen.getByText("Contabilização de prêmios (artilheiro e melhor defesa)")).toBeInTheDocument();
    expect(screen.getByText("Critérios de premiação")).toBeInTheDocument();
    expect(
      screen.getByText(/Com a opção desligada, a apuração considera somente a fase de grupos\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/só entram no ranking atléticas e jogadores de atléticas que disputaram ao menos um jogo eliminatório válido\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => {
        const textContent = element?.textContent?.trim() ?? "";
        const childHasSameText = Array.from(element?.children ?? []).some((child) =>
          child.textContent?.trim().includes("equipe que avançou mais longe no campeonato"),
        );

        return (
          element?.tagName == "P" &&
          textContent.includes("equipe que avançou mais longe no campeonato") &&
          !childHasSameText
        );
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Melhor defesa:/)).toBeInTheDocument();
    expect(screen.getByText(/A plataforma define a atlética vencedora da melhor defesa/)).toBeInTheDocument();
  });

  it("não exibe blocos de premiação para modalidades do Interlaje", () => {
    const interlajeChampionship: Championship = {
      ...championship,
      code: ChampionshipCode.INTERLAJE,
      name: "Interlaje",
    };

    render(
      <AdminSports
        sports={[
          {
            id: "sport-basket",
            name: "Basquetebol",
            default_match_duration_minutes: 35,
            created_at: "2026-06-15T00:00:00.000Z",
          },
        ]}
        championshipSports={[
          {
            ...championshipSports[0],
            championship_id: interlajeChampionship.id,
            sport_id: "sport-basket",
            supports_cards: false,
            tie_breaker_rule: ChampionshipSportTieBreakerRule.STANDARD,
            supports_individual_awards: false,
            awards_include_knockout_phase: false,
          },
        ]}
        selectedChampionship={interlajeChampionship}
      />,
    );

    expect(screen.queryByText("Cadastro de atletas na súmula")).not.toBeInTheDocument();
    expect(screen.queryByText("Contabilização de prêmios (artilheiro e melhor defesa)")).not.toBeInTheDocument();
    expect(screen.queryByText("Critérios de premiação")).not.toBeInTheDocument();
  });

  it("renderiza as modalidades oficiais do Interlaje já vinculadas sem mensagem de estado morto", () => {
    const interlajeChampionship: Championship = {
      ...championship,
      code: ChampionshipCode.INTERLAJE,
      name: "Interlaje",
    };

    const interlajeSports: Sport[] = [
      { id: "sport-basket", name: "Basquetebol", default_match_duration_minutes: 35, created_at: championship.created_at },
      { id: "sport-futsal", name: "Futsal", default_match_duration_minutes: 35, created_at: championship.created_at },
      { id: "sport-hand", name: "Handebol", default_match_duration_minutes: 35, created_at: championship.created_at },
      { id: "sport-volley", name: "Voleibol", default_match_duration_minutes: 35, created_at: championship.created_at },
      { id: "sport-athletics", name: "Atletismo", default_match_duration_minutes: 35, created_at: championship.created_at },
      { id: "sport-swimming", name: "Natação", default_match_duration_minutes: 35, created_at: championship.created_at },
    ];

    const interlajeChampionshipSports: ChampionshipSport[] = interlajeSports.map((sport) => ({
      ...championshipSports[0],
      id: `championship-${sport.id}`,
      championship_id: interlajeChampionship.id,
      sport_id: sport.id,
      tie_breaker_rule:
        sport.name == "Futsal"
          ? ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY
          : sport.name == "Voleibol"
            ? ChampionshipSportTieBreakerRule.POINTS_AVERAGE
            : ChampionshipSportTieBreakerRule.STANDARD,
      supports_cards: sport.name == "Futsal" || sport.name == "Handebol",
      result_rule: sport.name == "Voleibol" ? ChampionshipSportResultRule.SETS : ChampionshipSportResultRule.POINTS,
      points_win: ["Atletismo", "Natação"].includes(sport.name) ? 24 : 3,
      points_draw: ["Voleibol", "Atletismo", "Natação"].includes(sport.name) ? 0 : 1,
      supports_individual_awards: false,
      awards_include_knockout_phase: false,
    }));

    render(
      <AdminSports
        sports={interlajeSports}
        championshipSports={interlajeChampionshipSports}
        selectedChampionship={interlajeChampionship}
      />,
    );

    expect(screen.getByText("Basquetebol")).toBeInTheDocument();
    expect(screen.getByText("Futsal")).toBeInTheDocument();
    expect(screen.getByText("Handebol")).toBeInTheDocument();
    expect(screen.getByText("Voleibol")).toBeInTheDocument();
    expect(screen.getByText("Atletismo")).toBeInTheDocument();
    expect(screen.getByText("Natação")).toBeInTheDocument();
    expect(screen.queryByText("Modalidade oficial ainda não cadastrada na plataforma.")).not.toBeInTheDocument();
    expect(screen.queryByText("Disponível na plataforma, mas ainda não vinculada ao campeonato selecionado.")).not.toBeInTheDocument();
  });

  it("desabilita novamente o botão de salvar W.O. após persistir a configuração", async () => {
    render(
      <AdminSports
        sports={sports}
        championshipSports={championshipSports}
        selectedChampionship={championship}
      />,
    );

    expect(
      screen.queryByRole("spinbutton", {
        name: "Sets concedidos ao vencedor no W.O.",
      }),
    ).not.toBeInTheDocument();

    const walkoverInput = screen.getByDisplayValue("3");
    fireEvent.change(walkoverInput, {
      target: { value: "4" },
    });

    const saveButtons = screen.getAllByRole("button", { name: "Salvar" });
    const walkoverSaveButton = saveButtons[1]!;

    expect(walkoverSaveButton).toBeEnabled();

    fireEvent.click(walkoverSaveButton);

    await waitFor(() => {
      expect(championshipSportsUpdateMock).toHaveBeenCalledWith({
        walkover_winner_points: 4,
      });
    });

    await waitFor(() => {
      expect(walkoverSaveButton).toBeDisabled();
    });
  });

  it("configura pontos e sets concedidos para W.O. em modalidades por sets", async () => {
    const interlajeChampionship: Championship = {
      ...championship,
      code: ChampionshipCode.INTERLAJE,
      name: "Interlaje",
    };
    const volleyballSport: Sport = {
      id: "sport-volleyball",
      name: "Voleibol",
      default_match_duration_minutes: 35,
      created_at: championship.created_at,
    };
    const volleyballChampionshipSport: ChampionshipSport = {
      ...championshipSports[0],
      id: "championship-sport-volleyball",
      championship_id: interlajeChampionship.id,
      sport_id: volleyballSport.id,
      result_rule: ChampionshipSportResultRule.SETS,
      walkover_winner_points: 21,
      walkover_winner_set_count: 1,
    };

    render(
      <AdminSports
        sports={[volleyballSport]}
        championshipSports={[volleyballChampionshipSport]}
        selectedChampionship={interlajeChampionship}
      />,
    );

    expect(screen.getByText("Pontos por set no W.O.")).toBeInTheDocument();
    const setCountInput = screen.getByRole("spinbutton", {
      name: "Sets concedidos ao vencedor no W.O.",
    });
    expect(setCountInput).toHaveValue(1);

    fireEvent.change(setCountInput, { target: { value: "2" } });
    const walkoverSaveButton = screen
      .getAllByRole("button", { name: "Salvar" })
      .find((button) => !button.hasAttribute("disabled"));
    expect(walkoverSaveButton).toBeDefined();
    fireEvent.click(walkoverSaveButton!);

    await waitFor(() => {
      expect(championshipSportsUpdateMock).toHaveBeenCalledWith({
        walkover_winner_points: 21,
        walkover_winner_set_count: 2,
      });
    });
  });

  it("mantém a duração salva visível e refaz as modalidades após salvar", async () => {
    const onRefetchSports = vi.fn().mockResolvedValue(undefined);
    const onRefetchMatches = vi.fn().mockResolvedValue(undefined);

    render(
      <AdminSports
        sports={sports}
        championshipSports={championshipSports}
        selectedChampionship={championship}
        onRefetchSports={onRefetchSports}
        onRefetchMatches={onRefetchMatches}
      />,
    );

    const durationInput = screen.getByDisplayValue("40");
    fireEvent.change(durationInput, {
      target: { value: "45" },
    });

    const saveButtons = screen.getAllByRole("button", { name: "Salvar" });
    const durationSaveButton = saveButtons[0]!;

    fireEvent.click(durationSaveButton);

    await waitFor(() => {
      expect(sportsUpdateMock).toHaveBeenCalledWith({
        default_match_duration_minutes: 45,
      });
    });

    await waitFor(() => {
      expect(onRefetchSports).toHaveBeenCalledTimes(1);
      expect(onRefetchMatches).toHaveBeenCalledWith({ showFetching: true });
    });

    expect(screen.getByDisplayValue("45")).toBeInTheDocument();

    await waitFor(() => {
      expect(durationSaveButton).toBeDisabled();
    });
  });
});
