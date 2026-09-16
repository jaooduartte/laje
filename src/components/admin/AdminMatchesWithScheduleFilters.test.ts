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
    const filteredMatches = matches.filter(
      (match) => match.status == MatchStatus.SCHEDULED,
    );

    expect(filteredMatches.map((match) => match.location)).toEqual([
      "Campus Park",
      "Campus Park",
    ]);

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

    const filteredMatches = matches.filter(
      (match) => match.scheduled_date == "2026-09-13",
    );

    expect(filteredMatches.map((match) => match.court_name)).toEqual([
      "Ginásio",
    ]);
  });
});
