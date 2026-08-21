import { describe, expect, it } from "vitest";
import { shouldRenderIndividualSessions } from "@/components/admin/adminMatchesPagination.utils";

describe("shouldRenderIndividualSessions", () => {
  it("exibe sessões somente na última página da listagem coletiva", () => {
    expect(
      shouldRenderIndividualSessions({
        collectiveMatchesCount: 30,
        currentPage: 1,
        totalPages: 2,
      }),
    ).toBe(false);
    expect(
      shouldRenderIndividualSessions({
        collectiveMatchesCount: 30,
        currentPage: 2,
        totalPages: 2,
      }),
    ).toBe(true);
  });

  it("exibe sessões quando o filtro não retorna jogos coletivos", () => {
    expect(
      shouldRenderIndividualSessions({
        collectiveMatchesCount: 0,
        currentPage: 1,
        totalPages: 1,
      }),
    ).toBe(true);
  });
});
