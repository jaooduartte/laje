import { describe, expect, it } from "vitest";
import { BracketEditionStatus, ChampionshipStatus } from "@/lib/enums";
import { resolveCanViewBracketSetupTab } from "@/pages/admin/adminPageVisibility";

describe("resolveCanViewBracketSetupTab", () => {
  it("does not show setup while operational data is still loading", () => {
    expect(
      resolveCanViewBracketSetupTab({
        championshipStatus: ChampionshipStatus.UPCOMING,
        hasFinishedLoadingOperationalState: false,
        matchesCount: 0,
        bracketEditionStatus: null,
      }),
    ).toBe(false);
  });

  it("does not show setup when games already exist", () => {
    expect(
      resolveCanViewBracketSetupTab({
        championshipStatus: ChampionshipStatus.UPCOMING,
        hasFinishedLoadingOperationalState: true,
        matchesCount: 1,
        bracketEditionStatus: BracketEditionStatus.GROUPS_GENERATED,
      }),
    ).toBe(false);
  });

  it("does not show setup when the bracket was already generated even without loaded matches", () => {
    expect(
      resolveCanViewBracketSetupTab({
        championshipStatus: ChampionshipStatus.UPCOMING,
        hasFinishedLoadingOperationalState: true,
        matchesCount: 0,
        bracketEditionStatus: BracketEditionStatus.GROUPS_GENERATED,
      }),
    ).toBe(false);
  });

  it("shows setup only for real upcoming configuration without generated games", () => {
    expect(
      resolveCanViewBracketSetupTab({
        championshipStatus: ChampionshipStatus.UPCOMING,
        hasFinishedLoadingOperationalState: true,
        matchesCount: 0,
        bracketEditionStatus: null,
      }),
    ).toBe(true);
  });
});
