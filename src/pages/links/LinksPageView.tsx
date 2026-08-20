import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { PublicLinkSectionsSkeleton } from "@/components/skeletons/PublicLinkSectionsSkeleton";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  resolveAvailablePublicLinkFilterChampionships,
  resolveAvailablePublicLinkFilterYears,
  resolveVisiblePublicLinkSections,
  CHAMPIONSHIP_CODE_LABELS,
} from "@/lib/publicLinks";
import type { Championship, PublicLinkSection } from "@/lib/types";

const ALL_PUBLIC_LINKS_FILTER_VALUE = "ALL";

interface LinksPageViewProps {
  championships: Championship[];
  publicLinkSections: PublicLinkSection[];
  loading?: boolean;
}

export function LinksPageView({
  championships,
  publicLinkSections,
  loading = false,
}: LinksPageViewProps) {
  const [selectedChampionshipId, setSelectedChampionshipId] = useState<string>(
    ALL_PUBLIC_LINKS_FILTER_VALUE,
  );
  const [selectedSeasonYear, setSelectedSeasonYear] = useState<string>(
    ALL_PUBLIC_LINKS_FILTER_VALUE,
  );

  const availableChampionships = useMemo(() => {
    return resolveAvailablePublicLinkFilterChampionships(
      publicLinkSections,
      championships,
    );
  }, [championships, publicLinkSections]);

  const availableSeasonYears = useMemo(() => {
    return resolveAvailablePublicLinkFilterYears(
      publicLinkSections,
      selectedChampionshipId,
    );
  }, [publicLinkSections, selectedChampionshipId]);

  useEffect(() => {
    if (selectedChampionshipId == ALL_PUBLIC_LINKS_FILTER_VALUE) {
      return;
    }

    if (
      !availableChampionships.some(
        (championship) => championship.id == selectedChampionshipId,
      )
    ) {
      setSelectedChampionshipId(ALL_PUBLIC_LINKS_FILTER_VALUE);
    }
  }, [availableChampionships, selectedChampionshipId]);

  useEffect(() => {
    if (selectedSeasonYear == ALL_PUBLIC_LINKS_FILTER_VALUE) {
      return;
    }

    if (
      !availableSeasonYears.some(
        (seasonYear) => String(seasonYear) == selectedSeasonYear,
      )
    ) {
      setSelectedSeasonYear(ALL_PUBLIC_LINKS_FILTER_VALUE);
    }
  }, [availableSeasonYears, selectedSeasonYear]);

  const visiblePublicLinkSections = useMemo(() => {
    return resolveVisiblePublicLinkSections(publicLinkSections, {
      championshipId: selectedChampionshipId,
      seasonYear: selectedSeasonYear,
    });
  }, [publicLinkSections, selectedChampionshipId, selectedSeasonYear]);

  return (
    <div className="app-page">
      <Header />

      <main className="container space-y-4 py-8">
        <section className="glass-panel p-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
          <div className="flex flex-col items-center justify-center gap-2">
            <h1 className="text-center text-2xl font-display font-bold">
              Links organizados por seção
            </h1>
            <p className="text-center text-sm text-muted-foreground">
              Consulte fotos, álbuns e materiais públicos por campeonato e ano,
              sem precisar navegar por URLs soltas.
            </p>
          </div>
        </section>

        <section className="glass-panel p-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              value={selectedChampionshipId}
              onValueChange={setSelectedChampionshipId}
            >
              <SelectTrigger className="app-input-field w-full">
                <SelectValue placeholder="Campeonato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PUBLIC_LINKS_FILTER_VALUE}>
                  Todos os campeonatos
                </SelectItem>
                {availableChampionships.map((championship) => (
                  <SelectItem key={championship.id} value={championship.id}>
                    {CHAMPIONSHIP_CODE_LABELS[championship.code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedSeasonYear}
              onValueChange={setSelectedSeasonYear}
            >
              <SelectTrigger className="app-input-field w-full">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PUBLIC_LINKS_FILTER_VALUE}>
                  Todos os anos
                </SelectItem>
                {availableSeasonYears.map((seasonYear) => (
                  <SelectItem key={seasonYear} value={String(seasonYear)}>
                    {seasonYear}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        {loading ? (
          <PublicLinkSectionsSkeleton count={4} />
        ) : visiblePublicLinkSections.length == 0 ? (
          <section className="glass-panel p-8 text-center">
            <p className="font-display text-xl font-semibold">
              Nenhum link disponível com esse filtro
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Ajuste o campeonato ou o ano para visualizar outras seções
              públicas.
            </p>
          </section>
        ) : (
          <section className="space-y-4">
            {visiblePublicLinkSections.map((publicLinkSection) => (
              <article
                key={publicLinkSection.id}
                className="glass-panel p-5 animate-in fade-in-0 slide-in-from-bottom-2 duration-500"
              >
                <div className="mb-5 space-y-2 text-center">
                  <h2 className="font-display text-xl font-semibold">
                    {publicLinkSection.name}
                  </h2>
                  {publicLinkSection.description ? (
                    <p className="text-sm text-muted-foreground">
                      {publicLinkSection.description}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap justify-center gap-3">
                  {(publicLinkSection.public_link_items ?? []).map(
                    (publicLinkItem) => (
                      <Button
                        key={publicLinkItem.id}
                        asChild
                        className="h-auto max-w-full rounded-xl px-4 py-3 text-left"
                      >
                        <a
                          href={publicLinkItem.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block max-w-full"
                        >
                          <span className="flex max-w-full items-center gap-2">
                            <span className="min-w-0 truncate">
                              {publicLinkItem.display_name}
                            </span>
                            <ExternalLink className="h-4 w-4 shrink-0" />
                          </span>
                        </a>
                      </Button>
                    ),
                  )}
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
