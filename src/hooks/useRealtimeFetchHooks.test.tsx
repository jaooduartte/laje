import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLeagueEvents } from "@/hooks/useLeagueEvents";
import { usePendingLeagueEventReservationRequests } from "@/hooks/usePendingLeagueEventReservationRequests";
import { useSports } from "@/hooks/useSports";

const {
  channelMock,
  channelOnMock,
  eventHandlers,
  fetchLeagueEventsByDateRangeMock,
  fetchPendingLeagueEventReservationRequestCountMock,
  fromMock,
  removeChannelMock,
} = vi.hoisted(() => ({
  channelMock: {
    on: vi.fn(),
    subscribe: vi.fn(),
  },
  channelOnMock: vi.fn(),
  eventHandlers: [] as Array<() => void>,
  fetchLeagueEventsByDateRangeMock: vi.fn(),
  fetchPendingLeagueEventReservationRequestCountMock: vi.fn(),
  fromMock: vi.fn(),
  removeChannelMock: vi.fn(),
}));

vi.mock("@/hooks/useAwsRealtimePolling", () => ({
  useAwsRealtimePolling: vi.fn(),
}));

vi.mock("@/config/environment", () => ({
  isAwsBackendEnabled: () => false,
  isSupabaseBackendEnabled: () => true,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => channelMock),
    from: (...arguments_: unknown[]) => fromMock(...arguments_),
    removeChannel: (...arguments_: unknown[]) => removeChannelMock(...arguments_),
  },
}));

vi.mock("@/domain/league-events/leagueEvent.repository", () => ({
  fetchLeagueEventsByDateRange: (...arguments_: unknown[]) =>
    fetchLeagueEventsByDateRangeMock(...arguments_),
}));

vi.mock("@/domain/league-events/leagueEventReservation.repository", () => ({
  fetchPendingLeagueEventReservationRequestCount: (...arguments_: unknown[]) =>
    fetchPendingLeagueEventReservationRequestCountMock(...arguments_),
}));

vi.mock("@/integrations/laje-api/public-runtime", () => ({
  listAwsSports: vi.fn(),
}));

describe("hooks com atualizações realtime", () => {
  beforeEach(() => {
    eventHandlers.length = 0;
    channelOnMock.mockReset();
    channelMock.on.mockReset();
    channelMock.subscribe.mockReset();
    removeChannelMock.mockReset().mockResolvedValue("ok");
    fetchLeagueEventsByDateRangeMock.mockReset().mockResolvedValue({ data: [], error: null });
    fetchPendingLeagueEventReservationRequestCountMock
      .mockReset()
      .mockResolvedValue({ count: 0, error: null });

    channelMock.on.mockImplementation((...arguments_: unknown[]) => {
      channelOnMock(...arguments_);
      eventHandlers.push(arguments_[2] as () => void);
      return channelMock;
    });
    channelMock.subscribe.mockReturnValue(channelMock);

    const queryBuilder = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    queryBuilder.select.mockReturnValue(queryBuilder);
    queryBuilder.eq.mockReturnValue(queryBuilder);
    fromMock.mockReset().mockReturnValue(queryBuilder);
  });

  it("busca novamente eventos de liga ao receber mudanças e remove o canal", async () => {
    const { unmount } = renderHook(() =>
      useLeagueEvents({ monthDate: new Date("2026-05-01T12:00:00.000Z") }),
    );

    await waitFor(() => {
      expect(fetchLeagueEventsByDateRangeMock).toHaveBeenCalledTimes(1);
    });

    act(() => eventHandlers[0]!());

    await waitFor(() => {
      expect(fetchLeagueEventsByDateRangeMock).toHaveBeenCalledTimes(2);
    });

    unmount();
    expect(removeChannelMock).toHaveBeenCalledTimes(1);
    expect(removeChannelMock).toHaveBeenCalledWith(channelMock);
  });

  it("atualiza modalidades para os dois tipos de mudança realtime e remove o canal", async () => {
    const { unmount } = renderHook(() => useSports({ championshipId: "championship-1" }));

    await waitFor(() => {
      expect(fromMock).toHaveBeenCalledTimes(1);
    });
    expect(eventHandlers).toHaveLength(2);

    act(() => {
      eventHandlers[0]!();
      eventHandlers[1]!();
    });

    await waitFor(() => {
      expect(fromMock).toHaveBeenCalledTimes(3);
    });

    unmount();
    expect(removeChannelMock).toHaveBeenCalledTimes(1);
    expect(removeChannelMock).toHaveBeenCalledWith(channelMock);
  });

  it("atualiza a contagem de reservas pendentes e remove o canal", async () => {
    const { unmount } = renderHook(() => usePendingLeagueEventReservationRequests());

    await waitFor(() => {
      expect(fetchPendingLeagueEventReservationRequestCountMock).toHaveBeenCalledTimes(1);
    });

    act(() => eventHandlers[0]!());

    await waitFor(() => {
      expect(fetchPendingLeagueEventReservationRequestCountMock).toHaveBeenCalledTimes(2);
    });

    unmount();
    expect(removeChannelMock).toHaveBeenCalledTimes(1);
    expect(removeChannelMock).toHaveBeenCalledWith(channelMock);
  });
});
