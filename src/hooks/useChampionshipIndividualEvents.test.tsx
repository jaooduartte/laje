import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChampionshipIndividualEvents } from "@/hooks/useChampionshipIndividualEvents";

const repositoryMocks = vi.hoisted(() => ({
  fetchChampionshipAthletes: vi.fn(),
  fetchChampionshipIndividualEventEntries: vi.fn(),
  fetchChampionshipIndividualEvents: vi.fn(),
  fetchChampionshipIndividualSessionParticipants: vi.fn(),
  fetchChampionshipIndividualSessions: vi.fn(),
  fetchChampionshipIndividualTeamStandings: vi.fn(),
}));
const sportIds = ["sport-swimming"];

vi.mock("@/domain/individual-events/championshipIndividualEvents.repository", () => repositoryMocks);

describe("useChampionshipIndividualEvents", () => {
  beforeEach(() => {
    repositoryMocks.fetchChampionshipIndividualEvents.mockResolvedValue({
      data: [
        { id: "event-eligible", session_id: "session-eligible" },
        { id: "event-disqualified", session_id: "session-disqualified" },
      ],
      error: null,
    });
    repositoryMocks.fetchChampionshipIndividualSessions.mockResolvedValue({
      data: [
        { id: "session-eligible" },
        { id: "session-disqualified" },
      ],
      error: null,
    });
    repositoryMocks.fetchChampionshipIndividualSessionParticipants.mockImplementation(
      async (sessionId: string) => ({
        data:
          sessionId == "session-eligible"
            ? [{ id: "team-engenios" }]
            : [],
        error: null,
      }),
    );
    repositoryMocks.fetchChampionshipIndividualEventEntries.mockResolvedValue({
      data: [],
      membersByEntryId: {},
      error: null,
    });
    repositoryMocks.fetchChampionshipAthletes.mockResolvedValue({ data: [], error: null });
    repositoryMocks.fetchChampionshipIndividualTeamStandings.mockResolvedValue({ data: [], error: null });
  });

  it("exibe somente sessões em que a atlética filtrada permanece elegível", async () => {
    const { result } = renderHook(() =>
      useChampionshipIndividualEvents({
        championshipId: "championship-1",
        seasonYear: 2026,
        sportIds,
        participantTeamId: "team-engenios",
        includeEntries: false,
        includeStandings: false,
      }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.sessions.map((session) => session.id)).toEqual([
      "session-eligible",
    ]);
    expect(result.current.events.map((event) => event.id)).toEqual([
      "event-eligible",
    ]);
    expect(
      repositoryMocks.fetchChampionshipIndividualSessionParticipants,
    ).toHaveBeenCalledWith("session-disqualified");
  });
});
