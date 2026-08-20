import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { AdminChampionshipQualificationSection } from "@/components/admin/AdminChampionshipQualificationSection";
import {
  BracketThirdPlaceMode,
  MatchNaipe,
  MatchStatus,
  TeamDivision,
} from "@/lib/enums";
import type { ChampionshipBracketCompetition } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  onRequestReconfiguration: vi.fn(),
}));

function buildCompetition(
  overrides: Partial<ChampionshipBracketCompetition> &
    Pick<
      ChampionshipBracketCompetition,
      "id" | "sport_id" | "sport_name" | "naipe"
    >,
): ChampionshipBracketCompetition {
  return {
    id: overrides.id,
    sport_id: overrides.sport_id,
    sport_name: overrides.sport_name,
    naipe: overrides.naipe,
    division: overrides.division ?? null,
    groups_count: overrides.groups_count ?? 2,
    qualifiers_per_group:
      overrides.qualifiers_per_group ?? 1,
    should_complete_knockout_with_best_second_placed_teams:
      overrides.should_complete_knockout_with_best_second_placed_teams ??
      true,
    knockout_pairing_mode:
      overrides.knockout_pairing_mode ?? "LINEAR",
    third_place_mode:
      overrides.third_place_mode ??
      BracketThirdPlaceMode.NONE,
    groups: overrides.groups ?? [],
    knockout_matches: overrides.knockout_matches ?? [],
  };
}

function buildStructuredKnockoutMatch(
  overrides: Partial<
    ChampionshipBracketCompetition["knockout_matches"][number]
  > = {},
): ChampionshipBracketCompetition["knockout_matches"][number] {
  return {
    id: "knockout-1",
    round_number: 1,
    slot_number: 1,
    match_id: null,
    status: MatchStatus.SCHEDULED,
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
    ...overrides,
  };
}

