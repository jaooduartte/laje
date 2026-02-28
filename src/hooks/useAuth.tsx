import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';
import { AdminPanelRole } from '@/lib/enums';

const ROLE_REQUEST_TIMEOUT_IN_MILLISECONDS = 10000;

function isAdminPanelRole(value: string | null): value is AdminPanelRole {
  return value == AdminPanelRole.ADMIN || value == AdminPanelRole.MESA;
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
  isAdmin: boolean;
  isMesa: boolean;
  canAccessAdminPanel: boolean;
  canManageScoreboard: boolean;
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
          supabase.rpc('get_current_user_role'),
          ROLE_REQUEST_TIMEOUT_IN_MILLISECONDS,
        );

        if (hasTimedOut || !result) {
          setRole(null);
          lastResolvedRoleUserIdRef.current = currentUser.id;
          return;
        }

        const { data, error } = result;

        if (error) {
          console.error('Erro ao verificar perfil de acesso:', error.message);
          setRole(null);
          lastResolvedRoleUserIdRef.current = currentUser.id;
          return;
        }

        setRole(isAdminPanelRole(data) ? data : null);
        lastResolvedRoleUserIdRef.current = currentUser.id;
      } catch (error) {
        console.error('Erro inesperado ao verificar perfil de acesso:', error);
        setRole(null);
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
        setRoleLoading(false);
        setLoading(false);
        return;
      }

      // TOKEN_REFRESHED não altera papel do usuário; evita RPC em loop.
      if (event == 'TOKEN_REFRESHED' && lastResolvedRoleUserIdRef.current == currentUser.id) {
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
          console.error('Erro ao carregar sessão:', error.message);
          setUser(null);
          setRole(null);
          setRoleLoading(false);
          return;
        }

        const currentUser = session?.user ?? null;
        setUser(currentUser);
        void resolveUserRole(currentUser);
      })
      .catch((error) => {
        console.error('Erro inesperado ao carregar sessão:', error);
        setUser(null);
        setRole(null);
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
      console.error('Erro inesperado no login:', error);
      return {
        error: {
          message: 'Erro de conexão ao tentar autenticar.',
        },
      };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Erro inesperado no logout:', error);
    }
  };

  const isAdmin = role == AdminPanelRole.ADMIN;
  const isMesa = role == AdminPanelRole.MESA;
  const canAccessAdminPanel = isAdmin || isMesa;
  const canManageScoreboard = isAdmin || isMesa;

  const value = useMemo(
    () => ({
      user,
      role,
      isAdmin,
      isMesa,
      canAccessAdminPanel,
      canManageScoreboard,
      loading,
      roleLoading,
      signIn,
      signOut,
    }),
    [canAccessAdminPanel, canManageScoreboard, isAdmin, isMesa, loading, role, roleLoading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  }

  return context;
}
