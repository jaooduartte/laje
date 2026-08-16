import { describe, expect, it } from "vitest";
import { BracketEditionStatus, ChampionshipStatus } from "@/lib/enums";
import {
  resolveCanViewBracketSetupTab,
  resolveCanViewOperationalAdminTabs,
  resolveCanViewReviewAdminTabs,
} from "@/pages/admin/adminPageVisibility";

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

describe("resolveCanViewReviewAdminTabs", () => {
  it("shows only the review operational surface when games were generated", () => {
    expect(
      resolveCanViewReviewAdminTabs({
        championshipStatus: ChampionshipStatus.REVIEW,
        hasFinishedLoadingOperationalState: true,
        matchesCount: 2,
        bracketEditionStatus: BracketEditionStatus.GROUPS_GENERATED,
      }),
    ).toBe(true);
  });

  it("does not treat review as a live operational state", () => {
    expect(
      resolveCanViewOperationalAdminTabs({
        championshipStatus: ChampionshipStatus.REVIEW,
        hasFinishedLoadingOperationalState: true,
        matchesCount: 2,
        bracketEditionStatus: BracketEditionStatus.GROUPS_GENERATED,
      }),
    ).toBe(false);
  });
});

describe("resolveCanViewOperationalAdminTabs", () => {
  it("does not show operational tabs while operational data is still loading", () => {
    expect(
      resolveCanViewOperationalAdminTabs({
        championshipStatus: ChampionshipStatus.IN_PROGRESS,
        hasFinishedLoadingOperationalState: false,
        matchesCount: 2,
        bracketEditionStatus: BracketEditionStatus.GROUPS_GENERATED,
      }),
    ).toBe(false);
  });

  it("does not show operational tabs for upcoming championships even if games already exist", () => {
    expect(
      resolveCanViewOperationalAdminTabs({
        championshipStatus: ChampionshipStatus.UPCOMING,
        hasFinishedLoadingOperationalState: true,
        matchesCount: 2,
        bracketEditionStatus: BracketEditionStatus.GROUPS_GENERATED,
      }),
    ).toBe(false);
  });

  it("does not show operational tabs without generated games", () => {
    expect(
      resolveCanViewOperationalAdminTabs({
        championshipStatus: ChampionshipStatus.IN_PROGRESS,
        hasFinishedLoadingOperationalState: true,
        matchesCount: 0,
        bracketEditionStatus: BracketEditionStatus.GROUPS_GENERATED,
      }),
    ).toBe(false);
  });

  it("does not show operational tabs while the bracket edition is still a draft", () => {
    expect(
      resolveCanViewOperationalAdminTabs({
        championshipStatus: ChampionshipStatus.IN_PROGRESS,
        hasFinishedLoadingOperationalState: true,
        matchesCount: 2,
        bracketEditionStatus: BracketEditionStatus.DRAFT,
      }),
    ).toBe(false);
  });

  it("shows operational tabs only when the championship is operational and games were generated", () => {
    expect(
      resolveCanViewOperationalAdminTabs({
        championshipStatus: ChampionshipStatus.IN_PROGRESS,
        hasFinishedLoadingOperationalState: true,
        matchesCount: 2,
        bracketEditionStatus: BracketEditionStatus.GROUPS_GENERATED,
      }),
    ).toBe(true);

    expect(
      resolveCanViewOperationalAdminTabs({
        championshipStatus: ChampionshipStatus.FINISHED,
        hasFinishedLoadingOperationalState: true,
        matchesCount: 2,
        bracketEditionStatus: BracketEditionStatus.GROUPS_GENERATED,
      }),
    ).toBe(true);
  });
});
