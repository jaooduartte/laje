import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
  },
}));

import {
  getBracketLocationSportPriorities,
} from "@/domain/championship-brackets/championshipBracket.repository";

describe("getBracketLocationSportPriorities", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("inclui modalidades com uma quadra e somente nas datas com jogos", async () => {
    const daysResponse = {
      data: [
        {
          id: "day-1",
          event_date: "2026-08-29",
          championship_bracket_locations: [
            {
              id: "location-1",
              name: "Campus Park",
              position: 1,
              location_group_id: "location-group-1",
              championship_bracket_courts: [
                {
                  id: "court-1",
                  name: "Ginásio",
                  position: 1,
                  court_group_id: "court-group-1",
                  championship_bracket_court_sports: [
                    {
                      sport_id: "basketball",
                      preferred_naipe: null,
                      preferred_division: null,
                      sequence_mode: "FLEXIBLE",
                    },
                    {
                      sport_id: "futsal",
                      preferred_naipe: null,
                      preferred_division: null,
                      sequence_mode: "FLEXIBLE",
                    },
                  ],
                },
                {
                  id: "court-2",
                  name: "Quadra",
                  position: 2,
                  court_group_id: "court-group-2",
                  championship_bracket_court_sports: [
                    {
                      sport_id: "basketball",
                      preferred_naipe: null,
                      preferred_division: null,
                      sequence_mode: "FLEXIBLE",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: "day-2",
          event_date: "2026-08-30",
          championship_bracket_locations: [
            {
              id: "location-2",
              name: "Campus Park",
              position: 1,
              location_group_id: "location-group-1",
              championship_bracket_courts: [
                {
                  id: "court-3",
                  name: "Ginásio",
                  position: 1,
                  court_group_id: "court-group-1",
                  championship_bracket_court_sports: [
                    {
                      sport_id: "basketball",
                      preferred_naipe: null,
                      preferred_division: null,
                      sequence_mode: "FLEXIBLE",
                    },
                    {
                      sport_id: "handball",
                      preferred_naipe: null,
                      preferred_division: null,
                      sequence_mode: "FLEXIBLE",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      error: null,
    };
    const prioritiesResponse = {
      data: [],
      error: null,
    };
    const bracketMatchesResponse = {
      data: [
        {
          match_id: "match-1",
          matches: {
            scheduled_date: "2026-08-29T08:00:00",
            sport_id: "basketball",
          },
        },
        {
          match_id: "match-2",
          matches: {
            scheduled_date: "2026-08-29",
            sport_id: "futsal",
          },
        },
        {
          match_id: "match-3",
          matches: {
            scheduled_date: "2026-08-30",
            sport_id: "handball",
          },
        },
      ],
      error: null,
    };

    mocks.from.mockImplementation((table: string) => {
      if (table === "championship_bracket_days") {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve(daysResponse),
            }),
          }),
        };
      }

      if (table === "championship_bracket_location_sport_priorities") {
        return {
          select: () => ({
            eq: () => Promise.resolve(prioritiesResponse),
          }),
        };
      }

      if (table === "championship_bracket_matches") {
        return {
          select: () => ({
            eq: () => ({
              not: () => Promise.resolve(bracketMatchesResponse),
            }),
          }),
        };
      }

      throw new Error(`Tabela não mockada: ${table}`);
    });

    const response = await getBracketLocationSportPriorities("edition-1");

    expect(response).toEqual({
      data: [
        expect.objectContaining({
          event_date: "2026-08-29",
          sport_id: "basketball",
          courts: expect.arrayContaining([
            expect.objectContaining({ court_name: "Ginásio" }),
            expect.objectContaining({ court_name: "Quadra" }),
          ]),
        }),
        expect.objectContaining({
          event_date: "2026-08-29",
          sport_id: "futsal",
          courts: [expect.objectContaining({ court_name: "Ginásio" })],
        }),
        expect.objectContaining({
          event_date: "2026-08-30",
          sport_id: "handball",
          courts: [expect.objectContaining({ court_name: "Ginásio" })],
        }),
      ],
      error: null,
    });
  });
});
