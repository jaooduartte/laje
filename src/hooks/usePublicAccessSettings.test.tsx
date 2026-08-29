import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePublicAccessSettings } from "@/hooks/usePublicAccessSettings";

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: rpcMock,
  },
}));

describe("usePublicAccessSettings", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("compartilha uma única consulta entre consumidores simultâneos", async () => {
    rpcMock.mockResolvedValue({
      data: {
        is_public_access_blocked: false,
        is_live_page_blocked: false,
        is_championships_page_blocked: false,
        is_schedule_page_blocked: false,
        is_league_calendar_page_blocked: false,
        is_links_page_blocked: false,
        blocked_message: null,
        announcement_message: null,
      },
      error: null,
    });

    const firstHook = renderHook(() => usePublicAccessSettings());
    const secondHook = renderHook(() => usePublicAccessSettings());

    await waitFor(() => {
      expect(firstHook.result.current.loading).toBe(false);
      expect(secondHook.result.current.loading).toBe(false);
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("get_public_access_settings");

    firstHook.unmount();
    secondHook.unmount();

    const nextHook = renderHook(() => usePublicAccessSettings());

    await waitFor(() => {
      expect(nextHook.result.current.loading).toBe(false);
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    nextHook.unmount();
  });
});
