import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Team } from '@/lib/types';

export function useTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTeams = async () => {
    const { data } = await supabase.from('teams').select('*').order('name');
    if (data) setTeams(data as Team[]);
    setLoading(false);
  };

  useEffect(() => { fetchTeams(); }, []);

  return { teams, loading, refetch: fetchTeams };
}
