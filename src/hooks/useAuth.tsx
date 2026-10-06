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
import { isAwsBackendEnabled } from "@/config/environment";
import { AdminLoginStateDTO } from "@/domain/admin-users/AdminUserDTO";
import type { AdminLoginState } from "@/domain/admin-users/adminUser.types";
import {
  changeDedicatedPassword,
  createDedicatedSession,
  deleteDedicatedSession,
  refreshDedicatedSession,
  resolveDedicatedLoginState,
  setupDedicatedPassword,
  type DedicatedAuthSession,
  type DedicatedAuthUser,
} from "@/integrations/laje-api/auth";
import { LajeApiError } from "@/integrations/laje-api/client";
import { supabase } from "@/integrations/supabase/client";
import { AdminPanelPermissionLevel, AdminPanelRole, AdminPanelTab } from "@/lib/enums";
import type { AdminTabPermissionByTab, CurrentUserAdminContext } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

const ROLE_REQUEST_TIMEOUT_IN_MILLISECONDS = 10000;
const DEDICATED_SESSION_REFRESH_INTERVAL_IN_MILLISECONDS = 15 * 60 * 1000;

const DEFAULT_ADMIN_TAB_PERMISSIONS: AdminTabPermissionByTab = {
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
  [AdminPanelTab.OPENING_CEREMONY_BONUS]: AdminPanelPermissionLevel.NONE,
};

const INHERITED_MATCHES_TABS = new Set<AdminPanelTab>([
  AdminPanelTab.BRACKET_SETUP,
  AdminPanelTab.INDIVIDUAL_EVENTS,
  AdminPanelTab.STANDINGS,
  AdminPanelTab.CHAMPIONSHIP_SCHEDULE,
]);

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

