import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePendingScoreSheetReviewCount } from "@/hooks/usePendingScoreSheetReviewCount";
import { MatchStatus } from "@/lib/enums";

const {
  selectMock,
  countQueryMock,
  countResponses,
  channelCallbacks,
  channelMock,
  removeChannelMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  countQueryMock: {
    eq: vi.fn(),
    or: vi.fn(),
  },
  countResponses: [] as Array<{ count: number | null; error: { message: string } | null }>,
  channelCallbacks: [] as Array<() => void>,
  channelMock: {
    on: vi.fn(),
    subscribe: vi.fn(),
  },
  removeChannelMock: vi.fn(),
}));

countQueryMock.eq.mockImplementation(() => countQueryMock);
countQueryMock.or.mockImplementation(() =>
  Promise.resolve(countResponses.shift() ?? { count: 0, error: null }),
);
channelMock.on.mockImplementation(
  (
    _event: string,
    _config: Record<string, unknown>,
    callback: () => void,
  ) => {
    channelCallbacks.push(callback);
    return channelMock;
  },
);
channelMock.subscribe.mockImplementation(() => channelMock);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({ select: selectMock })),
    channel: vi.fn(() => channelMock),
    removeChannel: removeChannelMock,
  },
}));

describe("usePendingScoreSheetReviewCount", () => {
  beforeEach(() => {
    selectMock.mockReset();
    selectMock.mockReturnValue(countQueryMock);
    countQueryMock.eq.mockClear();
    countQueryMock.or.mockClear();
    channelMock.on.mockClear();
    channelMock.subscribe.mockClear();
    removeChannelMock.mockClear();
    countResponses.length = 0;
    channelCallbacks.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("carrega e atualiza o total sem depender da abertura da aba de conferência", async () => {
    countResponses.push(
      { count: 3, error: null },
      { count: 2, error: null },
    );

    const { result, unmount } = renderHook(() =>
      usePendingScoreSheetReviewCount({
        championshipId: "championship-1",
        seasonYear: 2026,
      }),
    );

    await waitFor(() => {
      expect(result.current.count).toBe(3);
    });

    expect(selectMock).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(countQueryMock.eq).toHaveBeenNthCalledWith(1, "championship_id", "championship-1");
    expect(countQueryMock.eq).toHaveBeenNthCalledWith(2, "season_year", 2026);
    expect(countQueryMock.eq).toHaveBeenNthCalledWith(3, "status", MatchStatus.FINISHED);
    expect(countQueryMock.or).toHaveBeenCalledWith(
      "is_score_sheet_reviewed.eq.false,is_score_sheet_reviewed.is.null",
    );

    await act(async () => {
      channelCallbacks[0]?.();
    });

    await waitFor(() => {
      expect(result.current.count).toBe(2);
    });

    unmount();
    expect(removeChannelMock).toHaveBeenCalledWith(channelMock);
  });
});
