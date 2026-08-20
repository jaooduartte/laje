import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Team } from "@/lib/types";

interface UseTeamsOptions {
  includeInactive?: boolean;
  enabled?: boolean;
}

export function useTeams({
  includeInactive = false,
  enabled = true,
}: UseTeamsOptions = {}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTeams = useCallback(async () => {
    if (!enabled) {
      setLoading(true);
      return;
    }

    setLoading(true);

    try {
      let query = supabase.from("teams").select("*").order("name");

      if (!includeInactive) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query;

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
  }, [enabled, includeInactive]);

  useEffect(() => {
    if (!enabled) {
      setLoading(true);
      return;
    }

    void fetchTeams();
  }, [enabled, fetchTeams]);

  return { teams, loading, refetch: fetchTeams };
}
