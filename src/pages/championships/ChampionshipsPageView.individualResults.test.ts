import { describe, expect, it } from "vitest";
import { resolveIndividualEventsWithResults } from "@/pages/championships/championshipIndividualResults.utils";
import {
  ChampionshipIndividualEntryStatus,
  ChampionshipIndividualEventKind,
  ChampionshipIndividualEventStatus,
  ChampionshipSchedulePeriod,
  MatchNaipe,
} from "@/lib/enums";
import type {
  ChampionshipIndividualEvent,
  ChampionshipIndividualEventEntry,
} from "@/lib/types";

const event: ChampionshipIndividualEvent = {
  id: "event-1",
  championship_id: "championship-1",
  season_year: 2026,
  sport_id: "sport-1",
  naipe: MatchNaipe.FEMININO,
  division: null,
  event_code: "SWIMMING_50_FREE",
  name: "50m livre",
  kind: ChampionshipIndividualEventKind.INDIVIDUAL,
  display_order: 1,
  scheduled_date: "2026-09-12",
  period: ChampionshipSchedulePeriod.MATUTINO,
  location: "Piscina",
  status: ChampionshipIndividualEventStatus.SCHEDULED,
  relay_multiplier: 1,
  created_at: "2026-08-20T00:00:00.000Z",
  updated_at: "2026-08-20T00:00:00.000Z",
};

function buildEntry(
  overrides: Partial<ChampionshipIndividualEventEntry> = {},
): ChampionshipIndividualEventEntry {
  return {
    id: "entry-1",
    event_id: event.id,
    team_id: "team-1",
    athlete_id: null,
    athlete_name: "Atleta",
    entry_type: ChampionshipIndividualEventKind.INDIVIDUAL,
    final_position: null,
    result_time_milliseconds: null,
    result_mark_centimeters: null,
    status: ChampionshipIndividualEntryStatus.CONFIRMED,
    points_awarded: 0,
    created_at: "2026-08-20T00:00:00.000Z",
    updated_at: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveIndividualEventsWithResults", () => {
  it("não exibe provas que ainda não possuem resultado oficial", () => {
    expect(
      resolveIndividualEventsWithResults([event], {
        [event.id]: [buildEntry()],
      }),
    ).toEqual([]);
  });

  it("exibe provas com classificação final lançada", () => {
    expect(
      resolveIndividualEventsWithResults([event], {
        [event.id]: [buildEntry({ final_position: 1 })],
      }),
    ).toEqual([event]);
  });
});
