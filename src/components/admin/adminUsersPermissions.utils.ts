import { AdminPanelPermissionLevel, AdminPanelTab } from "@/lib/enums";
import type { AdminTabPermissionByTab } from "@/lib/types";

function resolveDefaultPermissions(): AdminTabPermissionByTab {
  return {
    [AdminPanelTab.BRACKET_SETUP]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.MATCHES]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.CONTROL]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.INDIVIDUAL_EVENTS]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.TEAMS]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.SPORTS]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.EVENTS]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.LINKS]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.LOGS]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.USERS]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.ACCOUNT]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.STANDINGS]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.CHAMPIONSHIP_STATUS]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.SETTINGS]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.SCORE_SHEET_REVIEW]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.TIE_BREAKS]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.CHAMPIONSHIP_SCHEDULE]: AdminPanelPermissionLevel.NONE,
  };
}

function isAdminPanelPermissionLevel(
  value: string,
): value is AdminPanelPermissionLevel {
  return (
    value == AdminPanelPermissionLevel.NONE ||
    value == AdminPanelPermissionLevel.VIEW ||
    value == AdminPanelPermissionLevel.EDIT
  );
}

export function resolveNormalizedPermissions(
  rawPermissions: Record<string, unknown> | null,
): AdminTabPermissionByTab {
  const nextPermissions = resolveDefaultPermissions();
  const rawMatchesPermission =
    typeof rawPermissions?.[AdminPanelTab.MATCHES] == "string" &&
    isAdminPanelPermissionLevel(rawPermissions[AdminPanelTab.MATCHES] as string)
      ? (rawPermissions[AdminPanelTab.MATCHES] as AdminPanelPermissionLevel)
      : AdminPanelPermissionLevel.NONE;

  Object.values(AdminPanelTab).forEach((adminPanelTab) => {
    const permissionValue = rawPermissions?.[adminPanelTab];

    if (
      typeof permissionValue == "string" &&
      isAdminPanelPermissionLevel(permissionValue)
    ) {
      nextPermissions[adminPanelTab] = permissionValue;
      return;
    }

    if (
      adminPanelTab == AdminPanelTab.BRACKET_SETUP ||
      adminPanelTab == AdminPanelTab.INDIVIDUAL_EVENTS ||
      adminPanelTab == AdminPanelTab.STANDINGS ||
      adminPanelTab == AdminPanelTab.CHAMPIONSHIP_SCHEDULE
    ) {
      nextPermissions[adminPanelTab] = rawMatchesPermission;
    }
  });

  return nextPermissions;
}

export { resolveDefaultPermissions };
