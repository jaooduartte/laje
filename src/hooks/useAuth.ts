import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';
import { AdminPanelRole } from '@/lib/enums';

const ROLE_REQUEST_TIMEOUT_IN_MILLISECONDS = 10000;

function isAdminPanelRole(value: string | null): value is AdminPanelRole {
  return value == AdminPanelRole.ADMIN || value == AdminPanelRole.MESA;
}

async function resolveWithTimeout<ResultType>(
  promise: Promise<ResultType>,
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

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AdminPanelRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    const resolveUserRole = async (currentUser: User | null) => {
      if (!currentUser) {
        setRole(null);
        setRoleLoading(false);
        return;
      }

      setRoleLoading(true);

      try {
        const { hasTimedOut, result } = await resolveWithTimeout(
          supabase.rpc('get_current_user_role'),
          ROLE_REQUEST_TIMEOUT_IN_MILLISECONDS,
        );

        if (hasTimedOut || !result) {
          setRole(null);
          return;
        }

        const { data, error } = result;

        if (error) {
          console.error('Erro ao verificar perfil de acesso:', error.message);
          setRole(null);
          return;
        }

        setRole(isAdminPanelRole(data) ? data : null);
      } catch (error) {
        console.error('Erro inesperado ao verificar perfil de acesso:', error);
        setRole(null);
      } finally {
        setRoleLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
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

  return {
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
  };
}
