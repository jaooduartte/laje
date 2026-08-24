import { describe, expect, it } from "vitest";
import {
  resolvePastLeagueEvents,
  resolveVisibleLeagueEvents,
} from "@/domain/league-events/leagueEventVisibility.utils";
import type { LeagueEvent } from "@/lib/types";

const leagueEvents = [
  { id: "past", event_date: "2026-08-23" },
  { id: "today", event_date: "2026-08-24" },
  { id: "future", event_date: "2026-08-25" },
] as LeagueEvent[];

describe("league event visibility", () => {
  it("oculta somente os eventos anteriores ao dia atual por padrão", () => {
    expect(
      resolveVisibleLeagueEvents(leagueEvents, "2026-08-24", false).map(
        (leagueEvent) => leagueEvent.id,
      ),
    ).toEqual(["today", "future"]);
  });

  it("mantém os eventos anteriores disponíveis quando solicitado", () => {
    expect(
      resolveVisibleLeagueEvents(leagueEvents, "2026-08-24", true).map(
        (leagueEvent) => leagueEvent.id,
      ),
    ).toEqual(["past", "today", "future"]);
    expect(
      resolvePastLeagueEvents(leagueEvents, "2026-08-24").map(
        (leagueEvent) => leagueEvent.id,
      ),
    ).toEqual(["past"]);
  });
});
