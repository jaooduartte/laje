import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  createDedicatedSession,
  deleteDedicatedSession,
  isDedicatedAuthEnabled,
  LajeApiAuthError,
  refreshDedicatedSession,
  resolveDedicatedLoginState,
  setupDedicatedPassword,
  type DedicatedAuthUser,
} from "@/integrations/laje-api/auth";
import {
  AdminPanelPermissionLevel,
  AdminPanelRole,
  AdminPanelTab,
  AdminUserPasswordStatus,
} from "@/lib/enums";
import type { AdminTabPermissionByTab, CurrentUserAdminContext } from "@/lib/types";
import type { AdminLoginState } from "@/domain/admin-users/adminUser.types";

const ROLE_REQUEST_TIMEOUT_IN_MILLISECONDS = 10000;

export interface AuthUserIdentity {
  id: string;
  email?: string | null;
}

const DEFAULT_ADMIN_TAB_PERMISSIONS: AdminTabPermissionByTab = {
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
  [AdminPanelTab.OPENING_CEREMONY_BONUS]: AdminPanelPermissionLevel.NONE,
};

function isAdminPanelRole(value: string | null): value is AdminPanelRole {
  return (
    value == AdminPanelRole.ADMIN || value == AdminPanelRole.EVENTOS || value == AdminPanelRole.MESA
  );
}

function isAdminPanelPermissionLevel(value: string | null): value is AdminPanelPermissionLevel {
  return (
    value == AdminPanelPermissionLevel.NONE ||
    value == AdminPanelPermissionLevel.VIEW ||
    value == AdminPanelPermissionLevel.EDIT
  );
}

function isAdminPanelTab(value: string): value is AdminPanelTab {
  return Object.values(AdminPanelTab).includes(value as AdminPanelTab);
}

function resolveAdminTabPermissionsFromApi(user: DedicatedAuthUser): AdminTabPermissionByTab {
  const permissions = { ...DEFAULT_ADMIN_TAB_PERMISSIONS };
  for (const permission of user.permissions) {
    if (
      isAdminPanelTab(permission.scope) &&
      isAdminPanelPermissionLevel(permission.level)
    ) {
      permissions[permission.scope] = permission.level;
    }
  }
  return permissions;
}

function resolveAdminTabPermissionsFromContext(
  context: CurrentUserAdminContext | null,
): AdminTabPermissionByTab {
  if (!context) return DEFAULT_ADMIN_TAB_PERMISSIONS;

  const fallbackChampionshipStatusPermission = isAdminPanelPermissionLevel(
    context.championship_status_permission,
  )
    ? context.championship_status_permission
    : isAdminPanelPermissionLevel(context.settings_permission)
      ? context.settings_permission
      : AdminPanelPermissionLevel.NONE;
  const fallbackMatchesPermission = isAdminPanelPermissionLevel(context.matches_permission)
    ? context.matches_permission
    : AdminPanelPermissionLevel.NONE;

  return {
    [AdminPanelTab.MATCHES]: fallbackMatchesPermission,
    [AdminPanelTab.CONTROL]: isAdminPanelPermissionLevel(context.control_permission)
      ? context.control_permission
      : AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.INDIVIDUAL_EVENTS]: isAdminPanelPermissionLevel(
      context.individual_events_permission ?? null,
    )
      ? context.individual_events_permission!
      : fallbackMatchesPermission,
    [AdminPanelTab.TEAMS]: isAdminPanelPermissionLevel(context.teams_permission)
      ? context.teams_permission
      : AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.SPORTS]: isAdminPanelPermissionLevel(context.sports_permission)
      ? context.sports_permission
      : AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.EVENTS]: isAdminPanelPermissionLevel(context.events_permission)
      ? context.events_permission
      : AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.LINKS]: isAdminPanelPermissionLevel(context.links_permission ?? null)
      ? context.links_permission!
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
    [AdminPanelTab.STANDINGS]: isAdminPanelPermissionLevel(context.standings_permission ?? null)
      ? context.standings_permission!
      : fallbackMatchesPermission,
    [AdminPanelTab.CHAMPIONSHIP_STATUS]: fallbackChampionshipStatusPermission,
    [AdminPanelTab.SETTINGS]: isAdminPanelPermissionLevel(context.settings_permission)
      ? context.settings_permission
      : AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.SCORE_SHEET_REVIEW]: isAdminPanelPermissionLevel(
      context.score_sheet_review_permission,
    )
      ? context.score_sheet_review_permission
      : AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.TIE_BREAKS]: isAdminPanelPermissionLevel(context.tie_breaks_permission)
      ? context.tie_breaks_permission
      : AdminPanelPermissionLevel.NONE,
    [AdminPanelTab.CHAMPIONSHIP_SCHEDULE]: isAdminPanelPermissionLevel(
      context.championship_schedule_permission ?? null,
    )
      ? context.championship_schedule_permission!
      : fallbackMatchesPermission,
    [AdminPanelTab.OPENING_CEREMONY_BONUS]: isAdminPanelPermissionLevel(
      context.opening_ceremony_bonus_permission ?? null,
    )
      ? context.opening_ceremony_bonus_permission!
      : AdminPanelPermissionLevel.NONE,
  };
}

