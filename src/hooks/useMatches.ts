import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Match } from '@/lib/types';

export function useMatches() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMatches = async () => {
    const { data } = await supabase
      .from('matches')
      .select('*, sports(*), home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)')
      .order('start_time', { ascending: true });
    if (data) setMatches(data as unknown as Match[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchMatches();

    const channel = supabase
      .channel('matches-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        fetchMatches();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const liveMatches = matches.filter(m => m.status === 'LIVE');
  const upcomingMatches = matches.filter(m => m.status === 'SCHEDULED');
  const finishedMatches = matches.filter(m => m.status === 'FINISHED');

  return { matches, liveMatches, upcomingMatches, finishedMatches, loading, refetch: fetchMatches };
}
