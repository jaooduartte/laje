import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Standing } from '@/lib/types';

export function useStandings() {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStandings = async () => {
    const { data } = await supabase
      .from('standings')
      .select('*, teams(*), sports(*)')
      .order('points', { ascending: false })
      .order('goal_diff', { ascending: false })
      .order('goals_for', { ascending: false });
    if (data) setStandings(data as unknown as Standing[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchStandings();

    const channel = supabase
      .channel('standings-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'standings' }, () => {
        fetchStandings();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { standings, loading, refetch: fetchStandings };
}
