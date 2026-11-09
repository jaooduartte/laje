import { describe, expect, it } from "vitest";
import { createMatchesWithSchedulePlaceholderFilterMetadata } from "@/components/admin/AdminMatchesWithScheduleFilters";
import { MatchNaipe, MatchStatus } from "@/lib/enums";
import type { Match } from "@/lib/types";

function buildMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    championship_id: "championship-1",
    season_year: 2026,
    sport_id: "sport-1",
    naipe: MatchNaipe.MASCULINO,
    division: null,
    status: MatchStatus.SCHEDULED,
    scheduled_date: "2026-09-13",
    location: "Campus Park",
    court_name: "Ginásio",
    is_pending_manual_relocation: false,
    ...overrides,
  } as Match;
}

describe("AdminMatchesWithScheduleFilters", () => {
  it("expõe local e quadra de slots sem equipes apenas para os metadados dos filtros", () => {
    const realMatch = buildMatch();
    const placeholderMatch = buildMatch({
      id: "schedule-placeholder:final-1",
      court_name: "Quadra 43",
    });

    const matches = createMatchesWithSchedulePlaceholderFilterMetadata(
      [realMatch],
      [placeholderMatch],
    );
    const filteredMatches = matches.filter((match) => match.status == MatchStatus.SCHEDULED);

    expect(filteredMatches.map((match) => match.location)).toEqual(["Campus Park", "Campus Park"]);

    const courts: string[] = [];
    filteredMatches.forEach((match) => {
      if (match.court_name) {
        courts.push(match.court_name);
      }
    });
    expect(courts).toEqual(["Ginásio", "Quadra 43"]);

    expect([...filteredMatches].map((match) => match.id)).toEqual(["match-1"]);
    expect(filteredMatches.map((match) => match.id)).toEqual(["match-1"]);
  });

  it("respeita os filtros antes de disponibilizar o slot estrutural", () => {
    const matches = createMatchesWithSchedulePlaceholderFilterMetadata(
      [buildMatch()],
      [
        buildMatch({
          id: "schedule-placeholder:other-date",
          scheduled_date: "2026-09-19",
          court_name: "Quadra futura",
        }),
      ],
    );

    const filteredMatches = matches.filter((match) => match.scheduled_date == "2026-09-13");

    expect(filteredMatches.map((match) => match.court_name)).toEqual(["Ginásio"]);
  });

  it("preserva o contexto e os argumentos originais dos callbacks de array", () => {
    const realMatches = [buildMatch()];
    const matches = createMatchesWithSchedulePlaceholderFilterMetadata(realMatches, [
      buildMatch({ id: "schedule-placeholder:final-1" }),
    ]);
    const filterContext = { operation: "filter" };
    const filterCalls: Array<{ context: unknown; index: number; matches: Match[] }> = [];
    const filteredMatches = matches.filter(function (
      this: typeof filterContext,
      match: Match,
      index: number,
      originalMatches: Match[],
    ) {
      filterCalls.push({ context: this, index, matches: originalMatches });
      return match.status == MatchStatus.SCHEDULED;
    }, filterContext);

    expect(filterCalls).toEqual([
      { context: filterContext, index: 0, matches: realMatches },
      { context: filterContext, index: 1, matches: realMatches },
    ]);

    const mapContext = { operation: "map" };
    const mapCalls: Array<{ context: unknown; index: number; matches: Match[] }> = [];
    const locations = filteredMatches.map(function (
      this: typeof mapContext,
      match: Match,
      index: number,
      originalMatches: Match[],
    ) {
      mapCalls.push({ context: this, index, matches: originalMatches });
      return match.location;
    }, mapContext);

    expect(locations).toEqual(["Campus Park", "Campus Park"]);
    expect(mapCalls).toEqual([
      { context: mapContext, index: 0, matches: realMatches },
      { context: mapContext, index: 1, matches: realMatches },
    ]);

    const forEachContext = { operation: "forEach" };
    const forEachCalls: Array<{ context: unknown; index: number; matches: Match[] }> = [];
    filteredMatches.forEach(function (
      this: typeof forEachContext,
      _match: Match,
      index: number,
      originalMatches: Match[],
    ) {
      forEachCalls.push({ context: this, index, matches: originalMatches });
    }, forEachContext);

    expect(forEachCalls).toEqual([
      { context: forEachContext, index: 0, matches: realMatches },
      { context: forEachContext, index: 1, matches: realMatches },
    ]);
  });
});
