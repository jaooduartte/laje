import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Sport } from '@/lib/types';

export function useSports() {
  const [sports, setSports] = useState<Sport[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSports = async () => {
    const { data } = await supabase.from('sports').select('*').order('name');
    if (data) setSports(data as Sport[]);
    setLoading(false);
  };

  useEffect(() => { fetchSports(); }, []);

  return { sports, loading, refetch: fetchSports };
}
