import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Team } from '@/lib/types';

export function useTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTeams = async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase.from("teams").select("*").order("name");

      if (error) {
        console.error("Erro ao carregar atléticas:", error.message);
        setTeams([]);
        return;
      }

      if (data) {
        setTeams(data as Team[]);
      }
    } catch (error) {
      console.error("Erro inesperado ao carregar atléticas:", error);
      setTeams([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
  }, []);

  return { teams, loading, refetch: fetchTeams };
}
