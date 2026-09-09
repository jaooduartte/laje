import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMatches } from "@/hooks/useMatches";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

describe("useMatches", () => {
  it("não permanece carregando ao desabilitar a consulta", async () => {
    const { result, rerender } = renderHook(
      ({ championshipId, enabled }: { championshipId: string | null; enabled: boolean }) =>
        useMatches({
          championshipId,
          enabled,
          includeRealtime: false,
        }),
      {
        initialProps: {
          championshipId: null,
          enabled: true,
        },
      },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    rerender({
      championshipId: "championship-1",
      enabled: false,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});
