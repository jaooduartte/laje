import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminBracketDrawModal } from "@/components/admin/AdminBracketDrawModal";
import { MatchNaipe, TeamDivision } from "@/lib/enums";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { open: boolean; children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe("AdminBracketDrawModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("notifica o resultado uma única vez mesmo após rerender com novos times disponíveis", () => {
    const onResultReady = vi.fn();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <AdminBracketDrawModal
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        drawnTeamId="team-1"
        drawingTeamIds={["team-1", "team-2"]}
        teamNameById={{ "team-1": "Atlética 1", "team-2": "Atlética 2" }}
        competitionOption={{
          key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
          sport_id: "sport-1",
          sport_name: "Futsal",
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
        }}
        groupNumber={1}
        onResultReady={onResultReady}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(onResultReady).toHaveBeenCalledTimes(1);

    rerender(
      <AdminBracketDrawModal
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        drawnTeamId="team-1"
        drawingTeamIds={["team-2"]}
        teamNameById={{ "team-1": "Atlética 1", "team-2": "Atlética 2" }}
        competitionOption={{
          key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
          sport_id: "sport-1",
          sport_name: "Futsal",
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
        }}
        groupNumber={1}
        onResultReady={onResultReady}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(onResultReady).toHaveBeenCalledTimes(1);
  });
});
