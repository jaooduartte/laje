import { AdminPanelPermissionLevel, AdminPanelTab } from "@/lib/enums";

const ADMIN_PANEL_TAB_LABELS: Record<AdminPanelTab, string> = {
  [AdminPanelTab.BRACKET_SETUP]: "Configurar Campeonato",
  [AdminPanelTab.MATCHES]: "Jogos",
  [AdminPanelTab.CONTROL]: "Controle ao Vivo",
  [AdminPanelTab.INDIVIDUAL_EVENTS]: "Provas Individuais",
  [AdminPanelTab.TEAMS]: "Atléticas",
  [AdminPanelTab.SPORTS]: "Modalidades",
  [AdminPanelTab.EVENTS]: "Eventos da Liga",
  [AdminPanelTab.LINKS]: "Links",
  [AdminPanelTab.LOGS]: "Logs",
  [AdminPanelTab.USERS]: "Usuários",
  [AdminPanelTab.ACCOUNT]: "Minha conta",
  [AdminPanelTab.STANDINGS]: "Classificação",
  [AdminPanelTab.CHAMPIONSHIP_STATUS]: "Status do campeonato",
  [AdminPanelTab.SETTINGS]: "Configurações",
  [AdminPanelTab.SCORE_SHEET_REVIEW]: "Conferência de Súmula",
  [AdminPanelTab.TIE_BREAKS]: "Sorteios",
  [AdminPanelTab.CHAMPIONSHIP_SCHEDULE]: "Agenda",
  [AdminPanelTab.OPENING_CEREMONY_BONUS]: "Bônus da abertura",
};

const ADMIN_PERMISSION_LEVEL_LABELS: Record<
  AdminPanelPermissionLevel,
  string
> = {
  [AdminPanelPermissionLevel.NONE]: "Sem acesso",
  [AdminPanelPermissionLevel.VIEW]: "Visualização",
  [AdminPanelPermissionLevel.EDIT]: "Visualização e edição",
};

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value == "object" && value != null && !Array.isArray(value);
}

function resolvePermissionLevel(
  value: unknown,
): AdminPanelPermissionLevel {
  if (
    value == AdminPanelPermissionLevel.VIEW ||
    value == AdminPanelPermissionLevel.EDIT
  ) {
    return value;
  }

  return AdminPanelPermissionLevel.NONE;
}

function resolvePermissionChanges(
  previousPermissions: Record<string, unknown> | null,
  nextPermissions: Record<string, unknown>,
): string[] {
  if (!previousPermissions) {
    const configuredPermissions = Object.values(AdminPanelTab)
      .filter(
        (adminPanelTab) =>
          resolvePermissionLevel(nextPermissions[adminPanelTab]) !=
          AdminPanelPermissionLevel.NONE,
      )
      .map(
        (adminPanelTab) =>
          `Permissão de ${ADMIN_PANEL_TAB_LABELS[adminPanelTab]}: ${ADMIN_PERMISSION_LEVEL_LABELS[resolvePermissionLevel(nextPermissions[adminPanelTab])]}`,
      );

    return configuredPermissions.length > 0
      ? configuredPermissions
      : ["Permissões configuradas: nenhum acesso liberado."];
  }

  return Object.values(AdminPanelTab)
    .filter(
      (adminPanelTab) =>
        resolvePermissionLevel(previousPermissions[adminPanelTab]) !=
        resolvePermissionLevel(nextPermissions[adminPanelTab]),
    )
    .map((adminPanelTab) => {
      const previousPermission = resolvePermissionLevel(
        previousPermissions[adminPanelTab],
      );
      const nextPermission = resolvePermissionLevel(nextPermissions[adminPanelTab]);

      return `Permissão de ${ADMIN_PANEL_TAB_LABELS[adminPanelTab]}: ${ADMIN_PERMISSION_LEVEL_LABELS[previousPermission]} para ${ADMIN_PERMISSION_LEVEL_LABELS[nextPermission]}`;
    });
}

export function resolveAdminProfileLogChanges(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
): string[] {
  const previousProfileName =
    typeof oldData?.profile_name == "string" ? oldData.profile_name : null;
  const nextProfileName =
    typeof newData?.profile_name == "string" ? newData.profile_name : null;
  const previousPermissions = isRecordValue(oldData?.permissions)
    ? oldData.permissions
    : null;
  const nextPermissions = isRecordValue(newData?.permissions)
    ? newData.permissions
    : null;
  const changes: string[] = [];

  if (
    previousProfileName &&
    nextProfileName &&
    previousProfileName != nextProfileName
  ) {
    changes.push(`Nome do perfil: ${previousProfileName} para ${nextProfileName}`);
  }

  if (nextPermissions) {
    changes.push(...resolvePermissionChanges(previousPermissions, nextPermissions));
  }

  return changes;
}