describe("AdminChampionshipQualificationSection", () => {
  beforeEach(() => {
    mocks.onRequestReconfiguration.mockReset();
  });

  it("mantém os cards recolhidos por padrão", () => {
    render(
      <AdminChampionshipQualificationSection
        competitions={[
          buildCompetition({
            id: "competition-1",
            sport_id: "sport-futsal",
            sport_name: "Futsal",
            naipe: MatchNaipe.MASCULINO,
          }),
        ]}
        isEditable
        onRequestReconfiguration={
          mocks.onRequestReconfiguration
        }
      />,
    );

    const cardTrigger = screen.getByRole("button", {
      name: /Futsal.*Masculino/i,
    });

    expect(cardTrigger).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    expect(
      screen.queryByRole("radio", {
        name: /1º e 2º por grupo/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("expande e recolhe uma competição de forma independente", () => {
    render(
      <AdminChampionshipQualificationSection
        competitions={[
          buildCompetition({
            id: "competition-1",
            sport_id: "sport-futsal",
            sport_name: "Futsal",
            naipe: MatchNaipe.MASCULINO,
          }),
          buildCompetition({
            id: "competition-2",
            sport_id: "sport-volei",
            sport_name: "Vôlei",
            naipe: MatchNaipe.FEMININO,
          }),
        ]}
        isEditable
        onRequestReconfiguration={
          mocks.onRequestReconfiguration
        }
      />,
    );

    const futsalTrigger = screen.getByRole("button", {
      name: /Futsal.*Masculino/i,
    });

    const voleiTrigger = screen.getByRole("button", {
      name: /Vôlei.*Feminino/i,
    });

    fireEvent.click(futsalTrigger);

    expect(futsalTrigger).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    expect(voleiTrigger).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    expect(
      screen.getByRole("radio", {
        name: /1º e 2º por grupo/i,
      }),
    ).toBeInTheDocument();

    fireEvent.click(futsalTrigger);

    expect(futsalTrigger).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("indica alterações pendentes mesmo após recolher o card", () => {
    render(
      <AdminChampionshipQualificationSection
        competitions={[
          buildCompetition({
            id: "competition-1",
            sport_id: "sport-futsal",
            sport_name: "Futsal",
            naipe: MatchNaipe.MASCULINO,
            qualifiers_per_group: 1,
            should_complete_knockout_with_best_second_placed_teams:
              true,
          }),
        ]}
        isEditable
        onRequestReconfiguration={
          mocks.onRequestReconfiguration
        }
      />,
    );

    const cardTrigger = screen.getByRole("button", {
      name: /Futsal.*Masculino/i,
    });

    fireEvent.click(cardTrigger);

    fireEvent.click(
      screen.getByRole("radio", {
        name: /1º e 2º por grupo/i,
      }),
    );

    expect(
      screen.getByText("Alterações pendentes"),
    ).toBeInTheDocument();

    fireEvent.click(cardTrigger);

    expect(cardTrigger).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    expect(
      screen.getByText("Alterações pendentes"),
    ).toBeInTheDocument();
  });

  it("solicita reprogramação com classificação e pareamento selecionados", async () => {
    mocks.onRequestReconfiguration.mockResolvedValue(true);

    render(
      <AdminChampionshipQualificationSection
        competitions={[
          buildCompetition({
            id: "competition-1",
            sport_id: "sport-futsal",
            sport_name: "Futsal",
            naipe: MatchNaipe.MASCULINO,
            qualifiers_per_group: 1,
            should_complete_knockout_with_best_second_placed_teams:
              true,
            knockout_pairing_mode: "LINEAR",
          }),
        ]}
        isEditable
        onRequestReconfiguration={
          mocks.onRequestReconfiguration
        }
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Futsal.*Masculino/i,
      }),
    );

    fireEvent.click(
      screen.getByRole("radio", {
        name: /1º e 2º por grupo/i,
      }),
    );

    fireEvent.click(
      screen.getByRole("radio", {
        name: /Clássico por cabeça de chave/i,
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Salvar configuração",
      }),
    );

    await waitFor(() => {
      expect(
        mocks.onRequestReconfiguration,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "COMPETITION_SETTINGS",

          label: expect.stringContaining(
            "Futsal",
          ),

          payload: expect.objectContaining({
            competition_id: "competition-1",

            qualifiers_per_group: 2,

            should_complete_knockout_with_best_second_placed_teams:
              false,

            knockout_pairing_mode: "CLASSIC_SEEDED",

            competition_label:
              expect.stringContaining("Futsal"),

            current_qualification_mode:
              "FIRST_ONLY_EXPANDED",

            current_qualification_label:
              "1º por grupo + melhores 2º",

            target_qualification_mode:
              "TOP_TWO",

            target_qualification_label:
              "1º e 2º por grupo",

            current_pairing_mode:
              "LINEAR",

            current_pairing_label:
              "Linear",

            target_pairing_mode:
              "CLASSIC_SEEDED",

            target_pairing_label:
              "Clássico por cabeça de chave",
          }),
        }),
      );
    });
  });

  it("bloqueia somente a classificação quando o mata-mata está estruturado", () => {
    render(
      <AdminChampionshipQualificationSection
        competitions={[
          buildCompetition({
            id: "competition-structured",
            sport_id: "sport-society",
            sport_name: "Futebol Society",
            naipe: MatchNaipe.FEMININO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            knockout_matches: [
              buildStructuredKnockoutMatch(),
            ],
          }),
        ]}
        isEditable
        onRequestReconfiguration={
          mocks.onRequestReconfiguration
        }
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Futebol Society.*Feminino/i,
      }),
    );

    expect(
      screen.getByText("Mata-mata estruturado"),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("radio", {
        name: /1º e 2º por grupo/i,
      }),
    ).toBeDisabled();

    expect(
      screen.getByRole("radio", {
        name: /Clássico por cabeça de chave/i,
      }),
    ).not.toBeDisabled();
  });

  it("bloqueia classificação e pareamento quando o mata-mata está materializado", () => {
    render(
      <AdminChampionshipQualificationSection
        competitions={[
          buildCompetition({
            id: "competition-materialized",
            sport_id: "sport-society",
            sport_name: "Futebol Society",
            naipe: MatchNaipe.FEMININO,
            knockout_matches: [
              buildStructuredKnockoutMatch({
                match_id: "match-1",
              }),
            ],
          }),
        ]}
        isEditable
        onRequestReconfiguration={
          mocks.onRequestReconfiguration
        }
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Futebol Society.*Feminino/i,
      }),
    );

    expect(
      screen.getByText("Mata-mata materializado"),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("radio", {
        name: /1º e 2º por grupo/i,
      }),
    ).toBeDisabled();

    expect(
      screen.getByRole("radio", {
        name: /Clássico por cabeça de chave/i,
      }),
    ).toBeDisabled();

    expect(
      screen.queryByRole("button", {
        name: "Salvar configuração",
      }),
    ).not.toBeInTheDocument();
  });
});