function resolveAdminTabPermissionsFromContext(
  context: CurrentUserAdminContext | null,
): AdminTabPermissionByTab {
  if (!context) {
    return DEFAULT_ADMIN_TAB_PERMISSIONS;
  }

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
    [AdminPanelTab.BRACKET_SETUP]: fallbackMatchesPermission,
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

function resolveAdminTabPermissionsFromDedicatedUser(
  user: DedicatedAuthUser,
): AdminTabPermissionByTab {
  const nextPermissions = { ...DEFAULT_ADMIN_TAB_PERMISSIONS };
  const permissionsByScope = new Map(user.permissions.map(({ scope, level }) => [scope, level]));
  const matchesPermission = permissionsByScope.get(AdminPanelTab.MATCHES);
  const fallbackMatchesPermission = isAdminPanelPermissionLevel(matchesPermission ?? null)
    ? matchesPermission
    : AdminPanelPermissionLevel.NONE;

  Object.values(AdminPanelTab).forEach((adminPanelTab) => {
    const permission = permissionsByScope.get(adminPanelTab);

    if (isAdminPanelPermissionLevel(permission ?? null)) {
      nextPermissions[adminPanelTab] = permission;
      return;
    }

    if (INHERITED_MATCHES_TABS.has(adminPanelTab)) {
      nextPermissions[adminPanelTab] = fallbackMatchesPermission;
    }
  });

  return nextPermissions;
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

export interface AuthenticatedAdminUser {
  id: string;
  email: string | null;
}

interface AuthOperationError {
  message: string;
}

interface AuthContextValue {
  user: AuthenticatedAdminUser | null;
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
  accessToken: string | null;
  authSource: "laje-api" | "supabase";
  resolveLoginState: (
    loginIdentifier: string,
  ) => Promise<{ data: AdminLoginState | null; error: AuthOperationError | null }>;
  setupPassword: (
    loginIdentifier: string,
    newPassword: string,
  ) => Promise<{ error: AuthOperationError | null }>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<{ error: AuthOperationError | null }>;
  signIn: (
    loginIdentifier: string,
    password: string,
  ) => Promise<{ error: AuthOperationError | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const usesDedicatedApi = isAwsBackendEnabled();
  const [user, setUser] = useState<AuthenticatedAdminUser | null>(null);
  const [role, setRole] = useState<AdminPanelRole | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [adminTabPermissions, setAdminTabPermissions] = useState<AdminTabPermissionByTab>(
    DEFAULT_ADMIN_TAB_PERMISSIONS,
  );
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  const lastResolvedRoleUserIdRef = useRef<string | null>(null);
  const resolvingRoleUserIdRef = useRef<string | null>(null);
  const roleResolutionTimeoutReference = useRef<number | null>(null);

  const clearAuthenticationState = useCallback(() => {
    setUser(null);
    setRole(null);
    setProfileId(null);
    setProfileName(null);
    setAdminTabPermissions(DEFAULT_ADMIN_TAB_PERMISSIONS);
    setAccessToken(null);
  }, []);

  const applyDedicatedSession = useCallback((session: DedicatedAuthSession) => {
    setUser({ id: session.user.id, email: session.user.email });
    setRole(isAdminPanelRole(session.user.role) ? session.user.role : null);
    setProfileId(session.user.profile?.id ?? null);
    setProfileName(session.user.profile?.name ?? null);
    setAdminTabPermissions(resolveAdminTabPermissionsFromDedicatedUser(session.user));
    setAccessToken(session.accessToken);
  }, []);

  useEffect(() => {
    if (usesDedicatedApi) {
      let isMounted = true;

      const refreshSession = async () => {
        try {
          const session = await refreshDedicatedSession();
          if (isMounted) {
            applyDedicatedSession(session);
          }
        } catch (error) {
          if (isMounted) {
            clearAuthenticationState();
          }

          if (!(error instanceof LajeApiError && error.statusCode === 401)) {
            console.error("Erro ao restaurar sessão administrativa pela laje-api:", error);
          }
        } finally {
          if (isMounted) {
            setLoading(false);
            setRoleLoading(false);
          }
        }
      };

      setLoading(true);
      setRoleLoading(true);
      void refreshSession();

      const refreshInterval = window.setInterval(
        () => void refreshSession(),
        DEDICATED_SESSION_REFRESH_INTERVAL_IN_MILLISECONDS,
      );

      return () => {
        isMounted = false;
        window.clearInterval(refreshInterval);
      };
    }

    const resolveUserRole = async (currentUser: User | null) => {
      if (!currentUser) {
        lastResolvedRoleUserIdRef.current = null;
        resolvingRoleUserIdRef.current = null;
        clearAuthenticationState();
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

    const clearScheduledRoleResolution = () => {
      if (roleResolutionTimeoutReference.current == null) {
        return;
      }

      window.clearTimeout(roleResolutionTimeoutReference.current);
      roleResolutionTimeoutReference.current = null;
    };

    const scheduleUserRoleResolution = (currentUser: User | null) => {
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
      setUser(currentUser ? { id: currentUser.id, email: currentUser.email ?? null } : null);

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
          clearAuthenticationState();
          setRoleLoading(false);
          return;
        }

        const currentUser = session?.user ?? null;
        setUser(currentUser ? { id: currentUser.id, email: currentUser.email ?? null } : null);
        void resolveUserRole(currentUser);
      })
      .catch((error) => {
        console.error("Erro inesperado ao carregar sessão:", error);
        clearAuthenticationState();
        setRoleLoading(false);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      clearScheduledRoleResolution();
      subscription.unsubscribe();
    };
  }, [applyDedicatedSession, clearAuthenticationState, usesDedicatedApi]);

  const resolveLoginState = useCallback(
    async (loginIdentifier: string) => {
      try {
        if (usesDedicatedApi) {
          return {
            data: await resolveDedicatedLoginState(loginIdentifier),
            error: null,
          };
        }

        const { data, error } = await supabase.rpc("resolve_admin_login_state", {
          _login_identifier: loginIdentifier.trim().toLowerCase(),
        });

        if (error) {
          return { data: null, error: { message: error.message } };
        }

        const loginStateRow = data?.[0] ?? null;
        return {
          data: loginStateRow ? AdminLoginStateDTO.fromResponse(loginStateRow).bindToRead() : null,
          error: null,
        };
      } catch (error) {
        return {
          data: null,
          error: {
            message:
              error instanceof Error ? error.message : "Não foi possível localizar o usuário.",
          },
        };
      }
    },
    [usesDedicatedApi],
  );

  const signIn = useCallback(
    async (loginIdentifier: string, password: string) => {
      try {
        if (usesDedicatedApi) {
          applyDedicatedSession(await createDedicatedSession(loginIdentifier, password));
          return { error: null };
        }

        const { data, error: loginStateError } = await supabase.rpc("resolve_admin_login_state", {
          _login_identifier: loginIdentifier.trim().toLowerCase(),
        });
        const authEmail = data?.[0]?.auth_email;

        if (loginStateError || !authEmail) {
          return { error: { message: loginStateError?.message ?? "Usuário não encontrado." } };
        }

        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password,
        });

        if (!error) {
          const { error: loginActionError } = await supabase.rpc("register_admin_login_action");
          if (loginActionError) {
            console.error("Erro ao registrar login administrativo:", loginActionError.message);
          }
        }

        return { error: error ? { message: error.message } : null };
      } catch (error) {
        console.error("Erro inesperado no login:", error);
        return {
          error: {
            message:
              error instanceof Error ? error.message : "Erro de conexão ao tentar autenticar.",
          },
        };
      }
    },
    [applyDedicatedSession, usesDedicatedApi],
  );

  const setupPassword = useCallback(
    async (loginIdentifier: string, newPassword: string) => {
      try {
        if (usesDedicatedApi) {
          applyDedicatedSession(await setupDedicatedPassword(loginIdentifier, newPassword));
          return { error: null };
        }

        const { data, error: passwordSetupError } = await supabase.rpc(
          "complete_admin_user_password_setup",
          {
            _login_identifier: loginIdentifier.trim().toLowerCase(),
            _new_password: newPassword,
          },
        );

        if (passwordSetupError || !data) {
          return {
            error: {
              message:
                passwordSetupError?.message ?? "Não foi possível concluir a criação da senha.",
            },
          };
        }

        const { error } = await supabase.auth.signInWithPassword({
          email: data,
          password: newPassword,
        });
        return { error: error ? { message: error.message } : null };
      } catch (error) {
        return {
          error: {
            message:
              error instanceof Error
                ? error.message
                : "Não foi possível concluir a criação da senha.",
          },
        };
      }
    },
    [applyDedicatedSession, usesDedicatedApi],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      try {
        if (!usesDedicatedApi || !accessToken) {
          return {
            error: { message: "A troca de senha dedicada não está disponível nesta sessão." },
          };
        }

        await changeDedicatedPassword(accessToken, currentPassword, newPassword);
        return { error: null };
      } catch (error) {
        return {
          error: {
            message: error instanceof Error ? error.message : "Não foi possível alterar a senha.",
          },
        };
      }
    },
    [accessToken, usesDedicatedApi],
  );

  const signOut = useCallback(async () => {
    if (usesDedicatedApi) {
      try {
        if (accessToken) {
          await deleteDedicatedSession(accessToken);
        }
      } catch (error) {
        console.error("Erro ao encerrar sessão administrativa pela laje-api:", error);
      } finally {
        clearAuthenticationState();
      }
      return;
    }

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Erro inesperado no logout:", error);
    } finally {
      clearAuthenticationState();
    }
  }, [accessToken, clearAuthenticationState, usesDedicatedApi]);

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

  const value = useMemo<AuthContextValue>(
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
      accessToken,
      authSource: usesDedicatedApi ? "laje-api" : "supabase",
      resolveLoginState,
      setupPassword,
      changePassword,
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
      accessToken,
      usesDedicatedApi,
      resolveLoginState,
      setupPassword,
      changePassword,
      signIn,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }

  return context;
}
