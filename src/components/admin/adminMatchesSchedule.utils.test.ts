import { describe, expect, it } from "vitest";
import {
  resolveBracketDayScheduleUpdates,
  resolveMatchScheduleMoveSortValue,
  resolveShouldRedistributeBracketScheduleAfterMatchEdit,
} from "@/components/admin/adminMatchesSchedule.utils";
import { MatchNaipe, MatchStatus, TeamDivision } from "@/lib/enums";

describe("adminMatchesSchedule utils", () => {
  it("uses scheduled_slot first when the screen is using global scheduled slots", () => {
    expect(
      resolveMatchScheduleMoveSortValue(
        {
          queue_position: 14,
          scheduled_slot: 6,
        },
        true,
      ),
    ).toBe(6);
  });

  it("uses queue_position first when the screen is using filtered queue order", () => {
    expect(
      resolveMatchScheduleMoveSortValue(
        {
          queue_position: 14,
          scheduled_slot: 6,
        },
        false,
      ),
    ).toBe(14);
  });

  it("converts bracket day schedules to the update payload shape", () => {
    expect(
      resolveBracketDayScheduleUpdates([
        {
          id: "day-1",
          event_date: "2026-06-21",
          start_time: "08:00",
          end_time: "18:00",
          breaks: [
            {
              id: "break-1",
              bracket_day_id: "day-1",
              break_start_time: "12:00",
              break_end_time: "13:00",
              position: 1,
              scope_type: "ALL_COURTS",
              bracket_court_id: null,
            },
          ],
          courts: [],
        },
      ]),
    ).toEqual([
      {
        date: "2026-06-21",
        start_time: "08:00",
        end_time: "18:00",
        breaks: [
          {
            break_start_time: "12:00",
            break_end_time: "13:00",
            position: 1,
            scope_type: "ALL_COURTS",
            bracket_court_id: null,
          },
        ],
      },
    ]);
  });

  it("redistributes after editing a scheduled match into another day", () => {
    expect(
      resolveShouldRedistributeBracketScheduleAfterMatchEdit({
        previousMatch: {
          status: MatchStatus.SCHEDULED,
          scheduled_date: "2026-06-20",
          queue_position: 10,
          scheduled_slot: 10,
          sport_id: "sport-1",
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          location: "Arena Seven",
          home_team_id: "home-1",
          away_team_id: "away-1",
        },
        nextMatch: {
          status: MatchStatus.SCHEDULED,
          scheduled_date: "2026-06-21",
          queue_position: 10,
          scheduled_slot: 10,
          sport_id: "sport-1",
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          location: "Arena Seven",
          home_team_id: "home-1",
          away_team_id: "away-1",
        },
      }),
    ).toBe(true);
  });

  it("redistributes when a non-scheduled match becomes scheduled", () => {
    expect(
      resolveShouldRedistributeBracketScheduleAfterMatchEdit({
        previousMatch: {
          status: MatchStatus.LIVE,
          scheduled_date: "2026-06-20",
          queue_position: 10,
          scheduled_slot: 10,
          sport_id: "sport-1",
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          location: "Arena Seven",
          home_team_id: "home-1",
          away_team_id: "away-1",
        },
        nextMatch: {
          status: MatchStatus.SCHEDULED,
          scheduled_date: "2026-06-20",
          queue_position: 10,
          scheduled_slot: 10,
          sport_id: "sport-1",
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          location: "Arena Seven",
          home_team_id: "home-1",
          away_team_id: "away-1",
        },
      }),
    ).toBe(true);
  });

  it("does not redistribute when the match leaves the scheduled queue", () => {
    expect(
      resolveShouldRedistributeBracketScheduleAfterMatchEdit({
        previousMatch: {
          status: MatchStatus.SCHEDULED,
          scheduled_date: "2026-06-20",
          queue_position: 10,
          scheduled_slot: 10,
          sport_id: "sport-1",
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          location: "Arena Seven",
          home_team_id: "home-1",
          away_team_id: "away-1",
        },
        nextMatch: {
          status: MatchStatus.LIVE,
          scheduled_date: "2026-06-20",
          queue_position: 10,
          scheduled_slot: 10,
          sport_id: "sport-1",
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          location: "Arena Seven",
          home_team_id: "home-1",
          away_team_id: "away-1",
        },
      }),
    ).toBe(false);
  });
});
