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

export function AdminUsers({ canManageUsers = true }: Props) {
  const { user: currentUser } = useAuth();
  const { siteTotalOnlineUserIds } = useOnlineVisitorsProviderContext();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessFilter, setAccessFilter] = useState(ALL_PROFILES_FILTER);
  const [userSearch, setUserSearch] = useState("");
  const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});
  const [accessValueByUserId, setAccessValueByUserId] = useState<Record<string, string>>({});
  const [loginIdentifierByUserId, setLoginIdentifierByUserId] = useState<Record<string, string>>({});
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [savingNameUserId, setSavingNameUserId] = useState<string | null>(null);
  const [savingAccessUserId, setSavingAccessUserId] = useState<string | null>(null);
  const [savingLoginUserId, setSavingLoginUserId] = useState<string | null>(null);
  const [savingPasswordUserId, setSavingPasswordUserId] = useState<string | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [bulkProcessingAction, setBulkProcessingAction] = useState<"RESET" | "DELETE" | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
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

  const selectableFilteredUsers = useMemo(() => {
    return filteredUsers.filter((user) => user.user_id != currentUser?.id);
  }, [currentUser?.id, filteredUsers]);

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

  const onlineUserIdsSet = useMemo(() => {
    return new Set(siteTotalOnlineUserIds);
  }, [siteTotalOnlineUserIds]);

  const editingUser = useMemo(() => {
    if (!editingUserId) {
      return null;
    }

    return users.find((user) => user.user_id == editingUserId) ?? null;
  }, [editingUserId, users]);

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

  const handleSaveUserAccess = async (user: AdminUser) => {
    if (!canManageUsers) {
      return;
    }

    const selectedAccessValue = accessValueByUserId[user.user_id] ?? resolveUserAccessValue(user);
    const userAccessSelection = resolveUserAccessSelection(selectedAccessValue);

    if (!userAccessSelection) {
      toast.error("Selecione um perfil de acesso válido.");
      return;
    }

    setSavingAccessUserId(user.user_id);

    const { error } = await supabase.rpc("admin_set_user_access", {
      _target_user_id: user.user_id,
      _role: null,
      _profile_id: userAccessSelection.profileId,
    });

    setSavingAccessUserId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Acesso atualizado com sucesso.");
    fetchAdminData();
  };

  const handleSaveUserName = async (user: AdminUser) => {
    if (!canManageUsers) {
      return;
    }

    try {
      const namePayload = AdminUserNameSaveDTO.fromFormValues({
        target_user_id: user.user_id,
        name: nameByUserId[user.user_id] ?? user.name,
      }).bindToSave();

      setSavingNameUserId(user.user_id);

      const { error } = await supabase.rpc("admin_update_user_name", namePayload);

      setSavingNameUserId(null);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Nome atualizado com sucesso.");
      fetchAdminData();
    } catch (error) {
      setSavingNameUserId(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o nome.");
    }
  };

  const handleSaveUserLoginIdentifier = async (user: AdminUser) => {
    if (!canManageUsers) {
      return;
    }

    try {
      const loginIdentifierPayload = AdminUserLoginIdentifierSaveDTO.fromFormValues({
        target_user_id: user.user_id,
        login_identifier: loginIdentifierByUserId[user.user_id] ?? user.login_identifier,
      }).bindToSave();

      setSavingLoginUserId(user.user_id);

      const { error } = await supabase.rpc("admin_update_user_login_identifier", loginIdentifierPayload);

      setSavingLoginUserId(null);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Login atualizado com sucesso.");
      fetchAdminData();
    } catch (error) {
      setSavingLoginUserId(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o login.");
    }
  };

  const handleSaveUserPassword = async (user: AdminUser) => {
    if (!canManageUsers) {
      return;
    }

    try {
      const passwordPayload = AdminUserPasswordSaveDTO.fromFormValues({
        target_user_id: user.user_id,
        new_password: newPasswordByUserId[user.user_id] ?? "",
      }).bindToSave();

      setSavingPasswordUserId(user.user_id);

      const { error } = await supabase.rpc("admin_update_user_password", passwordPayload);

      setSavingPasswordUserId(null);

      if (error) {
        toast.error(error.message);
        return;
      }

      setNewPasswordByUserId((currentNewPasswordByUserId) => ({
        ...currentNewPasswordByUserId,
        [user.user_id]: "",
      }));
      toast.success("Senha atualizada com sucesso.");
      fetchAdminData();
    } catch (error) {
      setSavingPasswordUserId(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a senha.");
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
      <div className="glass-card enter-section grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_220px_auto]">
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

        {canManageUsers ? (
          <Button type="button" variant="outline" onClick={handleOpenCreateProfile} className="bg-background/75">
            <Shield className="mr-2 h-4 w-4" />
            Perfis
          </Button>
        ) : null}
      </div>

      {canManageUsers ? (
        <>
          <div className="glass-card enter-section grid gap-2 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_auto]">
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

            <Button type="button" onClick={handleCreateUser} disabled={creatingUser || profiles.length == 0}>
              {creatingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Criar usuário
            </Button>
          </div>

          {filteredUsers.length > 0 ? (
            <div className="glass-card enter-section flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={selectAllFilteredUsersChecked} onCheckedChange={handleToggleSelectAllFilteredUsers} />
                  <span>Selecionar todos os usuários filtrados</span>
                </label>

                <Button
                  type="button"
                  variant="outline"
                  className="bg-background/75"
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
                  className="bg-background/75"
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

              <p className="text-sm text-muted-foreground">{filteredUsers.length} usuário(s) encontrado(s)</p>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Perfil em visualização: sem permissão para criar ou editar usuários.</p>
      )}

      {loading ? (
        <div className="glass-card enter-section flex min-h-28 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : filteredUsers.length == 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum usuário administrativo encontrado.</p>
      ) : (
        <div className="space-y-2">
          {filteredUsers.map((user) => {
            const isCurrentUser = user.user_id == currentUser?.id;
            const isUserOnline = onlineUserIdsSet.has(user.user_id);
            const shouldDisplayUserEmail = resolveShouldDisplayInternalAdminUserEmail(user.email, user.login_identifier);

            return (
              <div
                key={user.user_id}
                className="glass-card enter-item grid gap-3 p-3 lg:grid-cols-[minmax(0,320px)_minmax(0,170px)_minmax(0,220px)_minmax(0,220px)_auto] lg:items-start"
              >
                <div className="flex min-w-0 items-start gap-3">
                  {canManageUsers ? (
                    <Checkbox
                      checked={selectedUserIds.includes(user.user_id)}
                      onCheckedChange={(checked) => handleToggleSelectedUser(user.user_id, checked)}
                      disabled={isCurrentUser}
                    />
                  ) : null}

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
                    {user.last_sign_in_at ? format(new Date(user.last_sign_in_at), "dd/MM/yyyy HH:mm") : "Sem acesso"}
                  </p>
                </div>

                {canManageUsers ? (
                  <div className="flex shrink-0 justify-end lg:self-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="bg-background/75"
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
        open={editingUser != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setEditingUserId(null);
          }
        }}
      >
        {editingUser ? (
          <DialogContent className="border-border/60 !bg-background/70 shadow-[0_18px_45px_rgba(15,23,42,0.16)] backdrop-blur-md sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Editar usuário</DialogTitle>
              <DialogDescription>Atualize nome, login, perfil, senha e ações do usuário administrativo.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-2xl border border-border/50 bg-background/35 p-4 backdrop-blur-md">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      onlineUserIdsSet.has(editingUser.user_id) ? "bg-emerald-500" : "bg-red-500"
                    }`}
                    title={
                      onlineUserIdsSet.has(editingUser.user_id)
                        ? "Usuário online na plataforma"
                        : "Usuário offline na plataforma"
                    }
                    aria-label={
                      onlineUserIdsSet.has(editingUser.user_id)
                        ? "Usuário online na plataforma"
                        : "Usuário offline na plataforma"
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
                    {editingUser.last_sign_in_at
                      ? format(new Date(editingUser.last_sign_in_at), "dd/MM/yyyy HH:mm")
                      : "Sem acesso"}
                  </p>
                </div>
              </div>

              {canManageUsers ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2 rounded-2xl border border-border/50 bg-background/35 p-4 backdrop-blur-md">
                    <Label htmlFor={`admin-user-name-modal-${editingUser.user_id}`}>Nome</Label>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Input
                        id={`admin-user-name-modal-${editingUser.user_id}`}
                        type="text"
                        value={nameByUserId[editingUser.user_id] ?? editingUser.name}
                        onChange={(event) =>
                          setNameByUserId((currentNameByUserId) => ({
                            ...currentNameByUserId,
                            [editingUser.user_id]: event.target.value,
                          }))
                        }
                        className="glass-input"
                        autoComplete="off"
                      />

                      <Button
                        type="button"
                        variant="outline"
                        className="bg-background/75"
                        disabled={savingNameUserId == editingUser.user_id}
                        onClick={() => handleSaveUserName(editingUser)}
                      >
                        {savingNameUserId == editingUser.user_id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Salvar nome
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-2xl border border-border/50 bg-background/35 p-4 backdrop-blur-md">
                    <Label htmlFor={`admin-user-login-modal-${editingUser.user_id}`}>Login</Label>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Input
                        id={`admin-user-login-modal-${editingUser.user_id}`}
                        type="text"
                        value={loginIdentifierByUserId[editingUser.user_id] ?? editingUser.login_identifier}
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

                      <Button
                        type="button"
                        variant="outline"
                        className="bg-background/75"
                        disabled={savingLoginUserId == editingUser.user_id}
                        onClick={() => handleSaveUserLoginIdentifier(editingUser)}
                      >
                        {savingLoginUserId == editingUser.user_id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Salvar login
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-2xl border border-border/50 bg-background/35 p-4 backdrop-blur-md">
                    <Label htmlFor={`admin-user-access-modal-${editingUser.user_id}`}>Perfil de acesso</Label>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Select
                        value={accessValueByUserId[editingUser.user_id] ?? resolveUserAccessValue(editingUser)}
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

                      <Button
                        type="button"
                        variant="outline"
                        className="bg-background/75"
                        disabled={savingAccessUserId == editingUser.user_id}
                        onClick={() => handleSaveUserAccess(editingUser)}
                      >
                        {savingAccessUserId == editingUser.user_id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Shield className="mr-2 h-4 w-4" />
                        )}
                        Salvar acesso
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-2xl border border-border/50 bg-background/35 p-4 backdrop-blur-md">
                    <Label htmlFor={`admin-user-password-modal-${editingUser.user_id}`}>Nova senha</Label>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Input
                        id={`admin-user-password-modal-${editingUser.user_id}`}
                        type="password"
                        value={newPasswordByUserId[editingUser.user_id] ?? ""}
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

                      <Button
                        type="button"
                        variant="outline"
                        className="bg-background/75"
                        disabled={savingPasswordUserId == editingUser.user_id}
                        onClick={() => handleSaveUserPassword(editingUser)}
                      >
                        {savingPasswordUserId == editingUser.user_id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Atualizar senha
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {canManageUsers ? (
                <DialogFooter className="gap-2 border-t border-border/45 pt-4 sm:justify-between sm:space-x-0">
                  <Button
                    type="button"
                    variant="outline"
                    className="bg-background/75"
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
                    className="bg-background/75"
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
        <AlertDialogContent
          overlayClassName="bg-transparent"
          className="border-border/60 !bg-background/70 shadow-[0_18px_45px_rgba(15,23,42,0.16)] backdrop-blur-md"
        >
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
        <DialogContent className="border-border/60 !bg-background/70 shadow-[0_18px_45px_rgba(15,23,42,0.16)] backdrop-blur-md sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Perfis personalizados</DialogTitle>
            <DialogDescription>Defina nome e permissões por aba do admin (visualização ou edição).</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-2 rounded-2xl border border-border/50 bg-background/35 p-3 backdrop-blur-md">
              <Button type="button" variant="outline" className="w-full bg-background/75" onClick={handleOpenCreateProfile}>
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
                          : "border-border/50 bg-background/35 hover:bg-background/45"
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

            <div className="space-y-3 rounded-2xl border border-border/50 bg-background/35 p-3 backdrop-blur-md">
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
                      className="grid gap-2 rounded-xl border border-border/50 bg-background/38 p-2 sm:grid-cols-[170px_minmax(0,1fr)] sm:items-center"
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
