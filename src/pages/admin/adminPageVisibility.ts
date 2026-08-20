import { BracketEditionStatus, ChampionshipStatus } from "@/lib/enums";

interface ResolveCanViewBracketSetupTabParams {
  championshipStatus: ChampionshipStatus;
  hasFinishedLoadingOperationalState: boolean;
  matchesCount: number;
  bracketEditionStatus: BracketEditionStatus | null;
}

interface ResolveCanViewOperationalAdminTabsParams {
  championshipStatus: ChampionshipStatus;
  hasFinishedLoadingOperationalState: boolean;
  matchesCount: number;
  bracketEditionStatus: BracketEditionStatus | null;
}

export function resolveCanViewReviewAdminTabs({
  championshipStatus,
}: ResolveCanViewOperationalAdminTabsParams): boolean {
  return championshipStatus === ChampionshipStatus.REVIEW;
}

export function resolveCanViewBracketSetupTab({
  championshipStatus,
  hasFinishedLoadingOperationalState,
  matchesCount,
  bracketEditionStatus,
}: ResolveCanViewBracketSetupTabParams): boolean {
  if (championshipStatus != ChampionshipStatus.UPCOMING) {
    return false;
  }

  if (!hasFinishedLoadingOperationalState) {
    return false;
  }

  if (matchesCount > 0) {
    return false;
  }

  return bracketEditionStatus == null || bracketEditionStatus == BracketEditionStatus.DRAFT;
}

export function resolveCanViewOperationalAdminTabs({
  championshipStatus,
}: ResolveCanViewOperationalAdminTabsParams): boolean {
  return (
    championshipStatus == ChampionshipStatus.IN_PROGRESS ||
    championshipStatus == ChampionshipStatus.FINISHED
  );
}
