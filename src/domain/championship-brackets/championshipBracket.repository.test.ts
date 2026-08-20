import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

import {
  getBracketLocationSportPriorities,
  getBracketKnockoutCourtPriorities,
} from "@/domain/championship-brackets/championshipBracket.repository";

describe("getBracketLocationSportPriorities", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.rpc.mockReset();
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
                  preferred_sport_id: "futsal",
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
                  preferred_sport_id: "basketball",
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
                  preferred_sport_id: "handball",
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
          courts: [
            expect.objectContaining({
              court_name: "Quadra",
              bracket_court_id: "court-2",
              preferred_sport_id: "basketball",
              is_primary_sport: true,
              sequence_mode: "FLEXIBLE",
            }),
          ],
        }),
        expect.objectContaining({
          event_date: "2026-08-29",
          sport_id: "futsal",
          courts: [
            expect.objectContaining({
              court_name: "Ginásio",
              is_primary_sport: true,
            }),
          ],
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

describe("getBracketKnockoutCourtPriorities", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.rpc.mockReset();
  });

  it("agrupa a mesma quadra lógica materializada com ids diferentes", async () => {
    const daysResponse = {
      data: [
        {
          championship_bracket_locations: [
            {
              name: "Campus Park",
              position: 1,
              location_group_id: "location-group-1",
              championship_bracket_courts: [
                {
                  name: "Ginásio",
                  position: 1,
                  court_group_id: "court-group-day-1",
                  championship_bracket_court_sports: [{ sport_id: "futsal" }],
                },
                {
                  name: "Quadra",
                  position: 2,
                  court_group_id: "court-group-2",
                  championship_bracket_court_sports: [{ sport_id: "futsal" }],
                },
              ],
            },
          ],
        },
        {
          championship_bracket_locations: [
            {
              name: " campus   park ",
              position: 2,
              location_group_id: "location-group-2",
              championship_bracket_courts: [
                {
                  name: "Ginasio",
                  position: 2,
                  court_group_id: "court-group-day-2",
                  championship_bracket_court_sports: [{ sport_id: "futsal" }],
                },
              ],
            },
          ],
        },
      ],
      error: null,
    };
    const competitionsResponse = {
      data: [
        { sport_id: "futsal", division: "DIVISAO_PRINCIPAL" },
        { sport_id: "futsal", division: "DIVISAO_ACESSO" },
      ],
      error: null,
    };
    const prioritiesResponse = {
      data: [
        {
          sport_id: "futsal",
          phase: "SEMIFINAL",
          division_scope: "DIVISAO_PRINCIPAL",
          location_group_id: "location-group-2",
          court_group_id: "court-group-day-2",
        },
      ],
      error: null,
    };
    const finalProgramResponse = {
      data: [
        {
          sport_id: "futsal",
          scheduled_date: "2026-09-19",
          location_name: "Campus Park",
          court_name: "Ginásio",
          location_group_id: "location-group-1",
          court_group_id: "court-group-day-1",
        },
        {
          sport_id: "futsal",
          scheduled_date: "2026-09-19",
          location_name: "Campus Park",
          court_name: "Ginásio",
          location_group_id: "location-group-1",
          court_group_id: "court-group-day-1",
        },
      ],
      error: null,
    };

    mocks.rpc.mockResolvedValue(finalProgramResponse);

    mocks.from.mockImplementation((table: string) => {
      if (table === "championship_bracket_days") {
        return {
          select: () => ({
            eq: () => Promise.resolve(daysResponse),
          }),
        };
      }

      if (table === "championship_bracket_competitions") {
        return {
          select: () => ({
            eq: () => Promise.resolve(competitionsResponse),
          }),
        };
      }

      if (table === "championship_bracket_knockout_court_priorities") {
        return {
          select: () => ({
            eq: () => Promise.resolve(prioritiesResponse),
          }),
        };
      }

      throw new Error(`Tabela não mockada: ${table}`);
    });

    const response = await getBracketKnockoutCourtPriorities("edition-1");
    const semifinal = response.data.find(
      (group) =>
        group.phase === "SEMIFINAL" &&
        group.division_scope === "DIVISAO_PRINCIPAL",
    );

    expect(semifinal?.courts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
        logical_key: "campus park::ginasio",
        location_group_id: "location-group-1",
        location_group_ids: ["location-group-1", "location-group-2"],
        court_group_id: "court-group-day-1",
        court_group_ids: ["court-group-day-1", "court-group-day-2"],
        }),
      ]),
    );
    expect(semifinal?.court_group_id).toBe("court-group-day-2");
    expect(semifinal?.programmed_finals).toEqual([
      {
        scheduled_date: "2026-09-19",
        location_name: "Campus Park",
        court_name: "Ginásio",
        location_group_id: "location-group-1",
        court_group_id: "court-group-day-1",
      },
    ]);
    expect(semifinal?.automatic_court?.court_group_id).toBe(
      "court-group-day-1",
    );
    expect(
      response.data.find(
        (group) =>
          group.phase === "SEMIFINAL" &&
          group.division_scope === "DIVISAO_ACESSO",
      )?.automatic_court?.court_group_id,
    ).toBe("court-group-2");
    expect(
      response.data.find((group) => group.phase === "FINAL")?.automatic_court
        ?.court_group_id,
    ).toBe("court-group-day-1");
  });
});
