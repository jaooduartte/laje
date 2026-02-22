import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const resolveAdminRole = async (currentUser: User | null) => {
      if (!currentUser) {
        setIsAdmin(false);
        return;
      }

      try {
        const { data, error } = await supabase.rpc('is_admin');

        if (error) {
          console.error('Erro ao verificar permissão de admin:', error.message);
          setIsAdmin(false);
          return;
        }

        setIsAdmin(!!data);
      } catch (error) {
        console.error('Erro inesperado ao verificar permissão de admin:', error);
        setIsAdmin(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      await resolveAdminRole(currentUser);
      setLoading(false);
    });

    supabase.auth
      .getSession()
      .then(async ({ data: { session }, error }) => {
        if (error) {
          console.error('Erro ao carregar sessão:', error.message);
          setUser(null);
          setIsAdmin(false);
          return;
        }

        const currentUser = session?.user ?? null;
        setUser(currentUser);
        await resolveAdminRole(currentUser);
      })
      .catch((error) => {
        console.error('Erro inesperado ao carregar sessão:', error);
        setUser(null);
        setIsAdmin(false);
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

  return { user, isAdmin, loading, signIn, signOut };
}
