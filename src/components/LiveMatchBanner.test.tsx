import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiveMatchBanner } from "@/components/LiveMatchBanner";
import { MatchNaipe, MatchStatus } from "@/lib/enums";
import type { Match } from "@/lib/types";

function buildLiveMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "live-futsal-match",
    sports: { id: "futsal", name: "Futsal", code: "FUTSAL" },
    status: MatchStatus.LIVE,
    naipe: MatchNaipe.FEMININO,
    location: "Campus Park",
    home_team: { id: "home-team", name: "Água", city: "Joinville" },
    away_team: { id: "away-team", name: "AAAMU", city: "Joinville" },
    home_score: 3,
    away_score: 3,
    home_penalty_score: 4,
    away_penalty_score: 3,
    home_red_cards: 0,
    away_red_cards: 0,
    result_rule: null,
    start_time: "2026-09-07T18:30:00-03:00",
    ...overrides,
  } as Match;
}

describe("LiveMatchBanner", () => {
  it("shows the live penalty shootout result below the regular score", () => {
    render(<LiveMatchBanner matches={[buildLiveMatch()]} />);

    expect(screen.getByLabelText("Placar dos pênaltis: 4 × 3")).toBeInTheDocument();
    expect(screen.getByText("Pênaltis")).toBeInTheDocument();
  });

  it("shows the initial penalty score as soon as the shootout is enabled", () => {
    render(
      <LiveMatchBanner
        matches={[
          buildLiveMatch({ home_penalty_score: 0, away_penalty_score: 0 }),
        ]}
      />,
    );

    expect(screen.getByLabelText("Placar dos pênaltis: 0 × 0")).toBeInTheDocument();
  });

  it("does not show a penalty score without both live values", () => {
    render(
      <LiveMatchBanner
        matches={[buildLiveMatch({ away_penalty_score: null })]}
      />,
    );

    expect(screen.queryByText("Pênaltis")).not.toBeInTheDocument();
  });
});
