import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { YellowCardDisciplineTable } from "@/components/YellowCardDisciplineTable";
import { MatchNaipe } from "@/lib/enums";

describe("YellowCardDisciplineTable", () => {
  it("identifica a expansão e exibe somente cartões efetivamente recebidos por partida", () => {
    const { container } = render(
      <YellowCardDisciplineTable
        athletes={[
          {
            player_id: "player-1",
            player_name: "Atleta 1",
            team_id: "team-1",
            team_name: "Atlética 1",
            sport_id: "sport-1",
            sport_name: "Futsal",
            naipe: MatchNaipe.MASCULINO,
            division: null,
            yellow_cards_total: 2,
            yellow_cards_active: 2,
            red_cards_direct_total: 1,
            is_suspended: true,
            suspension_causes: [
              {
                match_id: "match-1",
                direct_red: false,
                yellow_accumulation: true,
              },
            ],
            served_suspensions: [
              {
                suspension_match_id: "match-1",
                direct_red: true,
                yellow_accumulation: false,
                served_match: {
                  match_id: "match-2",
                  match_number: 13,
                  scheduled_date: "2026-08-31",
                  start_time: "2026-08-31T19:30:00",
                  phase: "QUARTERFINAL",
                  opponent_name: "Atlética 3",
                },
              },
            ],
            effective_reset_phase: "NONE",
            next_match: null,
            matches: [
              {
                match_id: "match-1",
                match_number: 12,
                scheduled_date: "2026-08-30",
                start_time: "2026-08-30T17:30:00",
                phase: "GROUP_STAGE",
                opponent_name: "Atlética 2",
                yellow_cards: 2,
                red_cards_direct: 1,
              },
            ],
          },
        ]}
      />,
    );

    expect(container).toHaveTextContent("Jogo 12 • 30/08/2026 • 17:30");
    expect(container).toHaveTextContent("Atlética 1 × Atlética 2");
    expect(container).toHaveTextContent("Fase de grupos");
    expect(container).not.toHaveTextContent("Cartões em vigor");
    expect(container).not.toHaveTextContent("vermelho por acúmulo");
    expect(container).toHaveTextContent("Suspensão cumprida");
    expect(container).toHaveTextContent("Jogo 13 • 31/08/2026 • 19:30");
    expect(container).toHaveTextContent("Atlética 1 × Atlética 3");
    expect(container).toHaveTextContent("Quartas de final");
    expect(screen.getByLabelText("1 cartão vermelho direto")).toBeInTheDocument();
    expect(container.querySelector("summary svg")).toBeInTheDocument();
    expect(screen.getByText("Suspenso")).toHaveClass("bg-slate-200", "dark:bg-slate-800");
    expect(container.querySelector("details > div")).toHaveClass("lg:grid-cols-4");
  });

  it("exibe uma falha de consulta e permite tentar novamente", () => {
    const onRetry = vi.fn();

    render(
      <YellowCardDisciplineTable
        athletes={[]}
        error="Não foi possível carregar os cartões. Tente novamente."
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os cartões. Tente novamente.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
