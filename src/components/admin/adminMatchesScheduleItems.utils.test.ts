import { describe, expect, it } from "vitest";
import {
  resolveAdminMatchesKnockoutPlaceholders,
  resolveAdminMatchesScheduleItems,
} from "@/components/admin/adminMatchesScheduleItems.utils";
import { MatchNaipe, MatchStatus } from "@/lib/enums";
import type { ChampionshipBracketView, Match } from "@/lib/types";

const championshipBracketView = {
  edition: null,
  competitions: [
    {
      id: "competition-1",
      sport_id: "sport-1",
      sport_name: "Basquetebol",
      naipe: MatchNaipe.MASCULINO,
      division: null,
      groups_count: 2,
      qualifiers_per_group: 2,
      third_place_mode: "NONE",
      groups: [],
      knockout_matches: [
        {
          id: "placeholder-1",
          round_number: 1,
          slot_number: 1,
          match_id: null,
          status: null,
          scheduled_date: "2026-09-12",
          queue_position: 6,
          scheduled_slot: 6,
          start_time: "2026-09-12T14:45:00-03:00",
          end_time: "2026-09-12T15:30:00-03:00",
          location: "Campus Park",
          court_name: "Ginásio",
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
    },
  ],
} as ChampionshipBracketView;

function buildMatch(): Match {
  return {
    id: "match-1",
    championship_id: "championship-1",
    sport_id: "sport-1",
    naipe: MatchNaipe.MASCULINO,
    division: null,
    status: MatchStatus.SCHEDULED,
    scheduled_date: "2026-09-12",
    scheduled_slot: 5,
    queue_position: 5,
    start_time: "2026-09-12T14:00:00-03:00",
    end_time: "2026-09-12T14:45:00-03:00",
    location: "Campus Park",
    court_name: "Ginásio",
  } as Match;
}

describe("admin matches scheduled items", () => {
  it("inclui placeholders planejados e os ordena junto dos jogos reais", () => {
    const placeholders = resolveAdminMatchesKnockoutPlaceholders({
      championshipBracketView,
      matchesForMatchNumbering: [],
      sportId: null,
      scheduledDate: null,
      naipe: null,
      division: null,
      location: null,
      courtName: null,
      shouldIncludeScheduledItems: true,
      shouldExcludePlaceholdersForTeamOrGroupFilter: false,
    });

    const items = resolveAdminMatchesScheduleItems({
      matches: [buildMatch()],
      placeholders,
      estimatedStartTimeByMatchId: {},
    });

    expect(items.map((item) => item.type)).toEqual([
      "MATCH",
      "KNOCKOUT_PLACEHOLDER",
    ]);
    expect(items[1]).toMatchObject({
      type: "KNOCKOUT_PLACEHOLDER",
      placeholder: {
        stage_label: "Final",
        scheduled_slot: 6,
        display_match_number: 1,
      },
    });
  });

  it("oculta placeholders quando o filtro exige atlética ou grupo", () => {
    const placeholders = resolveAdminMatchesKnockoutPlaceholders({
      championshipBracketView,
      matchesForMatchNumbering: [],
      sportId: null,
      scheduledDate: null,
      naipe: null,
      division: null,
      location: null,
      courtName: null,
      shouldIncludeScheduledItems: true,
      shouldExcludePlaceholdersForTeamOrGroupFilter: true,
    });

    expect(placeholders).toEqual([]);
  });

  it("segue a mesma ordem de horário e número da timeline pública ao filtrar uma data", () => {
    const basketballMatch = {
      ...buildMatch(),
      id: "basketball-match",
      scheduled_slot: 27,
      queue_position: 27,
      start_time: null,
    };
    const volleyballMatch = {
      ...buildMatch(),
      id: "volleyball-match",
      sport_id: "sport-2",
      scheduled_slot: 33,
      queue_position: 33,
      start_time: null,
    };
    const placeholder = {
      ...resolveAdminMatchesKnockoutPlaceholders({
        championshipBracketView,
        matchesForMatchNumbering: [],
        sportId: null,
        scheduledDate: null,
        naipe: null,
        division: null,
        location: null,
        courtName: null,
        shouldIncludeScheduledItems: true,
        shouldExcludePlaceholdersForTeamOrGroupFilter: false,
      })[0],
      start_time: "2026-09-12T08:45:00-03:00",
    };

    const items = resolveAdminMatchesScheduleItems({
      matches: [volleyballMatch, basketballMatch],
      placeholders: [placeholder],
      estimatedStartTimeByMatchId: {
        "basketball-match": "08:00",
        "volleyball-match": "08:00",
      },
    });

    expect(items.map((item) => item.id)).toEqual([
      "basketball-match",
      "volleyball-match",
      "placeholder-1",
    ]);
  });
});
