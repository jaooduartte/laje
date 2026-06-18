import { describe, expect, it } from "vitest";
import { AppRoutePath } from "@/lib/enums";
import { DEFAULT_PUBLIC_ACCESS_SETTINGS, resolveIsPublicRouteBlocked } from "@/lib/publicAccess";

describe("publicAccess", () => {
  it("bloqueia a rota de links quando a flag específica está ativa", () => {
    expect(
      resolveIsPublicRouteBlocked(
        {
          ...DEFAULT_PUBLIC_ACCESS_SETTINGS,
          is_links_page_blocked: true,
        },
        AppRoutePath.LINKS,
      ),
    ).toBe(true);
  });

  it("não bloqueia links quando apenas outra página pública está bloqueada", () => {
    expect(
      resolveIsPublicRouteBlocked(
        {
          ...DEFAULT_PUBLIC_ACCESS_SETTINGS,
          is_schedule_page_blocked: true,
        },
        AppRoutePath.LINKS,
      ),
    ).toBe(false);
  });
});