function resolveCurrentUserAdminContext(
  data: CurrentUserAdminContext[] | CurrentUserAdminContext | null,
): CurrentUserAdminContext | null {
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

function canAccessAdminWithPermissions(adminTabPermissions: AdminTabPermissionByTab): boolean {
  return Object.values(adminTabPermissions).some(
    (level) => level != AdminPanelPermissionLevel.NONE,
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
        timeoutReference = window.setTimeout(
          () => resolve({ hasTimedOut: true, result: null }),
          timeoutInMilliseconds,
        );
      }),
    ]);
  } finally {
    if (timeoutReference != null) window.clearTimeout(timeoutReference);
  }
}

interface AuthContextValue {
  user: AuthUserIdentity | null;
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
  signIn: (identifier: string, password: string) => Promise<{ error: { message: string } | null }>;
  signOut: () => Promise<void>;
  resolveLoginState: (
    loginIdentifier: string,
  ) => Promise<{ data: AdminLoginState | null; error: { message: string } | null }>;
  completePasswordSetup: (
    loginIdentifier: string,
    newPassword: string,
  ) => Promise<{ error: { message: string } | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserIdentity | null>(null);
  const [role, setRole] = useState<AdminPanelRole | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [adminTabPermissions, setAdminTabPermissions] = useState<AdminTabPermissionByTab>(
    DEFAULT_ADMIN_TAB_PERMISSIONS,
  );
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  const lastResolvedRoleUserIdRef = useRef<string | null>(null);
  const resolvingRoleUserIdRef = useRef<string | null>(null);
  const roleResolutionTimeoutReference = useRef<number | null>(null);

  const resetAuthState = useCallback(() => {
    setUser(null);
    setRole(null);
    setProfileId(null);
    setProfileName(null);
    setAdminTabPermissions(DEFAULT_ADMIN_TAB_PERMISSIONS);
    setRoleLoading(false);
    lastResolvedRoleUserIdRef.current = null;
    resolvingRoleUserIdRef.current = null;
  }, []);

  const applyDedicatedUser = useCallback((apiUser: DedicatedAuthUser) => {
    setUser({ id: apiUser.id, email: apiUser.email });
    setRole(apiUser.role && isAdminPanelRole(apiUser.role) ? apiUser.role : null);
    setProfileId(apiUser.profile?.id ?? null);
    setProfileName(apiUser.profile?.name ?? null);
    setAdminTabPermissions(resolveAdminTabPermissionsFromApi(apiUser));
    setRoleLoading(false);
  }, []);

  useEffect(() => {
    if (isDedicatedAuthEnabled()) {
      setRoleLoading(true);
      refreshDedicatedSession()
        .then((session) => applyDedicatedUser(session.user))
        .catch((error) => {
          if (!(error instanceof LajeApiAuthError && error.status === 401)) {
            console.error("Erro ao restaurar sessão da laje-api:", error);
          }
          resetAuthState();
        })
        .finally(() => setLoading(false));
      return;
    }

    const resolveUserRole = async (currentUser: AuthUserIdentity | null) => {
      if (!currentUser) {
        resetAuthState();
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
        if (hasTimedOut || !result || result.error) {
          setRole(null);
          setProfileId(null);
          setProfileName(null);
          setAdminTabPermissions(DEFAULT_ADMIN_TAB_PERMISSIONS);
          lastResolvedRoleUserIdRef.current = currentUser.id;
          return;
        }

        const context = resolveCurrentUserAdminContext(result.data);
        setRole(context?.role && isAdminPanelRole(context.role) ? context.role : null);
        setProfileId(context?.profile_id ?? null);
        setProfileName(context?.profile_name ?? null);
        setAdminTabPermissions(resolveAdminTabPermissionsFromContext(context));
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

    const clearScheduledRoleResolution = () => {
      if (roleResolutionTimeoutReference.current != null) {
        window.clearTimeout(roleResolutionTimeoutReference.current);
        roleResolutionTimeoutReference.current = null;
      }
    };

    const scheduleUserRoleResolution = (currentUser: AuthUserIdentity | null) => {
      clearScheduledRoleResolution();
      if (!currentUser) {
        void resolveUserRole(null);
        return;
      }
      if (
        lastResolvedRoleUserIdRef.current == currentUser.id ||
        resolvingRoleUserIdRef.current == currentUser.id
      ) {
        return;
      }
      setRoleLoading(true);
      roleResolutionTimeoutReference.current = window.setTimeout(() => {
        roleResolutionTimeoutReference.current = null;
        void resolveUserRole(currentUser);
      }, 0);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (!currentUser) {
        scheduleUserRoleResolution(null);
        setLoading(false);
        return;
      }
      if (event == "TOKEN_REFRESHED" && lastResolvedRoleUserIdRef.current == currentUser.id) {
        setLoading(false);
        return;
      }
      scheduleUserRoleResolution(currentUser);
      setLoading(false);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          console.error("Erro ao carregar sessão:", error.message);
          resetAuthState();
          return;
        }
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        void resolveUserRole(currentUser);
      })
      .catch((error) => {
        console.error("Erro inesperado ao carregar sessão:", error);
        resetAuthState();
      })
      .finally(() => setLoading(false));

    return () => {
      clearScheduledRoleResolution();
      subscription.unsubscribe();
    };
  }, [applyDedicatedUser, resetAuthState]);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      try {
        if (isDedicatedAuthEnabled()) {
          const session = await createDedicatedSession(identifier, password);
          applyDedicatedUser(session.user);
          return { error: null };
        }

        const { error } = await supabase.auth.signInWithPassword({ email: identifier, password });
        if (!error) {
          const { error: auditError } = await supabase.rpc("register_admin_login_action");
          if (auditError) console.error("Erro ao registrar login administrativo:", auditError.message);
        }
        return { error };
      } catch (error) {
        console.error("Erro inesperado no login:", error);
        return {
          error: {
            message: error instanceof Error ? error.message : "Erro de conexão ao tentar autenticar.",
          },
        };
      }
    },
    [applyDedicatedUser],
  );

  const signOut = useCallback(async () => {
    try {
      if (isDedicatedAuthEnabled()) await deleteDedicatedSession();
      else await supabase.auth.signOut();
    } catch (error) {
      console.error("Erro inesperado no logout:", error);
    } finally {
      if (isDedicatedAuthEnabled()) resetAuthState();
    }
  }, [resetAuthState]);

  const resolveLoginState = useCallback(
    async (loginIdentifier: string) => {
      try {
        if (isDedicatedAuthEnabled()) {
          const state = await resolveDedicatedLoginState(loginIdentifier);
          return {
            data: {
              auth_email: "",
              login_identifier: state.loginIdentifier,
              password_status:
                state.passwordStatus === "ACTIVE"
                  ? AdminUserPasswordStatus.ACTIVE
                  : AdminUserPasswordStatus.PENDING,
            },
            error: null,
          };
        }

        const { data, error } = await supabase.rpc("resolve_admin_login_state", {
          _login_identifier: loginIdentifier,
        });
        const row = data?.[0] ?? null;
        return {
          data: row
            ? ({
                auth_email: row.auth_email,
                login_identifier: row.login_identifier,
                password_status: row.password_status,
              } as AdminLoginState)
            : null,
          error: error ? { message: error.message } : null,
        };
      } catch (error) {
        return {
          data: null,
          error: { message: error instanceof Error ? error.message : "Não foi possível localizar o usuário." },
        };
      }
    },
    [],
  );

  const completePasswordSetup = useCallback(
    async (loginIdentifier: string, newPassword: string) => {
      try {
        if (isDedicatedAuthEnabled()) {
          const session = await setupDedicatedPassword(loginIdentifier, newPassword);
          applyDedicatedUser(session.user);
          return { error: null };
        }

        const { data, error } = await supabase.rpc("complete_admin_user_password_setup", {
          _login_identifier: loginIdentifier,
          _new_password: newPassword,
        });
        if (error) return { error: { message: error.message } };
        if (!data) return { error: { message: "Não foi possível concluir a criação da senha." } };
        return signIn(data, newPassword);
      } catch (error) {
        return {
          error: {
            message:
              error instanceof Error ? error.message : "Não foi possível concluir a criação da senha.",
          },
        };
      }
    },
    [applyDedicatedUser, signIn],
  );

  const canViewAdminTab = useCallback(
    (adminPanelTab: AdminPanelTab) =>
      adminTabPermissions[adminPanelTab] != AdminPanelPermissionLevel.NONE,
    [adminTabPermissions],
  );
  const canEditAdminTab = useCallback(
    (adminPanelTab: AdminPanelTab) =>
      adminTabPermissions[adminPanelTab] == AdminPanelPermissionLevel.EDIT,
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
      resolveLoginState,
      completePasswordSetup,
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
      signIn,
      signOut,
      resolveLoginState,
      completePasswordSetup,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return context;
}
