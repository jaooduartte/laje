import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AdminChampionshipQualificationSection } from "@/components/admin/AdminChampionshipQualificationSection";
import { BracketThirdPlaceMode, MatchNaipe, TeamDivision } from "@/lib/enums";
import type { ChampionshipBracketCompetition } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  updateBracketCompetitionSettings: vi.fn(),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/domain/championship-brackets/championshipBracket.repository", () => ({
  updateBracketCompetitionSettings: mocks.updateBracketCompetitionSettings,
}));

vi.mock("sonner", () => ({
  toast: mocks.toast,
}));

function buildCompetition(
  overrides: Partial<ChampionshipBracketCompetition> & Pick<ChampionshipBracketCompetition, "id" | "sport_id" | "sport_name" | "naipe">,
): ChampionshipBracketCompetition {
  return {
    id: overrides.id,
    sport_id: overrides.sport_id,
    sport_name: overrides.sport_name,
    naipe: overrides.naipe,
    division: overrides.division ?? null,
    groups_count: overrides.groups_count ?? 2,
    qualifiers_per_group: overrides.qualifiers_per_group ?? 1,
    should_complete_knockout_with_best_second_placed_teams:
      overrides.should_complete_knockout_with_best_second_placed_teams ?? true,
    knockout_pairing_mode: overrides.knockout_pairing_mode ?? "LINEAR",
    third_place_mode: overrides.third_place_mode ?? BracketThirdPlaceMode.NONE,
    groups: overrides.groups ?? [],
    knockout_matches: overrides.knockout_matches ?? [],
  };
}

describe("AdminChampionshipQualificationSection", () => {
  beforeEach(() => {
    mocks.updateBracketCompetitionSettings.mockReset();
    mocks.toast.error.mockReset();
    mocks.toast.success.mockReset();
  });

  it("salva apenas a configuração de classificação usando LINEAR internamente", async () => {
    mocks.updateBracketCompetitionSettings.mockResolvedValue({ error: null });
    const onSaved = vi.fn();

    render(
      <AdminChampionshipQualificationSection
        competitions={[
          buildCompetition({
            id: "competition-1",
            sport_id: "sport-beach-soccer",
            sport_name: "Beach Soccer",
            naipe: MatchNaipe.FEMININO,
            qualifiers_per_group: 1,
            should_complete_knockout_with_best_second_placed_teams: true,
            knockout_pairing_mode: "BEACH_SOCCER_FEM_DIRECT_SEMI",
          }),
        ]}
        isEditable
        onSaved={onSaved}
      />,
    );

    expect(screen.queryByText("Tipo de cruzamento")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Salvar classificação e cruzamento" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /1º e 2º por grupo/i }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar classificação" }));

    await waitFor(() => {
      expect(mocks.updateBracketCompetitionSettings).toHaveBeenCalledWith(
        "competition-1",
        2,
        false,
        "LINEAR",
      );
    });

    expect(onSaved).toHaveBeenCalled();
    expect(mocks.toast.success).toHaveBeenCalledWith(
      "Configuração de classificação atualizada.",
    );
  });

  it("bloqueia edição quando o mata-mata já foi gerado", () => {
    render(
      <AdminChampionshipQualificationSection
        competitions={[
          buildCompetition({
            id: "competition-locked",
            sport_id: "sport-society",
            sport_name: "Futebol Society",
            naipe: MatchNaipe.FEMININO,
            knockout_matches: [
              {
                id: "knockout-1",
                round_number: 1,
                slot_number: 1,
                match_id: "match-1",
                status: "SCHEDULED",
                scheduled_date: null,
                queue_position: null,
                scheduled_slot: null,
                start_time: null,
                end_time: null,
                location: null,
                court_name: null,
                home_team_id: null,
                away_team_id: null,
                home_team_name: null,
                away_team_name: null,
                winner_team_id: null,
                winner_team_name: null,
                is_bye: false,
                is_third_place: false,
              },
            ],
          }),
        ]}
        isEditable
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByText("Mata-mata já gerado")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Salvar classificação" }),
    ).not.toBeInTheDocument();
  });
});
