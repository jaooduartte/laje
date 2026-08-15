import { describe, expect, it } from "vitest";
import { resolveBracketDaySchedules } from "@/domain/championship-brackets/championshipBracketSchedule.utils";

const rawDays = [
  {
    id: "day-1",
    event_date: "2026-08-29",
    start_time: "07:30:00",
    end_time: "20:00:00",
    break_start_time: "12:00:00",
    break_end_time: "13:00:00",
    championship_bracket_locations: [
      {
        id: "location-1",
        location_group_id: "location-group-1",
        name: "Campus Park",
        position: 1,
        championship_bracket_courts: [
          {
            id: "court-1",
            court_group_id: "court-group-1",
            name: "Quadra Interna",
            position: 1,
          },
        ],
      },
    ],
    championship_bracket_day_breaks: [],
  },
];

const payloadSnapshot = {
  schedule_days: [
    {
      date: "2026-08-29",
      locations: [
        {
          id: "source-location-1",
          name: "Campus Park",
          position: 1,
          courts: [
            {
              id: "source-court-1",
              name: "Quadra Interna",
              position: 1,
            },
          ],
        },
      ],
    },
  ],
  resource_locks: [
    {
      date: "2026-08-29",
      start_time: "09:00:00",
      end_time: "10:00:00",
      location_key: "source-location-1",
      court_key: "source-court-1",
      location_name: "Campus Park",
      court_name: "Quadra Interna",
      lock_mode: "HARD",
      sport_id: null,
      naipe: null,
      division: null,
    },
  ],
};

describe("resolveBracketDaySchedules", () => {
  it("recupera o intervalo geral legado e o bloqueio específico da quadra", () => {
    const [day] = resolveBracketDaySchedules(rawDays, payloadSnapshot);

    expect(day.breaks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope_type: "ALL_COURTS",
          bracket_court_id: null,
          break_start_time: "12:00:00",
          break_end_time: "13:00:00",
        }),
        expect.objectContaining({
          scope_type: "COURT",
          bracket_court_id: "court-1",
          break_start_time: "09:00:00",
          break_end_time: "10:00:00",
        }),
      ]),
    );
  });

  it("mantém os intervalos persistidos da quadra como fonte prioritária", () => {
    const [day] = resolveBracketDaySchedules(
      [
        {
          ...rawDays[0],
          championship_bracket_day_breaks: [
            {
              id: "persisted-break-1",
              bracket_day_id: "day-1",
              break_start_time: "14:00:00",
              break_end_time: "15:00:00",
              position: 1,
              scope_type: "COURT",
              bracket_court_id: "court-1",
            },
          ],
        },
      ],
      payloadSnapshot,
    );

    expect(day.breaks.filter((brk) => brk.scope_type === "COURT")).toEqual([
      expect.objectContaining({
        id: "persisted-break-1",
        bracket_court_id: "court-1",
        break_start_time: "14:00:00",
        break_end_time: "15:00:00",
      }),
    ]);
  });

  it("não inclui reservas vinculadas a uma modalidade como intervalo da quadra", () => {
    const [day] = resolveBracketDaySchedules(rawDays, {
      ...payloadSnapshot,
      resource_locks: [
        {
          ...payloadSnapshot.resource_locks[0],
          sport_id: "sport-1",
        },
      ],
    });

    expect(day.breaks.filter((brk) => brk.scope_type === "COURT")).toHaveLength(0);
  });
});
