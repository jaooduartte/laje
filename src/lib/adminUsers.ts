import { AdminUserPasswordStatus, AppBadgeTone } from "@/lib/enums";

export const ADMIN_USER_PASSWORD_STATUS_LABELS: Record<AdminUserPasswordStatus, string> = {
  [AdminUserPasswordStatus.PENDING]: "Pendente",
  [AdminUserPasswordStatus.ACTIVE]: "Ativo",
};

export const ADMIN_USER_PASSWORD_STATUS_BADGE_TONES: Record<AdminUserPasswordStatus, AppBadgeTone> = {
  [AdminUserPasswordStatus.PENDING]: AppBadgeTone.AMBER,
  [AdminUserPasswordStatus.ACTIVE]: AppBadgeTone.EMERALD,
};

export function isAdminUserPasswordStatus(value: string | null): value is AdminUserPasswordStatus {
  return value == AdminUserPasswordStatus.PENDING || value == AdminUserPasswordStatus.ACTIVE;
}

export function resolveAdminUserPasswordStatusLabel(status: AdminUserPasswordStatus): string {
  return ADMIN_USER_PASSWORD_STATUS_LABELS[status];
}

export function resolveAdminUserPasswordStatusBadgeTone(status: AdminUserPasswordStatus): AppBadgeTone {
  return ADMIN_USER_PASSWORD_STATUS_BADGE_TONES[status];
}

export function resolveShouldDisplayInternalAdminUserEmail(email: string | null, loginIdentifier: string): boolean {
  if (!email || email == loginIdentifier) {
    return false;
  }

  return !email.endsWith("@admin.laje.local") && !email.endsWith("@ligadasatleticas.com");
}
