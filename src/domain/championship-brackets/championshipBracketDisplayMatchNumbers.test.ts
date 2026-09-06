import { describe, expect, it } from "vitest";
import { MatchNaipe, MatchStatus } from "@/lib/enums";
import type { ChampionshipBracketView, Match } from "@/lib/types";
import { resolveKnockoutDisplayMatchNumberById } from "@/domain/championship-brackets/championshipBracketDisplayMatchNumbers";

describe("resolveKnockoutDisplayMatchNumberById", () => {
  it("reserva a sequência completa da fase de grupos, inclusive jogos sem slot ativo", () => {
    const championshipBracketView = {
      edition: null,
      competitions: [
        {
          id: "basketball-male",
          sport_id: "basketball",
          sport_name: "Basquetebol",
          naipe: MatchNaipe.MASCULINO,
          division: null,
          groups_count: 1,
          qualifiers_per_group: 2,
          third_place_mode: "NONE",
          groups: [
            {
              id: "basketball-male-group",
              group_number: 1,
              teams: [],
              matches: Array.from({ length: 5 }, (_, index) => ({
                id: `basketball-male-group-match-${index + 1}`,
                scheduled_slot: 27 + index,
                queue_position: 27 + index,
              })),
            },
          ],
          knockout_matches: [
            {
              id: "basketball-male-quarterfinal",
              round_number: 1,
              slot_number: 1,
              match_id: null,
              scheduled_date: "2026-09-12",
              scheduled_slot: 1,
              queue_position: 1,
              start_time: "2026-09-12T11:45:00-03:00",
              is_bye: false,
            },
          ],
        },
        {
          id: "basketball-female",
          sport_id: "basketball",
          sport_name: "Basquetebol",
          naipe: MatchNaipe.FEMININO,
          division: null,
          groups_count: 1,
          qualifiers_per_group: 2,
          third_place_mode: "NONE",
          groups: [
            {
              id: "basketball-female-group",
              group_number: 1,
              teams: [],
              matches: Array.from({ length: 5 }, (_, index) => ({
                id: `basketball-female-group-match-${index + 1}`,
                scheduled_slot: index == 4 ? null : 32 + index,
                queue_position: index == 4 ? null : 32 + index,
              })),
            },
          ],
          knockout_matches: [
            {
              id: "basketball-female-semifinal",
              round_number: 2,
              slot_number: 1,
              match_id: null,
              scheduled_date: "2026-09-12",
              scheduled_slot: 5,
              queue_position: 5,
              start_time: "2026-09-12T14:45:00-03:00",
              is_bye: false,
            },
          ],
        },
      ],
    } as ChampionshipBracketView;

    const pendingMatch = {
      id: "held-basketball-match",
      sport_id: "basketball",
      status: MatchStatus.SCHEDULED,
      is_pending_manual_relocation: true,
      scheduled_slot: null,
      queue_position: null,
      pending_manual_relocation_previous_schedule: {
        scheduled_slot: 35,
      },
    } as Match;

    expect(
      resolveKnockoutDisplayMatchNumberById(championshipBracketView, [
        pendingMatch,
      ]),
    ).toEqual({
      "basketball-male-quarterfinal": 37,
      "basketball-female-semifinal": 38,
    });
  });

  it("reinicia a sequência eliminatória para cada modalidade e naipe", () => {
    const championshipBracketView = {
      edition: {
        payload_snapshot: { match_numbering_mode: "SPORT_NAIPE" },
      },
      competitions: [
        {
          id: "handball-female",
          sport_id: "handball",
          sport_name: "Handebol",
          naipe: MatchNaipe.FEMININO,
          division: null,
          groups_count: 1,
          qualifiers_per_group: 2,
          third_place_mode: "NONE",
          groups: [
            {
              id: "handball-female-group",
              group_number: 1,
              teams: [],
              matches: [
                { id: "handball-female-group-1", queue_position: 1 },
                { id: "handball-female-group-2", queue_position: 2 },
              ],
            },
          ],
          knockout_matches: [
            {
              id: "handball-female-knockout",
              round_number: 1,
              slot_number: 1,
              match_id: null,
              scheduled_date: "2026-09-12",
              scheduled_slot: 1,
              queue_position: 5,
              start_time: "2026-09-12T08:00:00-03:00",
              is_bye: false,
            },
          ],
        },
        {
          id: "handball-male",
          sport_id: "handball",
          sport_name: "Handebol",
          naipe: MatchNaipe.MASCULINO,
          division: null,
          groups_count: 1,
          qualifiers_per_group: 2,
          third_place_mode: "NONE",
          groups: [
            {
              id: "handball-male-group",
              group_number: 1,
              teams: [],
              matches: [
                { id: "handball-male-group-1", queue_position: 3 },
                { id: "handball-male-group-2", queue_position: 4 },
              ],
            },
          ],
          knockout_matches: [
            {
              id: "handball-male-knockout",
              round_number: 1,
              slot_number: 1,
              match_id: null,
              scheduled_date: "2026-09-12",
              scheduled_slot: 2,
              queue_position: 6,
              start_time: "2026-09-12T09:00:00-03:00",
              is_bye: false,
            },
          ],
        },
      ],
    } as ChampionshipBracketView;

    expect(resolveKnockoutDisplayMatchNumberById(championshipBracketView)).toEqual({
      "handball-female-knockout": 3,
      "handball-male-knockout": 3,
    });
  });
});
