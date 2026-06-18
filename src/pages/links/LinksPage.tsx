import { useChampionships } from "@/hooks/useChampionships";
import { usePublicLinkSections } from "@/hooks/usePublicLinkSections";
import { LinksPageView } from "@/pages/links/LinksPageView";

export function LinksPage() {
  const { championships, loading: championshipsLoading } = useChampionships();
  const { publicLinkSections, loading: publicLinkSectionsLoading } = usePublicLinkSections();

  return (
    <LinksPageView
      championships={championships}
      publicLinkSections={publicLinkSections}
      loading={championshipsLoading || publicLinkSectionsLoading}
    />
  );
}
