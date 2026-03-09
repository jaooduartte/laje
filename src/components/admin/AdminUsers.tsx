import type { CheckedState } from "@radix-ui/react-checkbox";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, PencilLine, Plus, RotateCcw, Save, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOnlineVisitorsProviderContext } from "@/components/online-visitors/OnlineVisitorsProvider";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AppBadgeTone,
  AdminPanelPermissionLevel,
  AdminPanelTab,
  AdminUserPasswordStatus,
  AdminUserSortOption,
} from "@/lib/enums";
import type { AdminProfile, AdminTabPermissionByTab, AdminUser } from "@/lib/types";
import {
  resolveAdminUserPasswordStatusBadgeTone,
  resolveAdminUserPasswordStatusLabel,
  resolveShouldDisplayInternalAdminUserEmail,
} from "@/lib/adminUsers";
import {
  AdminCreateUserDTO,
  AdminUserDTO,
  AdminUserLoginIdentifierSaveDTO,
  AdminUserNameSaveDTO,
  AdminUserPasswordSaveDTO,
} from "@/domain/admin-users/AdminUserDTO";
import { AppBadge } from "@/components/ui/app-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL_PROFILES_FILTER = "ALL_PROFILES";
const DEFAULT_PROFILE_NAME = "Novo perfil";
const ADMIN_SYSTEM_PROFILE_NAME = "admin";

const ADMIN_TAB_LABELS: Record<AdminPanelTab, string> = {
  [AdminPanelTab.MATCHES]: "Jogos",
  [AdminPanelTab.CONTROL]: "Controle ao Vivo",
  [AdminPanelTab.TEAMS]: "Atléticas",
  [AdminPanelTab.SPORTS]: "Modalidades",
  [AdminPanelTab.EVENTS]: "Eventos da Liga",
  [AdminPanelTab.LOGS]: "Logs",
  [AdminPanelTab.USERS]: "Usuários",
  [AdminPanelTab.ACCOUNT]: "Minha conta",
  [AdminPanelTab.SETTINGS]: "Configurações",
};

const ADMIN_PERMISSION_LEVEL_LABELS: Record<AdminPanelPermissionLevel, string> = {
  [AdminPanelPermissionLevel.NONE]: "Sem acesso",
  [AdminPanelPermissionLevel.VIEW]: "Visualização",
  [AdminPanelPermissionLevel.EDIT]: "Visualização e edição",
};

const ADMIN_PANEL_TAB_ORDER: AdminPanelTab[] = [
  AdminPanelTab.MATCHES,
  AdminPanelTab.CONTROL,
  AdminPanelTab.TEAMS,
  AdminPanelTab.SPORTS,
  AdminPanelTab.EVENTS,
  AdminPanelTab.LOGS,
  AdminPanelTab.USERS,
  AdminPanelTab.ACCOUNT,
  AdminPanelTab.SETTINGS,
];

const ADMIN_PANEL_PERMISSION_LEVEL_SORT_WEIGHTS: Record<AdminPanelPermissionLevel, number> = {
  [AdminPanelPermissionLevel.NONE]: 0,
  [AdminPanelPermissionLevel.VIEW]: 1,
  [AdminPanelPermissionLevel.EDIT]: 2,
};

const ADMIN_USER_SORT_OPTION_LABELS: Record<AdminUserSortOption, string> = {
  [AdminUserSortOption.NAME_ASC]: "Nome",
  [AdminUserSortOption.LAST_ACCESS_DESC]: "Último acesso",
  [AdminUserSortOption.ONLINE_DESC]: "Online",
  [AdminUserSortOption.ACTIVE_STATUS_DESC]: "Ativo",
  [AdminUserSortOption.PROFILE_ASC]: "Perfil",
};

const ADMIN_USER_SORT_OPTION_ORDER: AdminUserSortOption[] = [
  AdminUserSortOption.NAME_ASC,
  AdminUserSortOption.LAST_ACCESS_DESC,
  AdminUserSortOption.ONLINE_DESC,
  AdminUserSortOption.ACTIVE_STATUS_DESC,
  AdminUserSortOption.PROFILE_ASC,
];

const ADMIN_USER_PROFILE_SORT_WEIGHTS: Record<string, number> = {
  admin: 0,
  presidencia: 1,
  "vice presidencia": 2,
  vicepresidencia: 2,
  "vice presidente": 2,
  vice: 2,
  tesoureiro: 3,
  tesouraria: 3,
  secretaria: 4,
  esportes: 5,
  eventos: 6,
  comunicacao: 7,
};

interface Props {
  canManageUsers?: boolean;
}

interface UserAccessSelection {
  profileId: string;
}

interface ProfileDraft {
  profileId: string | null;
  profileName: string;
  permissions: AdminTabPermissionByTab;
}

interface PendingUsersActionConfirmation {
  action: "RESET" | "DELETE";
  targetUserIds: string[];
}

function isAdminPanelPermissionLevel(value: string | null): value is AdminPanelPermissionLevel {
  return (
    value == AdminPanelPermissionLevel.NONE ||
    value == AdminPanelPermissionLevel.VIEW ||
    value == AdminPanelPermissionLevel.EDIT
  );
}

function isAdminUserSortOption(value: string): value is AdminUserSortOption {
  return (
    value == AdminUserSortOption.NAME_ASC ||
    value == AdminUserSortOption.LAST_ACCESS_DESC ||
    value == AdminUserSortOption.ONLINE_DESC ||
    value == AdminUserSortOption.ACTIVE_STATUS_DESC ||
    value == AdminUserSortOption.PROFILE_ASC
  );
}

function resolveDefaultPermissions(): AdminTabPermissionByTab {
  return {
    [AdminPanelTab.MATCHES]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.CONTROL]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.TEAMS]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.SPORTS]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.EVENTS]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.LOGS]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.USERS]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.ACCOUNT]: AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.SETTINGS]: AdminPanelPermissionLevel.NONE,
  };
}

function resolveNormalizedPermissions(rawPermissions: Record<string, unknown> | null): AdminTabPermissionByTab {
  const nextPermissions = resolveDefaultPermissions();

  ADMIN_PANEL_TAB_ORDER.forEach((adminPanelTab) => {
    const permissionValue = rawPermissions?.[adminPanelTab];

    if (typeof permissionValue == "string" && isAdminPanelPermissionLevel(permissionValue)) {
      nextPermissions[adminPanelTab] = permissionValue;
    }
  });

  return nextPermissions;
}

