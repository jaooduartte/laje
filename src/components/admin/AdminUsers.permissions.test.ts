import { describe, expect, it } from "vitest";
import { resolveNormalizedPermissions } from "@/components/admin/adminUsersPermissions.utils";
import { AdminPanelPermissionLevel, AdminPanelTab } from "@/lib/enums";

describe("resolveNormalizedPermissions", () => {
  it("herda a permissão de Jogos para abas operacionais ainda ausentes no perfil", () => {
    const permissions = resolveNormalizedPermissions({
      [AdminPanelTab.MATCHES]: AdminPanelPermissionLevel.EDIT,
    });

    expect(permissions[AdminPanelTab.BRACKET_SETUP]).toBe(
      AdminPanelPermissionLevel.EDIT,
    );
    expect(permissions[AdminPanelTab.INDIVIDUAL_EVENTS]).toBe(
      AdminPanelPermissionLevel.EDIT,
    );
  });

  it("preserva uma permissão explícita mesmo quando Jogos possui outro nível", () => {
    const permissions = resolveNormalizedPermissions({
      [AdminPanelTab.MATCHES]: AdminPanelPermissionLevel.EDIT,
      [AdminPanelTab.BRACKET_SETUP]: AdminPanelPermissionLevel.VIEW,
    });

    expect(permissions[AdminPanelTab.BRACKET_SETUP]).toBe(
      AdminPanelPermissionLevel.VIEW,
    );
  });
});
