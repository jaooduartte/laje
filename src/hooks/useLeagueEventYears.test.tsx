import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLeagueEventYears } from "@/hooks/useLeagueEventYears";
import { LeagueEventReservationRequestStatus } from "@/lib/enums";

const eventsSelectMock = vi.fn();
const reservationRequestsSelectMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table == "league_events") {
        return { select: eventsSelectMock };
      }

      if (table == "league_event_reservation_requests") {
        return { select: reservationRequestsSelectMock };
      }

      throw new Error(`Tabela não mockada: ${table}`);
    },
  },
}));

function HookProbe() {
  const { years, loading } = useLeagueEventYears();

  return (
    <div>
      <div data-testid="loading-state">{loading ? "loading" : "loaded"}</div>
      <div data-testid="event-years">{years.join(",")}</div>
    </div>
  );
}

describe("useLeagueEventYears", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lista anos com eventos, solicitações de reserva pendentes e o ano atual", async () => {
    eventsSelectMock.mockResolvedValue({
      data: [{ event_date: "2026-08-12" }],
      error: null,
    });
    reservationRequestsSelectMock.mockResolvedValue({
      data: [
        {
          event_date: "2024-02-10",
          status: LeagueEventReservationRequestStatus.PENDING,
        },
        {
          event_date: "2025-04-18",
          status: LeagueEventReservationRequestStatus.REJECTED,
        },
        {
          event_date: "2026-04-18",
          status: LeagueEventReservationRequestStatus.APPROVED,
        },
      ],
      error: null,
    });

    render(<HookProbe />);

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("loaded");
    });

    expect(screen.getByTestId("event-years")).toHaveTextContent("2026,2024");
    expect(screen.getByTestId("event-years")).not.toHaveTextContent("2025");
  });

  it("inclui o ano atual quando não existem dados", async () => {
    eventsSelectMock.mockResolvedValue({ data: [], error: null });
    reservationRequestsSelectMock.mockResolvedValue({ data: [], error: null });

    render(<HookProbe />);

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("loaded");
    });

    expect(screen.getByTestId("event-years")).toHaveTextContent(
      String(new Date().getFullYear()),
    );
  });

  it("mantém o ano atual disponível quando o carregamento falha", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    eventsSelectMock.mockRejectedValue(new Error("Falha ao carregar eventos"));
    reservationRequestsSelectMock.mockResolvedValue({ data: [], error: null });

    render(<HookProbe />);

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("loaded");
    });

    expect(screen.getByTestId("event-years")).toHaveTextContent(
      String(new Date().getFullYear()),
    );
    consoleErrorSpy.mockRestore();
  });
});