function resolveProfileAccessValue(profileId: string): string {
  return profileId;
}

function resolveUserAccessValue(user: AdminUser): string {
  if (user.profile_id) {
    return resolveProfileAccessValue(user.profile_id);
  }

  return "";
}

function resolveUserAccessSelection(accessValue: string): UserAccessSelection | null {
  const profileId = accessValue.trim();

  if (profileId.length > 0) {
    return {
      profileId,
    };
  }

  return null;
}

function resolveProfileDraftFromProfile(profile: AdminProfile): ProfileDraft {
  return {
    profileId: profile.profile_id,
    profileName: profile.profile_name,
    permissions: profile.permissions,
  };
}

function resolveEmptyProfileDraft(): ProfileDraft {
  return {
    profileId: null,
    profileName: DEFAULT_PROFILE_NAME,
    permissions: resolveDefaultPermissions(),
  };
}

function resolveIsProtectedAdminProfile(profile: AdminProfile | null): boolean {
  if (!profile) {
    return false;
  }

  return profile.is_system && profile.profile_name.trim().toLowerCase() == ADMIN_SYSTEM_PROFILE_NAME;
}

function resolveIsCheckboxChecked(checked: CheckedState): boolean {
  return checked == true;
}

function resolveAdminProfilePermissionsSortScore(permissions: AdminTabPermissionByTab): number {
  return ADMIN_PANEL_TAB_ORDER.reduce((permissionsSortScore, adminPanelTab) => {
    return permissionsSortScore + ADMIN_PANEL_PERMISSION_LEVEL_SORT_WEIGHTS[permissions[adminPanelTab]];
  }, 0);
}

function resolveAdminUserNameSortValue(user: AdminUser): string {
  return user.name.trim().toLowerCase();
}

function resolveAdminUserLastAccessSortValue(user: AdminUser, isUserOnline: boolean, currentTimestamp: number): number {
  if (isUserOnline) {
    return currentTimestamp;
  }

  if (!user.last_sign_in_at) {
    return 0;
  }

  return new Date(user.last_sign_in_at).getTime();
}

function resolveAdminUserLastAccessDate(user: AdminUser, isUserOnline: boolean): Date | null {
  if (isUserOnline) {
    return new Date();
  }

  if (!user.last_sign_in_at) {
    return null;
  }

  return new Date(user.last_sign_in_at);
}

function resolveAdminUserOnlineSortValue(isUserOnline: boolean): number {
  return isUserOnline ? 1 : 0;
}

function resolveAdminUserActiveStatusSortValue(status: AdminUserPasswordStatus): number {
  return status == AdminUserPasswordStatus.ACTIVE ? 1 : 0;
}

