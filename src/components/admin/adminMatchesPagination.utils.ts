interface ShouldRenderIndividualSessionsOptions {
  collectiveMatchesCount: number;
  currentPage: number;
  totalPages: number;
}

export function shouldRenderIndividualSessions({
  collectiveMatchesCount,
  currentPage,
  totalPages,
}: ShouldRenderIndividualSessionsOptions): boolean {
  return collectiveMatchesCount == 0 || currentPage == totalPages;
}
