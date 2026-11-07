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
    vi.restoreAllMocks();
  });

  it("anima os times disponíveis e revela o time sorteado antes de confirmar", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const onResultReady = vi.fn();
    const { getByText, getByRole, queryByRole } = render(
      <AdminBracketDrawModal
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
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

    expect(getByText("Atlética 2")).toBeTruthy();
    expect(getByText("Sorteando Atlética")).toBeTruthy();
    expect(onResultReady).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2400);
    });

    expect(getByText("Atlética 1")).toBeTruthy();
    expect(getByText("Atlética Sorteada")).toBeTruthy();
    expect(onResultReady).toHaveBeenCalledTimes(1);
    expect(queryByRole("button", { name: "Confirmar Sorteio" })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(getByRole("button", { name: "Confirmar Sorteio" })).toBeTruthy();
  });

  it("mantém o resultado e a confirmação quando o sorteio atribui a última atlética", () => {
    const onResultReady = vi.fn();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const longTeamName = "Associação Atlética Acadêmica de Joinville";
    const competitionOption = {
      key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
      sport_id: "sport-1",
      sport_name: "Futsal",
      naipe: MatchNaipe.MASCULINO,
      division: TeamDivision.DIVISAO_PRINCIPAL,
    };

    const { rerender, getByText, getByRole } = render(
      <AdminBracketDrawModal
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        drawnTeamId="team-1"
        drawingTeamIds={["team-1"]}
        teamNameById={{ "team-1": longTeamName }}
        competitionOption={competitionOption}
        groupNumber={1}
        onResultReady={onResultReady}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(2400);
    });

    rerender(
      <AdminBracketDrawModal
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        drawnTeamId="team-1"
        drawingTeamIds={[]}
        teamNameById={{ "team-1": longTeamName }}
        competitionOption={competitionOption}
        groupNumber={1}
        onResultReady={onResultReady}
      />,
    );

    const winningTeamHeading = getByRole("heading", { name: longTeamName });
    expect(winningTeamHeading).toBeTruthy();
    expect(winningTeamHeading.className).toContain("[overflow-wrap:anywhere]");
    expect(getByText("Atlética Sorteada")).toBeTruthy();
    expect(getByRole("button", { name: "Confirmar Sorteio" })).toBeTruthy();
    expect(onResultReady).toHaveBeenCalledTimes(1);
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