function resolveNormalizedAdminUserProfileLabel(profileLabel: string | null): string {
  return (profileLabel ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function resolveAdminUserProfileSortWeight(user: AdminUser): number {
  const normalizedProfileLabel = resolveNormalizedAdminUserProfileLabel(user.profile_name);

  if (normalizedProfileLabel in ADMIN_USER_PROFILE_SORT_WEIGHTS) {
    return ADMIN_USER_PROFILE_SORT_WEIGHTS[normalizedProfileLabel];
  }

  return Number.MAX_SAFE_INTEGER;
}

function resolveAdminUserProfileSortLabel(user: AdminUser): string {
  return resolveNormalizedAdminUserProfileLabel(user.profile_name);
}

export function AdminUsers({ canManageUsers = true }: Props) {
  const { user: currentUser } = useAuth();
  const { siteTotalOnlineUserIds } = useOnlineVisitorsProviderContext();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessFilter, setAccessFilter] = useState(ALL_PROFILES_FILTER);
  const [sortOption, setSortOption] = useState<AdminUserSortOption | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});
  const [accessValueByUserId, setAccessValueByUserId] = useState<Record<string, string>>({});
  const [loginIdentifierByUserId, setLoginIdentifierByUserId] = useState<Record<string, string>>({});
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [savingEditedUserId, setSavingEditedUserId] = useState<string | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [bulkProcessingAction, setBulkProcessingAction] = useState<"RESET" | "DELETE" | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(resolveEmptyProfileDraft());
  const [savingProfile, setSavingProfile] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserLoginIdentifier, setNewUserLoginIdentifier] = useState("");
  const [newUserAccessValue, setNewUserAccessValue] = useState("");
  const [newPasswordByUserId, setNewPasswordByUserId] = useState<Record<string, string>>({});
  const [pendingUsersActionConfirmation, setPendingUsersActionConfirmation] =
    useState<PendingUsersActionConfirmation | null>(null);

  const profileAccessOptions = useMemo(() => {
    return profiles.map((profile) => ({
      value: resolveProfileAccessValue(profile.profile_id),
      label: profile.profile_name,
    }));
  }, [profiles]);

  const accessOptions = useMemo(() => {
    return [...profileAccessOptions];
  }, [profileAccessOptions]);

  const fetchAdminData = useCallback(async () => {
    setLoading(true);

    const [usersResponse, profilesResponse] = await Promise.all([
      supabase.rpc("list_admin_users"),
      supabase.rpc("list_admin_profiles"),
    ]);

    if (usersResponse.error) {
      toast.error(usersResponse.error.message);
      setUsers([]);
      setLoading(false);
      return;
    }

    if (profilesResponse.error) {
      toast.error(profilesResponse.error.message);
      setProfiles([]);
      setLoading(false);
      return;
    }

    const normalizedUsers = (usersResponse.data ?? []).map((adminUserRow) =>
      AdminUserDTO.fromResponse(adminUserRow).bindToRead(),
    );

    const normalizedProfiles = (profilesResponse.data ?? [])
      .map((profile) => {
        const resolvedPermissions = resolveNormalizedPermissions(
          profile.permissions && typeof profile.permissions == "object"
            ? (profile.permissions as Record<string, unknown>)
            : null,
        );

        return {
          profile_id: profile.profile_id,
          profile_name: profile.profile_name,
          is_system: profile.is_system ?? false,
          permissions: resolvedPermissions,
          created_at: profile.created_at,
          updated_at: profile.updated_at,
        } satisfies AdminProfile;
      })
      .sort((firstProfile, secondProfile) => {
        const permissionsSortScoreDifference =
          resolveAdminProfilePermissionsSortScore(secondProfile.permissions) -
          resolveAdminProfilePermissionsSortScore(firstProfile.permissions);

        if (permissionsSortScoreDifference != 0) {
          return permissionsSortScoreDifference;
        }

        return firstProfile.profile_name.localeCompare(secondProfile.profile_name);
      });

    setUsers(normalizedUsers);
    setProfiles(normalizedProfiles);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  useEffect(() => {
    const nextNameByUserId = users.reduce<Record<string, string>>((nameMap, user) => {
      nameMap[user.user_id] = user.name;
      return nameMap;
    }, {});

    const nextAccessValueByUserId = users.reduce<Record<string, string>>((accessByUserId, user) => {
      accessByUserId[user.user_id] = resolveUserAccessValue(user);
      return accessByUserId;
    }, {});

    const nextLoginIdentifierByUserId = users.reduce<Record<string, string>>((loginIdentifierMap, user) => {
      loginIdentifierMap[user.user_id] = user.login_identifier;
      return loginIdentifierMap;
    }, {});

    const nextNewPasswordByUserId = users.reduce<Record<string, string>>((passwordByUserId, user) => {
      passwordByUserId[user.user_id] = "";
      return passwordByUserId;
    }, {});

    setNameByUserId(nextNameByUserId);
    setAccessValueByUserId(nextAccessValueByUserId);
    setLoginIdentifierByUserId(nextLoginIdentifierByUserId);
    setNewPasswordByUserId(nextNewPasswordByUserId);
    setSelectedUserIds((currentSelectedUserIds) =>
      currentSelectedUserIds.filter((selectedUserId) => users.some((user) => user.user_id == selectedUserId)),
    );
  }, [users]);

  useEffect(() => {
    if (!editingUserId) {
      return;
    }

    if (!users.some((user) => user.user_id == editingUserId)) {
      setEditingUserId(null);
    }
  }, [editingUserId, users]);

  useEffect(() => {
    if (profiles.length == 0) {
      return;
    }

    if (newUserAccessValue.length > 0) {
      return;
    }

    setNewUserAccessValue(profiles[0].profile_id);
  }, [newUserAccessValue, profiles]);

  const onlineUserIdsSet = useMemo(() => {
    return new Set(siteTotalOnlineUserIds);
  }, [siteTotalOnlineUserIds]);

  const filteredUsers = useMemo(() => {
    const normalizedUserSearch = userSearch.trim().toLowerCase();

    return users.filter((user) => {
      if (accessFilter != ALL_PROFILES_FILTER && user.profile_id != accessFilter) {
        return false;
      }

      if (!normalizedUserSearch) {
        return true;
      }

      const resolvedSearchBase = [user.name, user.login_identifier, user.email ?? ""].join(" ").toLowerCase();

      return resolvedSearchBase.includes(normalizedUserSearch);
    });
  }, [accessFilter, userSearch, users]);

  const orderedFilteredUsers = useMemo(() => {
    const resolvedSortOption = sortOption ?? AdminUserSortOption.NAME_ASC;
    const currentTimestamp = Date.now();

    const sortedUsers = [...filteredUsers].sort((firstUser, secondUser) => {
      const nameComparison = resolveAdminUserNameSortValue(firstUser).localeCompare(resolveAdminUserNameSortValue(secondUser));

      if (resolvedSortOption == AdminUserSortOption.NAME_ASC) {
        return nameComparison;
      }

      if (resolvedSortOption == AdminUserSortOption.LAST_ACCESS_DESC) {
        const firstUserLastAccess = resolveAdminUserLastAccessSortValue(
          firstUser,
          onlineUserIdsSet.has(firstUser.user_id),
          currentTimestamp,
        );
        const secondUserLastAccess = resolveAdminUserLastAccessSortValue(
          secondUser,
          onlineUserIdsSet.has(secondUser.user_id),
          currentTimestamp,
        );
        const difference = secondUserLastAccess - firstUserLastAccess;

        if (difference != 0) {
          return difference;
        }

        return nameComparison;
      }

      if (resolvedSortOption == AdminUserSortOption.ONLINE_DESC) {
        const firstUserOnlineValue = resolveAdminUserOnlineSortValue(onlineUserIdsSet.has(firstUser.user_id));
        const secondUserOnlineValue = resolveAdminUserOnlineSortValue(onlineUserIdsSet.has(secondUser.user_id));
        const difference = secondUserOnlineValue - firstUserOnlineValue;

        if (difference != 0) {
          return difference;
        }

        return nameComparison;
      }

      if (resolvedSortOption == AdminUserSortOption.ACTIVE_STATUS_DESC) {
        const firstUserActiveStatusValue = resolveAdminUserActiveStatusSortValue(firstUser.password_status);
        const secondUserActiveStatusValue = resolveAdminUserActiveStatusSortValue(secondUser.password_status);
        const difference = secondUserActiveStatusValue - firstUserActiveStatusValue;

        if (difference != 0) {
          return difference;
        }

        return nameComparison;
      }

      const firstUserProfileWeight = resolveAdminUserProfileSortWeight(firstUser);
      const secondUserProfileWeight = resolveAdminUserProfileSortWeight(secondUser);
      const profileWeightDifference = firstUserProfileWeight - secondUserProfileWeight;

      if (profileWeightDifference != 0) {
        return profileWeightDifference;
      }

      const profileComparison = resolveAdminUserProfileSortLabel(firstUser).localeCompare(
        resolveAdminUserProfileSortLabel(secondUser),
      );

      if (profileComparison != 0) {
        return profileComparison;
      }

      return nameComparison;
    });

    return sortedUsers;
  }, [filteredUsers, onlineUserIdsSet, sortOption]);

  const selectableFilteredUsers = useMemo(() => {
    return orderedFilteredUsers.filter((user) => user.user_id != currentUser?.id);
  }, [currentUser?.id, orderedFilteredUsers]);

  const selectAllFilteredUsersChecked = useMemo(() => {
    if (selectableFilteredUsers.length == 0) {
      return false;
    }

    return selectableFilteredUsers.every((user) => selectedUserIds.includes(user.user_id));
  }, [selectableFilteredUsers, selectedUserIds]);

  const selectedProfile = useMemo(() => {
    if (!profileDraft.profileId) {
      return null;
    }

    return profiles.find((profile) => profile.profile_id == profileDraft.profileId) ?? null;
  }, [profileDraft.profileId, profiles]);

  const isProtectedAdminProfile = useMemo(() => {
    return resolveIsProtectedAdminProfile(selectedProfile);
  }, [selectedProfile]);

  const editingUser = useMemo(() => {
    if (!editingUserId) {
      return null;
    }

    return users.find((user) => user.user_id == editingUserId) ?? null;
  }, [editingUserId, users]);
  const editedUserName = editingUser ? (nameByUserId[editingUser.user_id] ?? editingUser.name) : "";
  const editedUserLoginIdentifier = editingUser
    ? (loginIdentifierByUserId[editingUser.user_id] ?? editingUser.login_identifier)
    : "";
  const editedUserAccessValue = editingUser
    ? (accessValueByUserId[editingUser.user_id] ?? resolveUserAccessValue(editingUser))
    : "";
  const editedUserPassword = editingUser ? (newPasswordByUserId[editingUser.user_id] ?? "") : "";
  const hasEditedUserPendingChanges = editingUser
    ? editedUserName.trim() != editingUser.name ||
      editedUserLoginIdentifier.trim().toLowerCase() != editingUser.login_identifier.trim().toLowerCase() ||
      editedUserAccessValue != resolveUserAccessValue(editingUser) ||
      editedUserPassword.trim().length > 0
    : false;
  const isEditingUserOnline = editingUser ? onlineUserIdsSet.has(editingUser.user_id) : false;
  const editingUserLastAccessDate = editingUser ? resolveAdminUserLastAccessDate(editingUser, isEditingUserOnline) : null;

  const handleToggleSelectAllFilteredUsers = (checked: CheckedState) => {
    if (!canManageUsers) {
      return;
    }

    const shouldSelectAll = resolveIsCheckboxChecked(checked);

    setSelectedUserIds((currentSelectedUserIds) => {
      if (!shouldSelectAll) {
        return currentSelectedUserIds.filter((selectedUserId) =>
          !selectableFilteredUsers.some((user) => user.user_id == selectedUserId),
        );
      }

      return [...new Set([...currentSelectedUserIds, ...selectableFilteredUsers.map((user) => user.user_id)])];
    });
  };

  const handleToggleSelectedUser = (userId: string, checked: CheckedState) => {
    if (!canManageUsers || userId == currentUser?.id) {
      return;
    }

    const shouldSelectUser = resolveIsCheckboxChecked(checked);

    setSelectedUserIds((currentSelectedUserIds) => {
      if (shouldSelectUser) {
        return [...new Set([...currentSelectedUserIds, userId])];
      }

      return currentSelectedUserIds.filter((selectedUserId) => selectedUserId != userId);
    });
  };

  const handleOpenEditUserModal = (userId: string) => {
    setEditingUserId(userId);
  };

  const handleSaveEditedUser = async (user: AdminUser) => {
    if (!canManageUsers) {
      return;
    }

    try {
      const nextName = nameByUserId[user.user_id] ?? user.name;
      const nextLoginIdentifier = loginIdentifierByUserId[user.user_id] ?? user.login_identifier;
      const nextAccessValue = accessValueByUserId[user.user_id] ?? resolveUserAccessValue(user);
      const nextPassword = newPasswordByUserId[user.user_id] ?? "";
      const hasNameChanged = nextName.trim() != user.name;
      const hasLoginIdentifierChanged = nextLoginIdentifier.trim().toLowerCase() != user.login_identifier.trim().toLowerCase();
      const hasAccessChanged = nextAccessValue != resolveUserAccessValue(user);
      const hasNewPassword = nextPassword.trim().length > 0;

      if (!hasNameChanged && !hasLoginIdentifierChanged && !hasAccessChanged && !hasNewPassword) {
        return;
      }

      const namePayload = hasNameChanged
        ? AdminUserNameSaveDTO.fromFormValues({
            target_user_id: user.user_id,
            name: nextName,
          }).bindToSave()
        : null;
      const loginIdentifierPayload = hasLoginIdentifierChanged
        ? AdminUserLoginIdentifierSaveDTO.fromFormValues({
            target_user_id: user.user_id,
            login_identifier: nextLoginIdentifier,
          }).bindToSave()
        : null;
      const userAccessSelection = hasAccessChanged ? resolveUserAccessSelection(nextAccessValue) : null;
      const passwordPayload = hasNewPassword
        ? AdminUserPasswordSaveDTO.fromFormValues({
            target_user_id: user.user_id,
            new_password: nextPassword,
          }).bindToSave()
        : null;

      if (hasAccessChanged && !userAccessSelection) {
        throw new Error("Selecione um perfil de acesso válido.");
      }

      setSavingEditedUserId(user.user_id);

      if (namePayload) {
        const { error } = await supabase.rpc("admin_update_user_name", namePayload);

        if (error) {
          setSavingEditedUserId(null);
          await fetchAdminData();
          toast.error(error.message);
          return;
        }
      }

      if (loginIdentifierPayload) {
        const { error } = await supabase.rpc("admin_update_user_login_identifier", loginIdentifierPayload);

        if (error) {
          setSavingEditedUserId(null);
          await fetchAdminData();
          toast.error(error.message);
          return;
        }
      }

      if (userAccessSelection) {
        const { error } = await supabase.rpc("admin_set_user_access", {
          _target_user_id: user.user_id,
          _role: null,
          _profile_id: userAccessSelection.profileId,
        });

        if (error) {
          setSavingEditedUserId(null);
          await fetchAdminData();
          toast.error(error.message);
          return;
        }
      }

      if (passwordPayload) {
        const { error } = await supabase.rpc("admin_update_user_password", passwordPayload);

        if (error) {
          setSavingEditedUserId(null);
          await fetchAdminData();
          toast.error(error.message);
          return;
        }
      }

      setSavingEditedUserId(null);
      toast.success("Alterações salvas com sucesso.");
      fetchAdminData();
    } catch (error) {
      setSavingEditedUserId(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar as alterações do usuário.");
    }
  };

  const executeResetUsersPasswordSetup = async (targetUserIds: string[]) => {
    if (!canManageUsers || targetUserIds.length == 0) {
      return;
    }

    setBulkProcessingAction(targetUserIds.length > 1 ? "RESET" : null);
    setResettingUserId(targetUserIds.length == 1 ? targetUserIds[0] : null);

    const { data, error } = await supabase.rpc("admin_reset_users_password_setup", {
      _target_user_ids: targetUserIds,
    });

    setBulkProcessingAction(null);
    setResettingUserId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(
      data == 1
        ? "Usuário marcado como pendente para criar uma nova senha."
        : `${data ?? 0} usuário(s) marcados como pendentes para criar uma nova senha.`,
    );

    setSelectedUserIds((currentSelectedUserIds) =>
      currentSelectedUserIds.filter((selectedUserId) => !targetUserIds.includes(selectedUserId)),
    );

    fetchAdminData();
  };

  const executeDeleteUsers = async (targetUserIds: string[]) => {
    if (!canManageUsers || targetUserIds.length == 0) {
      return;
    }

    setBulkProcessingAction(targetUserIds.length > 1 ? "DELETE" : null);
    setDeletingUserId(targetUserIds.length == 1 ? targetUserIds[0] : null);

    const { data, error } = await supabase.rpc("admin_delete_users", {
      _target_user_ids: targetUserIds,
    });

    setBulkProcessingAction(null);
    setDeletingUserId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(data == 1 ? "Usuário removido com sucesso." : `${data ?? 0} usuário(s) removido(s) com sucesso.`);

    setSelectedUserIds((currentSelectedUserIds) =>
      currentSelectedUserIds.filter((selectedUserId) => !targetUserIds.includes(selectedUserId)),
    );

    fetchAdminData();
  };

  const handleOpenResetUsersPasswordSetupConfirmation = (targetUserIds: string[]) => {
    if (!canManageUsers || targetUserIds.length == 0) {
      return;
    }

    setPendingUsersActionConfirmation({
      action: "RESET",
      targetUserIds,
    });
  };

  const handleOpenDeleteUsersConfirmation = (targetUserIds: string[]) => {
    if (!canManageUsers || targetUserIds.length == 0) {
      return;
    }

    setPendingUsersActionConfirmation({
      action: "DELETE",
      targetUserIds,
    });
  };

  const handleConfirmPendingUsersAction = async () => {
    const currentPendingUsersActionConfirmation = pendingUsersActionConfirmation;

    if (!currentPendingUsersActionConfirmation) {
      return;
    }

    setPendingUsersActionConfirmation(null);

    if (currentPendingUsersActionConfirmation.action == "RESET") {
      await executeResetUsersPasswordSetup(currentPendingUsersActionConfirmation.targetUserIds);
      return;
    }

    await executeDeleteUsers(currentPendingUsersActionConfirmation.targetUserIds);
  };

  const pendingUsersActionConfirmationTitle = useMemo(() => {
    if (!pendingUsersActionConfirmation) {
      return "";
    }

    if (pendingUsersActionConfirmation.action == "RESET") {
      return pendingUsersActionConfirmation.targetUserIds.length == 1
        ? "Resetar senha do usuário"
        : "Resetar senhas dos usuários";
    }

    return pendingUsersActionConfirmation.targetUserIds.length == 1
      ? "Excluir usuário administrativo"
      : "Excluir usuários administrativos";
  }, [pendingUsersActionConfirmation]);

  const pendingUsersActionConfirmationDescription = useMemo(() => {
    if (!pendingUsersActionConfirmation) {
      return "";
    }

    if (pendingUsersActionConfirmation.action == "RESET") {
      return pendingUsersActionConfirmation.targetUserIds.length == 1
        ? "O usuário ficará pendente e precisará criar uma nova senha no próximo acesso."
        : `${pendingUsersActionConfirmation.targetUserIds.length} usuário(s) ficarão pendentes e precisarão criar uma nova senha no próximo acesso.`;
    }

    return pendingUsersActionConfirmation.targetUserIds.length == 1
      ? "Esta ação removerá o usuário administrativo selecionado."
      : `Esta ação removerá ${pendingUsersActionConfirmation.targetUserIds.length} usuário(s) administrativos selecionados.`;
  }, [pendingUsersActionConfirmation]);

  const pendingUsersActionConfirmationButtonLabel = useMemo(() => {
    if (!pendingUsersActionConfirmation) {
      return "";
    }

    return pendingUsersActionConfirmation.action == "RESET" ? "Confirmar reset" : "Confirmar exclusão";
  }, [pendingUsersActionConfirmation]);

  const handleCreateUser = async () => {
    if (!canManageUsers) {
      return;
    }

    try {
      const createUserPayload = AdminCreateUserDTO.fromFormValues({
        name: newUserName,
        login_identifier: newUserLoginIdentifier,
        profile_id: newUserAccessValue,
      }).bindToSave();

      setCreatingUser(true);

      const { error } = await supabase.rpc("create_admin_user_with_access", createUserPayload);

      setCreatingUser(false);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Usuário administrativo criado com sucesso. A senha será definida no primeiro acesso.");
      setShowCreateUserModal(false);
      setNewUserName("");
      setNewUserLoginIdentifier("");
      setNewUserAccessValue(profiles[0]?.profile_id ?? "");
      fetchAdminData();
    } catch (error) {
      setCreatingUser(false);
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o usuário.");
    }
  };

  const handleOpenCreateProfile = () => {
    setProfileDraft(resolveEmptyProfileDraft());
    setShowProfileModal(true);
  };

  const resetCreateUserForm = () => {
    setNewUserName("");
    setNewUserLoginIdentifier("");
    setNewUserAccessValue(profiles[0]?.profile_id ?? "");
  };

  const handleOpenCreateUserModal = () => {
    resetCreateUserForm();
    setShowCreateUserModal(true);
  };

  const handleEditProfile = (profile: AdminProfile) => {
    setProfileDraft(resolveProfileDraftFromProfile(profile));
    setShowProfileModal(true);
  };

  const handleSaveProfile = async () => {
    if (!canManageUsers) {
      return;
    }

    if (isProtectedAdminProfile) {
      toast.error("O perfil Admin não pode ser alterado.");
      return;
    }

    const normalizedProfileName = profileDraft.profileName.trim();

    if (normalizedProfileName.length < 3) {
      toast.error("Informe um nome com ao menos 3 caracteres.");
      return;
    }

    const permissionsPayload = ADMIN_PANEL_TAB_ORDER.reduce<Record<string, string>>((permissionsByTab, adminPanelTab) => {
      permissionsByTab[adminPanelTab] = profileDraft.permissions[adminPanelTab];
      return permissionsByTab;
    }, {});

    setSavingProfile(true);

    const { error } = await supabase.rpc("upsert_admin_profile", {
      _profile_id: profileDraft.profileId,
      _profile_name: normalizedProfileName,
      _permissions: permissionsPayload,
    });

    setSavingProfile(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Perfil salvo com sucesso.");
    setShowProfileModal(false);
    fetchAdminData();
  };

  return (
    <div className="space-y-4">
      <div className="glass-card enter-section grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_260px_auto_auto]">
        <Input
          type="search"
          name="admin_user_filter_search"
          value={userSearch}
          onChange={(event) => setUserSearch(event.target.value)}
          placeholder="Buscar usuário por nome, login ou e-mail"
          className="glass-input"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
        />

        <Select value={accessFilter} onValueChange={setAccessFilter}>
          <SelectTrigger className="glass-input">
            <SelectValue placeholder="Filtrar por perfil" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_PROFILES_FILTER}>Todos os perfis</SelectItem>
            {profiles.map((profile) => (
              <SelectItem key={profile.profile_id} value={profile.profile_id}>
                {profile.profile_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sortOption ?? undefined}
          onValueChange={(value) => {
            if (isAdminUserSortOption(value)) {
              setSortOption(value);
            }
          }}
        >
          <SelectTrigger className="glass-input">
            <SelectValue placeholder="Ordenar listagem" />
          </SelectTrigger>
          <SelectContent>
            {ADMIN_USER_SORT_OPTION_ORDER.map((adminUserSortOption) => (
              <SelectItem key={adminUserSortOption} value={adminUserSortOption}>
                {ADMIN_USER_SORT_OPTION_LABELS[adminUserSortOption]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canManageUsers ? (
          <Button type="button" variant="outline" onClick={handleOpenCreateProfile} className="bg-background/70">
            <Shield className="mr-2 h-4 w-4" />
            Perfis
          </Button>
        ) : null}
        {canManageUsers ? (
          <Button
            type="button"
            onClick={handleOpenCreateUserModal}
            disabled={profiles.length == 0}
            className="w-full md:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Criar usuário
          </Button>
        ) : null}
      </div>

      {canManageUsers ? (
        orderedFilteredUsers.length > 0 ? (
          <div className="glass-card enter-section flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={selectAllFilteredUsersChecked} onCheckedChange={handleToggleSelectAllFilteredUsers} />
                <span>Selecionar todos os usuários filtrados</span>
              </label>

              <Button
                type="button"
                variant="outline"
                className="bg-background/70"
                onClick={() => handleOpenResetUsersPasswordSetupConfirmation(selectedUserIds)}
                disabled={selectedUserIds.length == 0 || bulkProcessingAction != null}
              >
                {bulkProcessingAction == "RESET" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                Resetar senhas ({selectedUserIds.length})
              </Button>

              <Button
                type="button"
                variant="outline"
                className="bg-background/70"
                onClick={() => handleOpenDeleteUsersConfirmation(selectedUserIds)}
                disabled={selectedUserIds.length == 0 || bulkProcessingAction != null}
              >
                {bulkProcessingAction == "DELETE" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Excluir selecionados ({selectedUserIds.length})
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">{orderedFilteredUsers.length} usuário(s) encontrado(s)</p>
          </div>
        ) : null
      ) : (
        <p className="text-sm text-muted-foreground">Perfil em visualização: sem permissão para criar ou editar usuários.</p>
      )}

      {loading ? (
        <div className="glass-card enter-section flex min-h-28 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : orderedFilteredUsers.length == 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum usuário administrativo encontrado.</p>
      ) : (
        <div className="space-y-2">
          {orderedFilteredUsers.map((user) => {
            const isCurrentUser = user.user_id == currentUser?.id;
            const isUserOnline = onlineUserIdsSet.has(user.user_id);
            const resolvedUserLastAccessDate = resolveAdminUserLastAccessDate(user, isUserOnline);
            const shouldDisplayUserEmail = resolveShouldDisplayInternalAdminUserEmail(user.email, user.login_identifier);

            return (
              <div
                key={user.user_id}
                className="list-item-card list-item-card-hover grid gap-3 p-3 lg:grid-cols-[minmax(0,320px)_minmax(0,170px)_minmax(0,220px)_minmax(0,220px)_auto] lg:items-start"
              >
                <div className="flex min-w-0 items-start gap-3">
                  {canManageUsers ? (
                    <Checkbox
                      checked={selectedUserIds.includes(user.user_id)}
                      onCheckedChange={(checked) => handleToggleSelectedUser(user.user_id, checked)}
                      disabled={isCurrentUser}
                    />
                  ) : null}

                  <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${isUserOnline ? "bg-emerald-500" : "bg-red-500"}`}
                          title={isUserOnline ? "Usuário online na plataforma" : "Usuário offline na plataforma"}
                          aria-label={isUserOnline ? "Usuário online na plataforma" : "Usuário offline na plataforma"}
                        />
                        <p className="truncate text-sm font-medium">{user.name}</p>
                        <AppBadge tone={resolveAdminUserPasswordStatusBadgeTone(user.password_status)}>
                          {resolveAdminUserPasswordStatusLabel(user.password_status)}
                        </AppBadge>
                        {isCurrentUser ? <AppBadge tone={AppBadgeTone.PRIMARY}>você</AppBadge> : null}
                      </div>

                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p className="truncate">Login: {user.login_identifier}</p>
                        {shouldDisplayUserEmail ? (
                          <p className="truncate">E-mail: {user.email}</p>
                        ) : null}
                      </div>
                    </div>

                    {canManageUsers ? (
                      <div className="flex shrink-0 lg:hidden">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="bg-background/70"
                          onClick={() => handleOpenEditUserModal(user.user_id)}
                          title={`Editar ${user.name}`}
                          aria-label={`Editar ${user.name}`}
                        >
                          <PencilLine className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Perfil</p>
                  <p className="truncate text-sm text-foreground">{user.profile_name}</p>
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Criado em</p>
                  <p className="text-sm text-foreground">{format(new Date(user.created_at), "dd/MM/yyyy HH:mm")}</p>
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Último acesso</p>
                  <p className="text-sm text-foreground">
                    {resolvedUserLastAccessDate ? format(resolvedUserLastAccessDate, "dd/MM/yyyy HH:mm") : "Sem acesso"}
                  </p>
                </div>

                {canManageUsers ? (
                  <div className="hidden shrink-0 justify-end lg:flex lg:self-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="bg-background/70"
                      onClick={() => handleOpenEditUserModal(user.user_id)}
                      title={`Editar ${user.name}`}
                      aria-label={`Editar ${user.name}`}
                    >
                      <PencilLine className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={showCreateUserModal}
        onOpenChange={(isOpen) => {
          setShowCreateUserModal(isOpen);

          if (!isOpen) {
            resetCreateUserForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Criar usuário</DialogTitle>
            <DialogDescription>Defina o nome, o login e o perfil de acesso do usuário administrativo.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <Input
              type="text"
              name="admin_new_user_name_input"
              value={newUserName}
              onChange={(event) => setNewUserName(event.target.value)}
              placeholder="Nome do novo usuário"
              className="glass-input"
              autoComplete="off"
            />

            <Input
              type="text"
              name="admin_new_user_login_identifier_input"
              value={newUserLoginIdentifier}
              onChange={(event) => setNewUserLoginIdentifier(event.target.value)}
              placeholder="Login do novo usuário"
              className="glass-input"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />

            <Select value={newUserAccessValue} onValueChange={setNewUserAccessValue}>
              <SelectTrigger className="glass-input">
                <SelectValue placeholder="Perfil de acesso" />
              </SelectTrigger>
              <SelectContent>
                {profileAccessOptions.map((profileAccessOption) => (
                  <SelectItem key={profileAccessOption.value} value={profileAccessOption.value}>
                    {profileAccessOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-3 pt-2 sm:gap-2 sm:pt-0">
            <Button type="button" variant="outline" onClick={() => setShowCreateUserModal(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleCreateUser} disabled={creatingUser || profiles.length == 0}>
              {creatingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Criar usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingUser != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setEditingUserId(null);
          }
        }}
      >
        {editingUser ? (
          <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden sm:max-w-3xl">
            <DialogHeader className="shrink-0">
              <DialogTitle>Editar usuário</DialogTitle>
              <DialogDescription>Atualize nome, login, perfil, senha e ações do usuário administrativo.</DialogDescription>
            </DialogHeader>

            <div className="overflow-y-auto pr-1">
              <div className="space-y-4">
                <div className="rounded-2xl border border-border/50 bg-background/30 p-4 backdrop-blur-md">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${isEditingUserOnline ? "bg-emerald-500" : "bg-red-500"}`}
                      title={
                        isEditingUserOnline ? "Usuário online na plataforma" : "Usuário offline na plataforma"
                      }
                      aria-label={
                        isEditingUserOnline ? "Usuário online na plataforma" : "Usuário offline na plataforma"
                      }
                    />
                    <p className="text-sm font-semibold">{editingUser.name}</p>
                    <AppBadge tone={resolveAdminUserPasswordStatusBadgeTone(editingUser.password_status)}>
                      {resolveAdminUserPasswordStatusLabel(editingUser.password_status)}
                    </AppBadge>
                    {editingUser.user_id == currentUser?.id ? <AppBadge tone={AppBadgeTone.PRIMARY}>você</AppBadge> : null}
                  </div>

                  <div className="mt-3 grid gap-x-4 gap-y-1 text-xs text-muted-foreground md:grid-cols-2">
                    <p className="truncate">Login atual: {editingUser.login_identifier}</p>
                    <p className="truncate">Perfil atual: {editingUser.profile_name}</p>
                    {resolveShouldDisplayInternalAdminUserEmail(editingUser.email, editingUser.login_identifier) ? (
                      <p className="truncate">E-mail: {editingUser.email}</p>
                    ) : null}
                    <p>Criado em {format(new Date(editingUser.created_at), "dd/MM/yyyy HH:mm")}</p>
                    <p>
                      Último acesso:{" "}
                      {editingUserLastAccessDate ? format(editingUserLastAccessDate, "dd/MM/yyyy HH:mm") : "Sem acesso"}
                    </p>
                  </div>
                </div>

                {canManageUsers ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2 rounded-2xl border border-border/50 bg-background/30 p-4 backdrop-blur-md">
                      <Label htmlFor={`admin-user-name-modal-${editingUser.user_id}`}>Nome</Label>
                      <Input
                        id={`admin-user-name-modal-${editingUser.user_id}`}
                        type="text"
                        value={editedUserName}
                        onChange={(event) =>
                          setNameByUserId((currentNameByUserId) => ({
                            ...currentNameByUserId,
                            [editingUser.user_id]: event.target.value,
                          }))
                        }
                        className="glass-input"
                        autoComplete="off"
                      />
                    </div>

                    <div className="space-y-2 rounded-2xl border border-border/50 bg-background/30 p-4 backdrop-blur-md">
                      <Label htmlFor={`admin-user-login-modal-${editingUser.user_id}`}>Login</Label>
                      <Input
                        id={`admin-user-login-modal-${editingUser.user_id}`}
                        type="text"
                        value={editedUserLoginIdentifier}
                        onChange={(event) =>
                          setLoginIdentifierByUserId((currentLoginIdentifierByUserId) => ({
                            ...currentLoginIdentifierByUserId,
                            [editingUser.user_id]: event.target.value,
                          }))
                        }
                        className="glass-input"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                      />
                    </div>

                    <div className="space-y-2 rounded-2xl border border-border/50 bg-background/30 p-4 backdrop-blur-md">
                      <Label htmlFor={`admin-user-access-modal-${editingUser.user_id}`}>Perfil de acesso</Label>
                      <Select
                        value={editedUserAccessValue}
                        onValueChange={(value) =>
                          setAccessValueByUserId((currentAccessByUserId) => ({
                            ...currentAccessByUserId,
                            [editingUser.user_id]: value,
                          }))
                        }
                      >
                        <SelectTrigger id={`admin-user-access-modal-${editingUser.user_id}`} className="glass-input">
                          <SelectValue placeholder="Perfil de acesso" />
                        </SelectTrigger>
                        <SelectContent>
                          {accessOptions.map((accessOption) => (
                            <SelectItem key={accessOption.value} value={accessOption.value}>
                              {accessOption.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2 rounded-2xl border border-border/50 bg-background/30 p-4 backdrop-blur-md">
                      <Label htmlFor={`admin-user-password-modal-${editingUser.user_id}`}>Nova senha</Label>
                      <Input
                        id={`admin-user-password-modal-${editingUser.user_id}`}
                        type="password"
                        value={editedUserPassword}
                        onChange={(event) =>
                          setNewPasswordByUserId((currentNewPasswordByUserId) => ({
                            ...currentNewPasswordByUserId,
                            [editingUser.user_id]: event.target.value,
                          }))
                        }
                        className="glass-input"
                        autoComplete="new-password"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                      />
                    </div>
                  </div>
                ) : null}

                {canManageUsers ? (
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      disabled={!hasEditedUserPendingChanges || savingEditedUserId == editingUser.user_id}
                      onClick={() => handleSaveEditedUser(editingUser)}
                    >
                      {savingEditedUserId == editingUser.user_id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Salvar alterações
                    </Button>
                  </div>
                ) : null}

                {canManageUsers ? (
                  <DialogFooter className="gap-2 border-t border-border/40 pt-4 sm:justify-center sm:space-x-0">
                    <Button
                      type="button"
                      variant="outline"
                      className="bg-background/70"
                      disabled={
                        editingUser.user_id == currentUser?.id ||
                        resettingUserId == editingUser.user_id ||
                        bulkProcessingAction != null
                      }
                      onClick={() => handleOpenResetUsersPasswordSetupConfirmation([editingUser.user_id])}
                    >
                      {resettingUserId == editingUser.user_id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="mr-2 h-4 w-4" />
                      )}
                      Resetar senha
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="bg-background/70"
                      disabled={
                        editingUser.user_id == currentUser?.id ||
                        deletingUserId == editingUser.user_id ||
                        bulkProcessingAction != null
                      }
                      onClick={() => handleOpenDeleteUsersConfirmation([editingUser.user_id])}
                    >
                      {deletingUserId == editingUser.user_id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Excluir usuário
                    </Button>
                  </DialogFooter>
                ) : null}
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <AlertDialog
        open={pendingUsersActionConfirmation != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setPendingUsersActionConfirmation(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingUsersActionConfirmationTitle}</AlertDialogTitle>
            <AlertDialogDescription>{pendingUsersActionConfirmationDescription}</AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPendingUsersAction}>
              {pendingUsersActionConfirmationButtonLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showProfileModal} onOpenChange={setShowProfileModal}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Perfis personalizados</DialogTitle>
            <DialogDescription>Defina nome e permissões por aba do admin (visualização ou edição).</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-2 rounded-2xl border border-border/50 bg-background/30 p-3 backdrop-blur-md">
              <Button type="button" variant="outline" className="w-full bg-background/70" onClick={handleOpenCreateProfile}>
                <Plus className="mr-2 h-4 w-4" />
                Novo perfil
              </Button>

              <div className="max-h-[52vh] space-y-1 overflow-y-auto pr-1">
                {profiles.length == 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum perfil personalizado cadastrado.</p>
                ) : (
                  profiles.map((profile) => (
                    <button
                      key={profile.profile_id}
                      type="button"
                      className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                        profileDraft.profileId == profile.profile_id
                          ? "border-primary/40 bg-primary/10"
                          : "border-border/50 bg-background/30 hover:bg-background/40"
                      }`}
                      onClick={() => handleEditProfile(profile)}
                    >
                      <p className="truncate text-sm font-medium">{profile.profile_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Atualizado em {format(new Date(profile.updated_at), "dd/MM/yyyy HH:mm")}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-border/50 bg-background/30 p-3 backdrop-blur-md">
              <div className="space-y-2">
                <Label htmlFor="profile-name-input">Nome do perfil</Label>
                <Input
                  id="profile-name-input"
                  value={profileDraft.profileName}
                  onChange={(event) =>
                    setProfileDraft((currentProfileDraft) => ({
                      ...currentProfileDraft,
                      profileName: event.target.value,
                    }))
                  }
                  className="glass-input"
                  placeholder="Ex.: Operador de Agenda"
                  disabled={isProtectedAdminProfile}
                />
              </div>

              {isProtectedAdminProfile ? (
                <p className="text-xs text-muted-foreground">
                  O perfil Admin é protegido. É possível visualizar, mas não editar este perfil.
                </p>
              ) : null}

              <div className="space-y-2">
                <p className="text-sm font-medium">Permissões por aba</p>

                <div className="space-y-2">
                  {ADMIN_PANEL_TAB_ORDER.map((adminPanelTab) => (
                    <div
                      key={adminPanelTab}
                      className="grid gap-2 rounded-xl border border-border/50 bg-background/30 p-2 sm:grid-cols-[170px_minmax(0,1fr)] sm:items-center"
                    >
                      <p className="text-sm font-medium">{ADMIN_TAB_LABELS[adminPanelTab]}</p>

                      <Select
                        value={profileDraft.permissions[adminPanelTab]}
                        disabled={isProtectedAdminProfile}
                        onValueChange={(value) => {
                          if (!isAdminPanelPermissionLevel(value)) {
                            return;
                          }

                          setProfileDraft((currentProfileDraft) => ({
                            ...currentProfileDraft,
                            permissions: {
                              ...currentProfileDraft.permissions,
                              [adminPanelTab]: value,
                            },
                          }));
                        }}
                      >
                        <SelectTrigger className="glass-input">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={AdminPanelPermissionLevel.NONE}>
                            {ADMIN_PERMISSION_LEVEL_LABELS[AdminPanelPermissionLevel.NONE]}
                          </SelectItem>
                          <SelectItem value={AdminPanelPermissionLevel.VIEW}>
                            {ADMIN_PERMISSION_LEVEL_LABELS[AdminPanelPermissionLevel.VIEW]}
                          </SelectItem>
                          <SelectItem value={AdminPanelPermissionLevel.EDIT}>
                            {ADMIN_PERMISSION_LEVEL_LABELS[AdminPanelPermissionLevel.EDIT]}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={savingProfile || !canManageUsers || isProtectedAdminProfile}
                >
                  {savingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar perfil
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
