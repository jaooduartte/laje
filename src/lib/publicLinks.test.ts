import { describe, expect, it } from "vitest";
import { ChampionshipCode, ChampionshipStatus, PublicLinkFilterMode } from "@/lib/enums";
import { resolveAvailablePublicLinkFilterYears, resolveVisiblePublicLinkSections } from "@/lib/publicLinks";
import type { Championship, PublicLinkSection } from "@/lib/types";

const championshipClv: Championship = {
  id: "championship-clv",
  code: ChampionshipCode.CLV,
  name: "Copa Laje de Verão",
  status: ChampionshipStatus.FINISHED,
  current_season_year: 2026,
  uses_divisions: false,
  default_location: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

const championshipSociety: Championship = {
  id: "championship-society",
  code: ChampionshipCode.SOCIETY,
  name: "Copa Laje Society",
  status: ChampionshipStatus.IN_PROGRESS,
  current_season_year: 2026,
  uses_divisions: false,
  default_location: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

const publicLinkSections: PublicLinkSection[] = [
  {
    id: "section-1",
    name: "Fotos gerais",
    description: null,
    sort_order: 0,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    public_link_items: [
      {
        id: "item-global",
        section_id: "section-1",
        display_name: "Galeria permanente",
        url: "https://example.com/galeria",
        sort_order: 0,
        is_active: true,
        filter_mode: PublicLinkFilterMode.GLOBAL,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        public_link_item_filters: [],
      },
    ],
  },
  {
    id: "section-2",
    name: "Fotos filtradas",
    description: null,
    sort_order: 1,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    public_link_items: [
      {
        id: "item-filtered",
        section_id: "section-2",
        display_name: "Final CLV 2025",
        url: "https://example.com/final-clv-2025",
        sort_order: 0,
        is_active: true,
        filter_mode: PublicLinkFilterMode.BY_CHAMPIONSHIP_YEAR,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        public_link_item_filters: [
          {
            id: "filter-1",
            public_link_item_id: "item-filtered",
            championship_id: championshipClv.id,
            season_year: 2025,
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "filter-2",
            public_link_item_id: "item-filtered",
            championship_id: championshipSociety.id,
            season_year: 2026,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    ],
  },
];

describe("publicLinks helpers", () => {
  it("mantém links com vínculo visíveis quando não há filtro aplicado", () => {
    const visibleSections = resolveVisiblePublicLinkSections(publicLinkSections, {
      championshipId: "ALL",
      seasonYear: "ALL",
    });

    expect(visibleSections).toHaveLength(2);
    expect(visibleSections[0]?.public_link_items?.[0]?.display_name).toBe("Galeria permanente");
    expect(visibleSections[1]?.public_link_items?.[0]?.display_name).toBe("Final CLV 2025");
  });

  it("mantém links globais visíveis mesmo quando há filtro aplicado", () => {
    const visibleSections = resolveVisiblePublicLinkSections(publicLinkSections, {
      championshipId: championshipClv.id,
      seasonYear: "2025",
    });

    expect(visibleSections).toHaveLength(2);
    expect(visibleSections[0]?.public_link_items?.[0]?.display_name).toBe("Galeria permanente");
    expect(visibleSections[1]?.public_link_items?.[0]?.display_name).toBe("Final CLV 2025");
  });

  it("oculta seção quando nenhum link filtrado combina com campeonato e ano", () => {
    const visibleSections = resolveVisiblePublicLinkSections(publicLinkSections, {
      championshipId: championshipClv.id,
      seasonYear: "2024",
    });

    expect(visibleSections).toHaveLength(1);
    expect(visibleSections[0]?.name).toBe("Fotos gerais");
  });

  it("lista anos disponíveis respeitando o campeonato selecionado", () => {
    expect(resolveAvailablePublicLinkFilterYears(publicLinkSections, "ALL")).toEqual([2026, 2025]);
    expect(resolveAvailablePublicLinkFilterYears(publicLinkSections, championshipClv.id)).toEqual([2025]);
    expect(resolveAvailablePublicLinkFilterYears(publicLinkSections, championshipSociety.id)).toEqual([2026]);
  });
});
