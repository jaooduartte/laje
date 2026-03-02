import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Plus, Save, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminPanelPermissionLevel, AdminPanelRole, AdminPanelTab, AppBadgeTone } from "@/lib/enums";
import type { AdminProfile, AdminTabPermissionByTab, AdminUser } from "@/lib/types";
import { AppBadge } from "@/components/ui/app-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL_PROFILES_FILTER = "ALL_PROFILES";

const DEFAULT_PROFILE_NAME = "Novo perfil";
const ADMIN_SYSTEM_PROFILE_NAME = "admin";

const ADMIN_PANEL_ROLE_LABELS: Record<AdminPanelRole, string> = {
  [AdminPanelRole.ADMIN]: "Admin",
  [AdminPanelRole.EVENTOS]: "Eventos",
  [AdminPanelRole.MESA]: "Mesa",
};

const ADMIN_TAB_LABELS: Record<AdminPanelTab, string> = {
  [AdminPanelTab.MATCHES]: "Jogos",
  [AdminPanelTab.CONTROL]: "Controle ao Vivo",
  [AdminPanelTab.TEAMS]: "Atléticas",
  [AdminPanelTab.SPORTS]: "Modalidades",
  [AdminPanelTab.EVENTS]: "Eventos da Liga",
  [AdminPanelTab.LOGS]: "Logs",
  [AdminPanelTab.USERS]: "Usuários",
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
  AdminPanelTab.SETTINGS,
];

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

