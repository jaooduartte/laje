import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAwsRealtimePolling } from "@/hooks/useAwsRealtimePolling";

const state = vi.hoisted(() => ({ isAws: true }));
vi.mock("@/config/environment", () => ({
  isAwsBackendEnabled: () => state.isAws,
}));

describe("useAwsRealtimePolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.isAws = true;
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shares a scheduler and enforces the 15 second minimum", async () => {
    const refresh = vi.fn();
    const { unmount } = renderHook(() =>
      useAwsRealtimePolling({ enabled: true, intervalMs: 2_000, onRefresh: refresh }),
    );

    await act(async () => vi.advanceTimersByTimeAsync(14_999));
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not call endpoints while the document is hidden or offline", async () => {
    const refresh = vi.fn();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    const network = vi.spyOn(navigator, "onLine", "get");
    const { unmount } = renderHook(() =>
      useAwsRealtimePolling({ enabled: true, intervalMs: 15_000, onRefresh: refresh }),
    );

    visibility.mockReturnValue("hidden");
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(refresh).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    network.mockReturnValue(false);
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(refresh).not.toHaveBeenCalled();

    network.mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("avoids overlapping requests and coalesces focus events", async () => {
    let release: (() => void) | undefined;
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const { unmount } = renderHook(() =>
      useAwsRealtimePolling({ enabled: true, intervalMs: 15_000, onRefresh: refresh }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => release?.());
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(refresh).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("remains inactive on the Supabase backend and when disabled", async () => {
    state.isAws = false;
    const first = vi.fn();
    const { unmount } = renderHook(() =>
      useAwsRealtimePolling({ enabled: true, intervalMs: 15_000, onRefresh: first }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    expect(first).not.toHaveBeenCalled();
    unmount();
    state.isAws = true;
    const second = vi.fn();
    const other = renderHook(() =>
      useAwsRealtimePolling({ enabled: false, intervalMs: 15_000, onRefresh: second }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    expect(second).not.toHaveBeenCalled();
    other.unmount();
  });
});
