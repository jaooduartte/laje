import { describe, expect, it } from "vitest";
import type { ChampionshipIndividualSession, Match } from "@/lib/types";
import { MatchNaipe, MatchStatus } from "@/lib/enums";
import {
  type ScheduledKnockoutPlaceholder,
  resolvePublicScheduleTimeLabel,
  resolvePublicScheduleTimelineItems,
} from "@/domain/public-schedule/publicScheduleTimeline";

function buildMatch({ id, scheduledDate, queuePosition }: {
  id: string;
  scheduledDate: string;
  queuePosition: number;
}) {
  return {
    id,
    scheduled_date: scheduledDate,
    queue_position: queuePosition,
    scheduled_slot: queuePosition,
    start_time: null,
    status: MatchStatus.SCHEDULED,
    created_at: "2026-08-01T00:00:00.000Z",
  } as Match;
}

function buildSession({ id, scheduledDate }: { id: string; scheduledDate: string }) {
  return {
    id,
    scheduled_date: scheduledDate,
    period: "MATUTINO",
    naipe: MatchNaipe.MASCULINO,
    created_at: "2026-08-01T00:00:00.000Z",
  } as ChampionshipIndividualSession;
}

function buildPlaceholder({ id, scheduledDate }: { id: string; scheduledDate: string }) {
  return {
    id,
    scheduled_date: scheduledDate,
    queue_position: 1,
    scheduled_slot: 1,
    start_time: null,
  } as ScheduledKnockoutPlaceholder;
}

describe("resolvePublicScheduleTimelineItems", () => {
  it("converte horários ISO planejados para o fuso de São Paulo", () => {
    expect(resolvePublicScheduleTimeLabel("2026-09-14T01:00:00.000Z")).toBe("22:00");
    expect(resolvePublicScheduleTimeLabel("08:30")).toBe("08:30");
  });

  it("combina jogos, sessões e mata-mata antes de paginar pela data programada", () => {
    const timelineItems = resolvePublicScheduleTimelineItems({
      matches: [
        buildMatch({
          id: "match-29-august",
          scheduledDate: "2026-08-29",
          queuePosition: 1,
        }),
      ],
      individualSessions: [
        buildSession({ id: "session-29-august", scheduledDate: "2026-08-29" }),
      ],
      placeholders: [
        buildPlaceholder({ id: "knockout-7-september", scheduledDate: "2026-09-07" }),
      ],
      estimatedStartTimeByMatchId: {
        "match-29-august": "08:00",
      },
    });

    expect(timelineItems.map((item) => item.id)).toEqual([
      "session-29-august",
      "match-29-august",
      "knockout-7-september",
    ]);
    expect(timelineItems.slice(0, 2).map((item) => item.id)).toEqual([
      "session-29-august",
      "match-29-august",
    ]);
  });
});
