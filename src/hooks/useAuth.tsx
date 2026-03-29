import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { AdminPanelPermissionLevel, AdminPanelRole, AdminPanelTab } from "@/lib/enums";
import type { AdminTabPermissionByTab, CurrentUserAdminContext } from "@/lib/types";

const ROLE_REQUEST_TIMEOUT_IN_MILLISECONDS = 10000;

const DEFAULT_ADMIN_TAB_PERMISSIONS: AdminTabPermissionByTab = {
  [AdminPanelTab.MATCHES]: AdminPanelPermissionLevel.NONE,
  [AdminPanelTab.CONTROL]: AdminPanelPermissionLevel.NONE,
  [AdminPanelTab.TEAMS]: AdminPanelPermissionLevel.NONE,
  [AdminPanelTab.SPORTS]: AdminPanelPermissionLevel.NONE,
  [AdminPanelTab.EVENTS]: AdminPanelPermissionLevel.NONE,
  [AdminPanelTab.LOGS]: AdminPanelPermissionLevel.NONE,
  [AdminPanelTab.USERS]: AdminPanelPermissionLevel.NONE,
  [AdminPanelTab.ACCOUNT]: AdminPanelPermissionLevel.NONE,
  [AdminPanelTab.CHAMPIONSHIP_STATUS]: AdminPanelPermissionLevel.NONE,
  [AdminPanelTab.SETTINGS]: AdminPanelPermissionLevel.NONE,
};

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

function resolveAdminTabPermissionsFromContext(context: CurrentUserAdminContext | null): AdminTabPermissionByTab {
  if (!context) {
    return DEFAULT_ADMIN_TAB_PERMISSIONS;
  }

  const fallbackChampionshipStatusPermission = isAdminPanelPermissionLevel(context.championship_status_permission)
    ? context.championship_status_permission
    : isAdminPanelPermissionLevel(context.settings_permission)
      ? context.settings_permission
      : AdminPanelPermissionLevel.NONE;

  return {
    [AdminPanelTab.MATCHES]: isAdminPanelPermissionLevel(context.matches_permission)
      ? context.matches_permission
      : AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.CONTROL]: isAdminPanelPermissionLevel(context.control_permission)
      ? context.control_permission
      : AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.TEAMS]: isAdminPanelPermissionLevel(context.teams_permission)
      ? context.teams_permission
      : AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.SPORTS]: isAdminPanelPermissionLevel(context.sports_permission)
      ? context.sports_permission
      : AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.EVENTS]: isAdminPanelPermissionLevel(context.events_permission)
      ? context.events_permission
      : AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.LOGS]: isAdminPanelPermissionLevel(context.logs_permission)
      ? context.logs_permission
      : AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.USERS]: isAdminPanelPermissionLevel(context.users_permission)
      ? context.users_permission
      : AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.ACCOUNT]: isAdminPanelPermissionLevel(context.account_permission)
      ? context.account_permission
      : AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.CHAMPIONSHIP_STATUS]: fallbackChampionshipStatusPermission,
    [AdminPanelTab.SETTINGS]: isAdminPanelPermissionLevel(context.settings_permission)
      ? context.settings_permission
      : AdminPanelPermissionLevel.NONE,
  };
}

function resolveCurrentUserAdminContext(
  data: CurrentUserAdminContext[] | CurrentUserAdminContext | null,
): CurrentUserAdminContext | null {
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }

  return data ?? null;
}

function canAccessAdminWithPermissions(adminTabPermissions: AdminTabPermissionByTab): boolean {
  return Object.values(adminTabPermissions).some(
    (adminPanelPermissionLevel) => adminPanelPermissionLevel != AdminPanelPermissionLevel.NONE,
  );
}

async function resolveWithTimeout<ResultType>(
  promise: PromiseLike<ResultType>,
  timeoutInMilliseconds: number,
): Promise<{ hasTimedOut: boolean; result: ResultType | null }> {
  let timeoutReference: number | null = null;

  try {
    return await Promise.race([
      promise.then((result) => ({ hasTimedOut: false, result })),
      new Promise<{ hasTimedOut: true; result: null }>((resolve) => {
        timeoutReference = window.setTimeout(() => {
          resolve({ hasTimedOut: true, result: null });
        }, timeoutInMilliseconds);
      }),
    ]);
  } finally {
    if (timeoutReference != null) {
      window.clearTimeout(timeoutReference);
    }
  }
}