function isAdminPanelRole(value: string | null): value is AdminPanelRole {
  return value == AdminPanelRole.ADMIN || value == AdminPanelRole.EVENTOS || value == AdminPanelRole.MESA;
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

function resolveUserAccessLabel(user: AdminUser): string {
  if (user.profile_name) {
    return user.profile_name;
  }

  if (user.role) {
    return ADMIN_PANEL_ROLE_LABELS[user.role];
  }

  return "Sem perfil";
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

export function AdminUsers({ canManageUsers = true }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessFilter, setAccessFilter] = useState(ALL_PROFILES_FILTER);
  const [emailSearch, setEmailSearch] = useState("");
  const [passwordByUserId, setPasswordByUserId] = useState<Record<string, string>>({});
  const [accessValueByUserId, setAccessValueByUserId] = useState<Record<string, string>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [savingAccessUserId, setSavingAccessUserId] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(resolveEmptyProfileDraft());
  const [savingProfile, setSavingProfile] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserAccessValue, setNewUserAccessValue] = useState("");

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

    const normalizedUsers = (usersResponse.data ?? []).map((user) => {
      const normalizedRole = user.role && isAdminPanelRole(user.role) ? user.role : null;

      return {
        user_id: user.user_id,
        email: user.email,
        role: normalizedRole,
        profile_id: user.profile_id ?? null,
        profile_name: user.profile_name ?? null,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      } satisfies AdminUser;
    });

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
      .sort((firstProfile, secondProfile) => firstProfile.profile_name.localeCompare(secondProfile.profile_name));

    setUsers(normalizedUsers);
    setProfiles(normalizedProfiles);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  useEffect(() => {
    const nextAccessValueByUserId = users.reduce<Record<string, string>>((accessByUserId, user) => {
      accessByUserId[user.user_id] = resolveUserAccessValue(user);
      return accessByUserId;
    }, {});

    setAccessValueByUserId(nextAccessValueByUserId);
  }, [users]);

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
    const normalizedEmailSearch = emailSearch.trim().toLowerCase();

    return users.filter((user) => {
      if (accessFilter != ALL_PROFILES_FILTER) {
        if (user.profile_id != accessFilter) {
          return false;
        }
      }

      if (normalizedEmailSearch.length == 0) {
        return true;
      }

      return (user.email ?? "").toLowerCase().includes(normalizedEmailSearch);
    });
  }, [accessFilter, emailSearch, users]);

  const selectedProfile = useMemo(() => {
    if (!profileDraft.profileId) {
      return null;
    }

    const foundProfile = profiles.find((profile) => profile.profile_id == profileDraft.profileId);

    return foundProfile ?? null;
  }, [profileDraft.profileId, profiles]);

  const isProtectedAdminProfile = useMemo(() => {
    return resolveIsProtectedAdminProfile(selectedProfile);
  }, [selectedProfile]);

  const handleSavePassword = async (user: AdminUser) => {
    if (!canManageUsers) {
      return;
    }

    const nextPassword = (passwordByUserId[user.user_id] ?? "").trim();

    if (nextPassword.length < 8) {
      toast.error("A nova senha deve ter ao menos 8 caracteres.");
      return;
    }

    setSavingUserId(user.user_id);

    const { error } = await supabase.rpc("admin_update_user_password", {
      _target_user_id: user.user_id,
      _new_password: nextPassword,
    });

    setSavingUserId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Senha atualizada com sucesso.");

    setPasswordByUserId((currentPasswordByUserId) => ({
      ...currentPasswordByUserId,
      [user.user_id]: "",
    }));
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

  const handleCreateUser = async () => {
    if (!canManageUsers) {
      return;
    }

    const normalizedEmail = newUserEmail.trim().toLowerCase();
    const normalizedPassword = newUserPassword.trim();

    if (normalizedEmail.length == 0 || !normalizedEmail.includes("@")) {
      toast.error("Informe um e-mail válido.");
      return;
    }

    if (normalizedPassword.length < 8) {
      toast.error("A senha deve ter ao menos 8 caracteres.");
      return;
    }

    const selectedProfileId = newUserAccessValue.trim();

    if (selectedProfileId.length == 0) {
      toast.error("Selecione um perfil administrativo.");
      return;
    }

    setCreatingUser(true);

    const { error } = await supabase.rpc("create_admin_user_with_access", {
      _email: normalizedEmail,
      _password: normalizedPassword,
      _role: null,
      _profile_id: selectedProfileId,
    });

    setCreatingUser(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Usuário administrativo criado com sucesso.");
    setNewUserEmail("");
    setNewUserPassword("");
    setNewUserAccessValue(profiles[0]?.profile_id ?? "");
    fetchAdminData();
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
          value={emailSearch}
          onChange={(event) => setEmailSearch(event.target.value)}
          placeholder="Buscar usuário por e-mail"
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
        <div className="glass-card enter-section grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_auto]">
          <div className="sr-only" aria-hidden="true">
            <input type="text" name="admin_users_username_decoy" autoComplete="username" tabIndex={-1} />
            <input type="password" name="admin_users_password_decoy" autoComplete="current-password" tabIndex={-1} />
          </div>

          <Input
            type="text"
            name="admin_new_user_email_input"
            value={newUserEmail}
            onChange={(event) => setNewUserEmail(event.target.value)}
            placeholder="E-mail do novo usuário"
            className="glass-input"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="email"
          />

          <Input
            type="password"
            name="admin_new_user_password_input"
            value={newUserPassword}
            onChange={(event) => setNewUserPassword(event.target.value)}
            placeholder="Senha inicial"
            className="glass-input"
            autoComplete="new-password"
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
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {filteredUsers.map((user) => {
            const isSavingPassword = savingUserId == user.user_id;
            const isSavingAccess = savingAccessUserId == user.user_id;

            return (
              <div key={user.user_id} className="glass-card enter-item space-y-3 p-3">
                <div className="space-y-1">
                  <p className="truncate text-sm font-medium">{user.email ?? "Sem e-mail"}</p>
                  <p className="text-xs text-muted-foreground">Criado em {format(new Date(user.created_at), "dd/MM/yyyy HH:mm")}</p>
                  <p className="text-xs text-muted-foreground">
                    Último acesso: {user.last_sign_in_at ? format(new Date(user.last_sign_in_at), "dd/MM/yyyy HH:mm") : "Sem acesso"}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 border-y border-border/45 py-2">
                  <span className="text-xs text-muted-foreground">Acesso</span>
                  <AppBadge tone={AppBadgeTone.NEUTRAL}>{resolveUserAccessLabel(user)}</AppBadge>
                </div>

                {canManageUsers ? (
                  <div className="space-y-2">
                    <Select
                      value={accessValueByUserId[user.user_id] ?? resolveUserAccessValue(user)}
                      onValueChange={(value) =>
                        setAccessValueByUserId((currentAccessByUserId) => ({
                          ...currentAccessByUserId,
                          [user.user_id]: value,
                        }))
                      }
                    >
                      <SelectTrigger className="glass-input">
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
                      className="w-full bg-background/75"
                      disabled={isSavingAccess}
                      onClick={() => handleSaveUserAccess(user)}
                    >
                      {isSavingAccess ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shield className="mr-2 h-4 w-4" />}
                      Salvar acesso
                    </Button>
                  </div>
                ) : null}

                {canManageUsers ? (
                  <div className="space-y-2 border-t border-border/45 pt-2">
                    <Input
                      type="password"
                      name={`admin_user_password_${user.user_id}`}
                      placeholder="Nova senha"
                      value={passwordByUserId[user.user_id] ?? ""}
                      onChange={(event) =>
                        setPasswordByUserId((currentPasswordByUserId) => ({
                          ...currentPasswordByUserId,
                          [user.user_id]: event.target.value,
                        }))
                      }
                      className="glass-input"
                      autoComplete="new-password"
                    />

                    <Button
                      type="button"
                      onClick={() => handleSavePassword(user)}
                      className="w-full"
                      disabled={isSavingPassword}
                    >
                      {isSavingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Atualizar senha
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showProfileModal} onOpenChange={setShowProfileModal}>
        <DialogContent className="border-border/60 !bg-background/70 backdrop-blur-md shadow-[0_18px_45px_rgba(15,23,42,0.16)] sm:max-w-4xl">
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
