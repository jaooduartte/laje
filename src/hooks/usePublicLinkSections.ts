import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sortPublicLinkSections } from "@/lib/publicLinks";
import type { PublicLinkSection } from "@/lib/types";

interface UsePublicLinkSectionsOptions {
  includeInactive?: boolean;
}

export function usePublicLinkSections({ includeInactive = false }: UsePublicLinkSectionsOptions = {}) {
  const [publicLinkSections, setPublicLinkSections] = useState<PublicLinkSection[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);

    try {
      let query = supabase
        .from("public_link_sections")
        .select("*, public_link_items(*, public_link_item_filters(*))");

      if (!includeInactive) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Erro ao carregar seções de links públicos:", error.message);
        setPublicLinkSections([]);
        return;
      }

      setPublicLinkSections(sortPublicLinkSections((data ?? []) as unknown as PublicLinkSection[]));
    } catch (error) {
      console.error("Erro inesperado ao carregar seções de links públicos:", error);
      setPublicLinkSections([]);
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    publicLinkSections,
    loading,
    refetch,
  };
}