interface AuthContextValue {
  user: User | null;
  role: AdminPanelRole | null;
  profileId: string | null;
  profileName: string | null;
  adminTabPermissions: AdminTabPermissionByTab;
  isAdmin: boolean;
  isEventos: boolean;
  isMesa: boolean;
  isCustomProfile: boolean;
  canAccessAdminPanel: boolean;
  canManageScoreboard: boolean;
  canViewAdminTab: (adminPanelTab: AdminPanelTab) => boolean;
  canEditAdminTab: (adminPanelTab: AdminPanelTab) => boolean;
  loading: boolean;
  roleLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: { message: string } | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AdminPanelRole | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [adminTabPermissions, setAdminTabPermissions] = useState<AdminTabPermissionByTab>(DEFAULT_ADMIN_TAB_PERMISSIONS);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  const lastResolvedRoleUserIdRef = useRef<string | null>(null);
  const resolvingRoleUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const resolveUserRole = async (currentUser: User | null) => {
      if (!currentUser) {
        lastResolvedRoleUserIdRef.current = null;
        resolvingRoleUserIdRef.current = null;
        setRole(null);
        setProfileId(null);
        setProfileName(null);
        setAdminTabPermissions(DEFAULT_ADMIN_TAB_PERMISSIONS);
        setRoleLoading(false);
        return;
      }

      if (
        lastResolvedRoleUserIdRef.current == currentUser.id ||
        resolvingRoleUserIdRef.current == currentUser.id
      ) {
        return;
      }

      resolvingRoleUserIdRef.current = currentUser.id;
      setRoleLoading(true);

      try {
        const { hasTimedOut, result } = await resolveWithTimeout(
          supabase.rpc("get_current_user_admin_context"),
          ROLE_REQUEST_TIMEOUT_IN_MILLISECONDS,
        );

        if (hasTimedOut || !result) {
          setRole(null);
          setProfileId(null);
          setProfileName(null);
          setAdminTabPermissions(DEFAULT_ADMIN_TAB_PERMISSIONS);
          lastResolvedRoleUserIdRef.current = currentUser.id;
          return;
        }

        const { data, error } = result;

        if (error) {
          setRole(null);
          setProfileId(null);
          setProfileName(null);
          setAdminTabPermissions(DEFAULT_ADMIN_TAB_PERMISSIONS);
          lastResolvedRoleUserIdRef.current = currentUser.id;
          return;
        }

        const currentUserAdminContext = resolveCurrentUserAdminContext(data);
        const normalizedRole =
          currentUserAdminContext?.role && isAdminPanelRole(currentUserAdminContext.role)
            ? currentUserAdminContext.role
            : null;

        setRole(normalizedRole);
        setProfileId(currentUserAdminContext?.profile_id ?? null);
        setProfileName(currentUserAdminContext?.profile_name ?? null);
        setAdminTabPermissions(resolveAdminTabPermissionsFromContext(currentUserAdminContext));

        lastResolvedRoleUserIdRef.current = currentUser.id;
      } catch (error) {
        console.error("Erro inesperado ao verificar perfil de acesso:", error);
        setRole(null);
        setProfileId(null);
        setProfileName(null);
        setAdminTabPermissions(DEFAULT_ADMIN_TAB_PERMISSIONS);
        lastResolvedRoleUserIdRef.current = currentUser.id;
      } finally {
        resolvingRoleUserIdRef.current = null;
        setRoleLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (!currentUser) {
        setRole(null);
        setProfileId(null);
        setProfileName(null);
        setAdminTabPermissions(DEFAULT_ADMIN_TAB_PERMISSIONS);
        setRoleLoading(false);
        setLoading(false);
        return;
      }

      if (event == "TOKEN_REFRESHED" && lastResolvedRoleUserIdRef.current == currentUser.id) {
        setLoading(false);
        return;
      }

      void resolveUserRole(currentUser);
      setLoading(false);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          console.error("Erro ao carregar sessão:", error.message);
          setUser(null);
          setRole(null);
          setProfileId(null);
          setProfileName(null);
          setAdminTabPermissions(DEFAULT_ADMIN_TAB_PERMISSIONS);
          setRoleLoading(false);
          return;
        }

        const currentUser = session?.user ?? null;
        setUser(currentUser);
        void resolveUserRole(currentUser);
      })
      .catch((error) => {
        console.error("Erro inesperado ao carregar sessão:", error);
        setUser(null);
        setRole(null);
        setProfileId(null);
        setProfileName(null);
        setAdminTabPermissions(DEFAULT_ADMIN_TAB_PERMISSIONS);
        setRoleLoading(false);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    } catch (error) {
      console.error("Erro inesperado no login:", error);
      return {
        error: {
          message: "Erro de conexão ao tentar autenticar.",
        },
      };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Erro inesperado no logout:", error);
    }
  };

  const canViewAdminTab = useCallback(
    (adminPanelTab: AdminPanelTab) => {
      return adminTabPermissions[adminPanelTab] != AdminPanelPermissionLevel.NONE;
    },
    [adminTabPermissions],
  );

  const canEditAdminTab = useCallback(
    (adminPanelTab: AdminPanelTab) => {
      return adminTabPermissions[adminPanelTab] == AdminPanelPermissionLevel.EDIT;
    },
    [adminTabPermissions],
  );

  const isAdmin = role == AdminPanelRole.ADMIN;
  const isEventos = role == AdminPanelRole.EVENTOS;
  const isMesa = role == AdminPanelRole.MESA;
  const isCustomProfile = !isAdmin && !isEventos && !isMesa && profileId != null;
  const canAccessAdminPanel = canAccessAdminWithPermissions(adminTabPermissions);
  const canManageScoreboard = canEditAdminTab(AdminPanelTab.CONTROL);

  const value = useMemo(
    () => ({
      user,
      role,
      profileId,
      profileName,
      adminTabPermissions,
      isAdmin,
      isEventos,
      isMesa,
      isCustomProfile,
      canAccessAdminPanel,
      canManageScoreboard,
      canViewAdminTab,
      canEditAdminTab,
      loading,
      roleLoading,
      signIn,
      signOut,
    }),
    [
      user,
      role,
      profileId,
      profileName,
      adminTabPermissions,
      isAdmin,
      isEventos,
      isMesa,
      isCustomProfile,
      canAccessAdminPanel,
      canManageScoreboard,
      canViewAdminTab,
      canEditAdminTab,
      loading,
      roleLoading,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }

  return context;
}
