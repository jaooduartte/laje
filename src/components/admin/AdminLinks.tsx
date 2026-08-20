import { useMemo, useState } from "react";
import { AdminListSkeleton } from "@/components/skeletons/AdminListSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRightLeft,
  Copy,
  Link2,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePublicLinkSections } from "@/hooks/usePublicLinkSections";
import { CHAMPIONSHIP_CODE_LABELS } from "@/lib/championship";
import { PublicLinkFilterMode } from "@/lib/enums";
import {
  isValidPublicLinkUrl,
  PUBLIC_LINK_FILTER_MODE_LABELS,
  sortPublicLinkSections,
} from "@/lib/publicLinks";
import type {
  Championship,
  PublicLinkItem,
  PublicLinkSection,
} from "@/lib/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  championships: Championship[];
  canManageLinks?: boolean;
}

interface SectionDraft {
  id: string | null;
  name: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
}

interface LinkFilterDraft {
  id: string;
  championshipId: string;
  seasonYear: string;
}

interface ItemDraft {
  id: string | null;
  sectionId: string;
  displayName: string;
  url: string;
  sortOrder: string;
  isActive: boolean;
  filterMode: PublicLinkFilterMode;
  filters: LinkFilterDraft[];
}

interface MoveItemDialogState {
  item: PublicLinkItem;
  targetSectionId: string;
}

function resolveOrdinalLabel(order: number): string {
  return `${order}º`;
}

function resolveEmptySectionDraft(sortOrder = 1): SectionDraft {
  return {
    id: null,
    name: "",
    description: "",
    sortOrder: String(sortOrder),
    isActive: true,
  };
}

function resolveSectionDraftFromSection(
  publicLinkSection: PublicLinkSection,
): SectionDraft {
  return {
    id: publicLinkSection.id,
    name: publicLinkSection.name,
    description: publicLinkSection.description ?? "",
    sortOrder: String(publicLinkSection.sort_order),
    isActive: publicLinkSection.is_active,
  };
}

function createLinkFilterDraft(): LinkFilterDraft {
  return {
    id: crypto.randomUUID(),
    championshipId: "",
    seasonYear: "",
  };
}

function resolveEmptyItemDraft(sectionId: string): ItemDraft {
  return {
    id: null,
    sectionId,
    displayName: "",
    url: "",
    sortOrder: "1",
    isActive: true,
    filterMode: PublicLinkFilterMode.GLOBAL,
    filters: [createLinkFilterDraft()],
  };
}

function resolveItemDraftFromItem(publicLinkItem: PublicLinkItem): ItemDraft {
  return {
    id: publicLinkItem.id,
    sectionId: publicLinkItem.section_id,
    displayName: publicLinkItem.display_name,
    url: publicLinkItem.url,
    sortOrder: String(publicLinkItem.sort_order),
    isActive: publicLinkItem.is_active,
    filterMode: publicLinkItem.filter_mode,
    filters:
      publicLinkItem.filter_mode == PublicLinkFilterMode.BY_CHAMPIONSHIP_YEAR &&
      (publicLinkItem.public_link_item_filters?.length ?? 0) > 0
        ? (publicLinkItem.public_link_item_filters ?? []).map(
            (publicLinkItemFilter) => ({
              id: publicLinkItemFilter.id,
              championshipId: publicLinkItemFilter.championship_id,
              seasonYear: String(publicLinkItemFilter.season_year),
            }),
          )
        : [createLinkFilterDraft()],
  };
}

function resolveDuplicatedName(value: string): string {
  return `${value} (cópia)`;
}

export function AdminLinks({ championships, canManageLinks = false }: Props) {
  const { publicLinkSections, loading, refetch } = usePublicLinkSections({
    includeInactive: true,
  });
  const [isSectionDialogOpen, setIsSectionDialogOpen] = useState(false);
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [sectionDraft, setSectionDraft] = useState<SectionDraft>(
    resolveEmptySectionDraft(),
  );
  const [itemDraft, setItemDraft] = useState<ItemDraft | null>(null);
  const [savingSection, setSavingSection] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [duplicatingSectionId, setDuplicatingSectionId] = useState<
    string | null
  >(null);
  const [duplicatingItemId, setDuplicatingItemId] = useState<string | null>(
    null,
  );
  const [deletingSectionId, setDeletingSectionId] = useState<string | null>(
    null,
  );
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [movingItemId, setMovingItemId] = useState<string | null>(null);
  const [pendingDeleteSection, setPendingDeleteSection] =
    useState<PublicLinkSection | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] =
    useState<PublicLinkItem | null>(null);
  const [moveItemDialogState, setMoveItemDialogState] =
    useState<MoveItemDialogState | null>(null);

  const sortedPublicLinkSections = useMemo(() => {
    return sortPublicLinkSections(publicLinkSections);
  }, [publicLinkSections]);

  const sectionSortOrderOptions = useMemo(() => {
    const totalOptions = sectionDraft.id
      ? sortedPublicLinkSections.length
      : sortedPublicLinkSections.length + 1;

    return Array.from({ length: Math.max(totalOptions, 1) }, (_, index) => {
      const order = index + 1;

      return {
        value: String(order),
        label: resolveOrdinalLabel(order),
      };
    });
  }, [sectionDraft.id, sortedPublicLinkSections.length]);

  const itemSortOrderOptions = useMemo(() => {
    if (!itemDraft) {
      return [];
    }

    const selectedSection =
      sortedPublicLinkSections.find(
        (publicLinkSection) => publicLinkSection.id == itemDraft.sectionId,
      ) ?? null;
    const totalOptions = itemDraft.id
      ? (selectedSection?.public_link_items?.length ?? 1)
      : (selectedSection?.public_link_items?.length ?? 0) + 1;

    return Array.from({ length: Math.max(totalOptions, 1) }, (_, index) => {
      const order = index + 1;

      return {
        value: String(order),
        label: resolveOrdinalLabel(order),
      };
    });
  }, [itemDraft, sortedPublicLinkSections]);

  const championshipById = useMemo(() => {
    return championships.reduce<Record<string, Championship>>(
      (carry, championship) => {
        carry[championship.id] = championship;
        return carry;
      },
      {},
    );
  }, [championships]);

  const availableMoveTargetSections = useMemo(() => {
    if (!moveItemDialogState) {
      return [];
    }

    return sortedPublicLinkSections.filter(
      (publicLinkSection) =>
        publicLinkSection.id != moveItemDialogState.item.section_id,
    );
  }, [moveItemDialogState, sortedPublicLinkSections]);

  const buildItemFiltersPayload = (publicLinkItem: PublicLinkItem) => {
    return publicLinkItem.filter_mode ==
      PublicLinkFilterMode.BY_CHAMPIONSHIP_YEAR
      ? (publicLinkItem.public_link_item_filters ?? []).map(
          (publicLinkItemFilter) => ({
            championship_id: publicLinkItemFilter.championship_id,
            season_year: publicLinkItemFilter.season_year,
          }),
        )
      : [];
  };

  const resolveNextItemSortOrder = (sectionId: string) => {
    const selectedSection =
      sortedPublicLinkSections.find(
        (publicLinkSection) => publicLinkSection.id == sectionId,
      ) ?? null;
    return (selectedSection?.public_link_items?.length ?? 0) + 1;
  };

  const handleOpenCreateSectionDialog = () => {
    setSectionDraft(
      resolveEmptySectionDraft(sortedPublicLinkSections.length + 1),
    );
    setIsSectionDialogOpen(true);
  };

  const handleOpenEditSectionDialog = (
    publicLinkSection: PublicLinkSection,
  ) => {
    setSectionDraft(resolveSectionDraftFromSection(publicLinkSection));
    setIsSectionDialogOpen(true);
  };

  const handleOpenCreateItemDialog = (sectionId: string) => {
    const selectedSection =
      sortedPublicLinkSections.find(
        (publicLinkSection) => publicLinkSection.id == sectionId,
      ) ?? null;
    const nextSortOrder = (selectedSection?.public_link_items?.length ?? 0) + 1;

    setItemDraft({
      ...resolveEmptyItemDraft(sectionId),
      sortOrder: String(nextSortOrder),
    });
    setIsItemDialogOpen(true);
  };

  const handleOpenEditItemDialog = (publicLinkItem: PublicLinkItem) => {
    setItemDraft(resolveItemDraftFromItem(publicLinkItem));
    setIsItemDialogOpen(true);
  };

  const handleDuplicateSection = async (
    publicLinkSection: PublicLinkSection,
  ) => {
    if (!canManageLinks || duplicatingSectionId) {
      return;
    }

    setDuplicatingSectionId(publicLinkSection.id);

    try {
      const { data, error } = await supabase.rpc("upsert_public_link_section", {
        _section_id: null,
        _name: resolveDuplicatedName(publicLinkSection.name),
        _description: publicLinkSection.description,
        _sort_order: sortedPublicLinkSections.length + 1,
        _is_active: publicLinkSection.is_active,
      });

      if (error || !data) {
        toast.error(error?.message ?? "Não foi possível duplicar a seção.");
        return;
      }

      for (const publicLinkItem of publicLinkSection.public_link_items ?? []) {
        const { error: duplicateItemError } = await supabase.rpc(
          "upsert_public_link_item",
          {
            _item_id: null,
            _section_id: data,
            _display_name: publicLinkItem.display_name,
            _url: publicLinkItem.url,
            _sort_order: publicLinkItem.sort_order,
            _is_active: publicLinkItem.is_active,
            _filter_mode: publicLinkItem.filter_mode,
            _filters: buildItemFiltersPayload(publicLinkItem),
          },
        );

        if (duplicateItemError) {
          toast.error(duplicateItemError.message);
          return;
        }
      }

      toast.success("Seção duplicada.");
      await refetch();
    } finally {
      setDuplicatingSectionId(null);
    }
  };

  const handleDuplicateItem = async (publicLinkItem: PublicLinkItem) => {
    if (!canManageLinks || duplicatingItemId) {
      return;
    }

    setDuplicatingItemId(publicLinkItem.id);

    try {
      const { error } = await supabase.rpc("upsert_public_link_item", {
        _item_id: null,
        _section_id: publicLinkItem.section_id,
        _display_name: resolveDuplicatedName(publicLinkItem.display_name),
        _url: publicLinkItem.url,
        _sort_order: resolveNextItemSortOrder(publicLinkItem.section_id),
        _is_active: publicLinkItem.is_active,
        _filter_mode: publicLinkItem.filter_mode,
        _filters: buildItemFiltersPayload(publicLinkItem),
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Link duplicado.");
      await refetch();
    } finally {
      setDuplicatingItemId(null);
    }
  };

  const handleOpenMoveItemDialog = (publicLinkItem: PublicLinkItem) => {
    const targetSections = sortedPublicLinkSections.filter(
      (publicLinkSection) => publicLinkSection.id != publicLinkItem.section_id,
    );

    if (targetSections.length == 0) {
      toast.error("Crie outra seção antes de mover o link.");
      return;
    }

    setMoveItemDialogState({
      item: publicLinkItem,
      targetSectionId: targetSections[0]!.id,
    });
  };

  const handleConfirmMoveItem = async () => {
    if (!canManageLinks || !moveItemDialogState || movingItemId) {
      return;
    }

    setMovingItemId(moveItemDialogState.item.id);

    try {
      const { data, error } = await supabase.rpc("upsert_public_link_item", {
        _item_id: null,
        _section_id: moveItemDialogState.targetSectionId,
        _display_name: moveItemDialogState.item.display_name,
        _url: moveItemDialogState.item.url,
        _sort_order: resolveNextItemSortOrder(
          moveItemDialogState.targetSectionId,
        ),
        _is_active: moveItemDialogState.item.is_active,
        _filter_mode: moveItemDialogState.item.filter_mode,
        _filters: buildItemFiltersPayload(moveItemDialogState.item),
      });

      if (error || !data) {
        toast.error(error?.message ?? "Não foi possível mover o link.");
        return;
      }

      const { error: deleteError } = await supabase.rpc(
        "delete_public_link_item",
        {
          _item_id: moveItemDialogState.item.id,
        },
      );

      if (deleteError) {
        toast.error(deleteError.message);
        return;
      }

      toast.success("Link movido.");
      setMoveItemDialogState(null);
      await refetch();
    } finally {
      setMovingItemId(null);
    }
  };

  const handleSaveSection = async () => {
    if (!canManageLinks || savingSection) {
      return;
    }

    const normalizedName = sectionDraft.name.trim();
    const parsedSortOrder = Number.parseInt(sectionDraft.sortOrder, 10);

    if (normalizedName.length == 0) {
      toast.error("Informe o nome da seção.");
      return;
    }

    if (Number.isNaN(parsedSortOrder)) {
      toast.error("Informe uma ordem válida para a seção.");
      return;
    }

    setSavingSection(true);

    try {
      const { error } = await supabase.rpc("upsert_public_link_section", {
        _section_id: sectionDraft.id,
        _name: normalizedName,
        _description: sectionDraft.description.trim() || null,
        _sort_order: parsedSortOrder,
        _is_active: sectionDraft.isActive,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success(sectionDraft.id ? "Seção atualizada." : "Seção criada.");
      setIsSectionDialogOpen(false);
      setSectionDraft(resolveEmptySectionDraft());
      await refetch();
    } finally {
      setSavingSection(false);
    }
  };

  const handleSaveItem = async () => {
    if (!canManageLinks || savingItem || !itemDraft) {
      return;
    }

    const normalizedDisplayName = itemDraft.displayName.trim();
    const normalizedUrl = itemDraft.url.trim();
    const parsedSortOrder = Number.parseInt(itemDraft.sortOrder, 10);

    if (normalizedDisplayName.length == 0) {
      toast.error("Informe o nome de exibição do link.");
      return;
    }

    if (!isValidPublicLinkUrl(normalizedUrl)) {
      toast.error(
        "Informe uma URL absoluta válida começando com http:// ou https://.",
      );
      return;
    }

    if (Number.isNaN(parsedSortOrder)) {
      toast.error("Informe uma ordem válida para o link.");
      return;
    }

    const normalizedFilters = itemDraft.filters.map((filter) => ({
      championship_id: filter.championshipId.trim(),
      season_year: filter.seasonYear.trim(),
    }));

    if (itemDraft.filterMode == PublicLinkFilterMode.BY_CHAMPIONSHIP_YEAR) {
      if (normalizedFilters.length == 0) {
        toast.error(
          "Adicione ao menos um filtro de campeonato e ano para esse link.",
        );
        return;
      }

      if (
        normalizedFilters.some(
          (filter) =>
            filter.championship_id.length == 0 ||
            filter.season_year.length == 0,
        )
      ) {
        toast.error("Preencha campeonato e ano em todos os filtros do link.");
        return;
      }
    }

    setSavingItem(true);

    try {
      const { error } = await supabase.rpc("upsert_public_link_item", {
        _item_id: itemDraft.id,
        _section_id: itemDraft.sectionId,
        _display_name: normalizedDisplayName,
        _url: normalizedUrl,
        _sort_order: parsedSortOrder,
        _is_active: itemDraft.isActive,
        _filter_mode: itemDraft.filterMode,
        _filters:
          itemDraft.filterMode == PublicLinkFilterMode.BY_CHAMPIONSHIP_YEAR
            ? normalizedFilters.map((filter) => ({
                championship_id: filter.championship_id,
                season_year: Number.parseInt(filter.season_year, 10),
              }))
            : [],
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success(itemDraft.id ? "Link atualizado." : "Link criado.");
      setIsItemDialogOpen(false);
      setItemDraft(null);
      await refetch();
    } finally {
      setSavingItem(false);
    }
  };

  const handleConfirmDeleteSection = async () => {
    if (!pendingDeleteSection || !canManageLinks) {
      return;
    }

    if ((pendingDeleteSection.public_link_items ?? []).length > 0) {
      toast.error("Remova os links da seção antes de excluí-la.");
      setPendingDeleteSection(null);
      return;
    }

    setDeletingSectionId(pendingDeleteSection.id);

    try {
      const { error } = await supabase.rpc("delete_public_link_section", {
        _section_id: pendingDeleteSection.id,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Seção excluída.");
      setPendingDeleteSection(null);
      await refetch();
    } finally {
      setDeletingSectionId(null);
    }
  };

  const handleConfirmDeleteItem = async () => {
    if (!pendingDeleteItem || !canManageLinks) {
      return;
    }

    setDeletingItemId(pendingDeleteItem.id);

    try {
      const { error } = await supabase.rpc("delete_public_link_item", {
        _item_id: pendingDeleteItem.id,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Link excluído.");
      setPendingDeleteItem(null);
      await refetch();
    } finally {
      setDeletingItemId(null);
    }
  };

  if (loading) {
    return (
      <div className="glass-card enter-section space-y-5 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>

          <Skeleton className="h-10 w-36 rounded-xl" />
        </div>

        <AdminListSkeleton count={4} showActions />
      </div>
    );
  }

  return (
    <>
      <div className="glass-card enter-section space-y-5 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div>
              <p className="text-sm font-semibold">Links públicos</p>
              <p className="text-xs text-muted-foreground">
                Organize links externos em seções, com nome amigável e filtros
                por campeonato e ano.
              </p>
            </div>
          </div>

          {canManageLinks ? (
            <Button type="button" onClick={handleOpenCreateSectionDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Criar seção
            </Button>
          ) : null}
        </div>

        {sortedPublicLinkSections.length == 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 p-6 text-center">
            <p className="font-medium">Nenhuma seção cadastrada</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {canManageLinks
                ? "Crie a primeira seção para começar a organizar os links públicos."
                : "Ainda não há seções configuradas para links públicos."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedPublicLinkSections.map((publicLinkSection) => (
              <section
                key={publicLinkSection.id}
                className="rounded-3xl border border-border/60 bg-background/35 p-4"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-lg font-semibold">
                          {publicLinkSection.name}
                        </h3>
                        {!publicLinkSection.is_active ? (
                          <span className="rounded-full border border-amber-300/60 bg-amber-100/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                            Inativa
                          </span>
                        ) : null}
                      </div>

                      {publicLinkSection.description ? (
                        <p className="pt-2 text-sm text-muted-foreground">
                          {publicLinkSection.description}
                        </p>
                      ) : null}
                    </div>

                    {canManageLinks ? (
                      <div className="flex shrink-0 items-start gap-1 pt-0.5">
                        <Button
                          type="button"
                          size="icon"
                          onClick={() =>
                            handleOpenCreateItemDialog(publicLinkSection.id)
                          }
                          aria-label={`Adicionar link na seção ${publicLinkSection.name}`}
                          className="sm:h-9 sm:w-auto sm:px-3"
                        >
                          <Plus className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">
                            Adicionar link
                          </span>
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Ações da seção ${publicLinkSection.name}`}
                              disabled={deletingSectionId != null}
                            >
                              {deletingSectionId == publicLinkSection.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreVertical className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem
                              onSelect={() =>
                                handleDuplicateSection(publicLinkSection)
                              }
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Duplicar seção
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                handleOpenEditSectionDialog(publicLinkSection)
                              }
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar seção
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() =>
                                setPendingDeleteSection(publicLinkSection)
                              }
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir seção
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {(publicLinkSection.public_link_items ?? []).length == 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                      Nenhum link cadastrado nesta seção.
                    </div>
                  ) : (
                    (publicLinkSection.public_link_items ?? []).map(
                      (publicLinkItem) => (
                        <div
                          key={publicLinkItem.id}
                          className="rounded-2xl border border-border/50 bg-background/60 p-4"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium">
                                    {publicLinkItem.display_name}
                                  </p>
                                  {!publicLinkItem.is_active ? (
                                    <span className="rounded-full border border-amber-300/60 bg-amber-100/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                                      Inativo
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              {canManageLinks ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`Ações do link ${publicLinkItem.display_name}`}
                                      disabled={
                                        deletingItemId != null ||
                                        movingItemId != null
                                      }
                                    >
                                      {deletingItemId == publicLinkItem.id ||
                                      movingItemId == publicLinkItem.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                      )}
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    className="w-48"
                                  >
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        handleDuplicateItem(publicLinkItem)
                                      }
                                    >
                                      <Copy className="mr-2 h-4 w-4" />
                                      Duplicar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        handleOpenMoveItemDialog(publicLinkItem)
                                      }
                                    >
                                      <ArrowRightLeft className="mr-2 h-4 w-4" />
                                      Mover de seção
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        handleOpenEditItemDialog(publicLinkItem)
                                      }
                                    >
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Editar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onSelect={() =>
                                        setPendingDeleteItem(publicLinkItem)
                                      }
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Excluir
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : null}
                            </div>

                            <a
                              href={publicLinkItem.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex max-w-full break-all text-sm text-primary underline underline-offset-4"
                            >
                              {publicLinkItem.url}
                            </a>

                            {publicLinkItem.filter_mode ==
                            PublicLinkFilterMode.BY_CHAMPIONSHIP_YEAR ? (
                              <div className="flex flex-wrap gap-2">
                                {(
                                  publicLinkItem.public_link_item_filters ?? []
                                ).map((publicLinkItemFilter) => {
                                  const championship =
                                    championshipById[
                                      publicLinkItemFilter.championship_id
                                    ];
                                  const championshipLabel = championship
                                    ? CHAMPIONSHIP_CODE_LABELS[
                                        championship.code
                                      ]
                                    : "Campeonato removido";

                                  return (
                                    <span
                                      key={publicLinkItemFilter.id}
                                      className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-muted-foreground"
                                    >
                                      {championshipLabel} •{" "}
                                      {publicLinkItemFilter.season_year}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ),
                    )
                  )}
                </div>
              </section>
            ))}
          </div>
        )}

        {!canManageLinks ? (
          <p className="text-sm text-muted-foreground">
            Perfil em visualização: sem permissão para editar links públicos.
          </p>
        ) : null}
      </div>

      <Dialog open={isSectionDialogOpen} onOpenChange={setIsSectionDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {sectionDraft.id ? "Editar seção" : "Criar seção"}
            </DialogTitle>
            <DialogDescription>
              Defina nome, descrição, ordem e status da seção pública.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="public-link-section-name">Nome da seção</Label>
              <Input
                id="public-link-section-name"
                value={sectionDraft.name}
                onChange={(event) =>
                  setSectionDraft((currentSectionDraft) => ({
                    ...currentSectionDraft,
                    name: event.target.value,
                  }))
                }
                placeholder="Ex.: Fotos dos campeonatos"
                className="app-input-field"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="public-link-section-description">
                Descrição (opcional)
              </Label>
              <Textarea
                id="public-link-section-description"
                value={sectionDraft.description}
                onChange={(event) =>
                  setSectionDraft((currentSectionDraft) => ({
                    ...currentSectionDraft,
                    description: event.target.value,
                  }))
                }
                placeholder="Ex.: Álbuns e materiais públicos organizados por campeonato."
                className="app-input-field min-h-24 resize-none"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
              <div className="space-y-2">
                <Label htmlFor="public-link-section-order">Ordem</Label>
                <Select
                  value={sectionDraft.sortOrder}
                  onValueChange={(sortOrder) =>
                    setSectionDraft((currentSectionDraft) => ({
                      ...currentSectionDraft,
                      sortOrder,
                    }))
                  }
                >
                  <SelectTrigger
                    id="public-link-section-order"
                    className="app-input-field"
                  >
                    <SelectValue placeholder="Selecione a ordem" />
                  </SelectTrigger>
                  <SelectContent>
                    {sectionSortOrderOptions.map((sectionSortOrderOption) => (
                      <SelectItem
                        key={sectionSortOrderOption.value}
                        value={sectionSortOrderOption.value}
                      >
                        {sectionSortOrderOption.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-border/60 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Seção ativa</p>
                  <p className="text-xs text-muted-foreground">
                    Seções inativas não aparecem na página pública.
                  </p>
                </div>
                <Switch
                  checked={sectionDraft.isActive}
                  onCheckedChange={(isActive) =>
                    setSectionDraft((currentSectionDraft) => ({
                      ...currentSectionDraft,
                      isActive,
                    }))
                  }
                  aria-label="Alternar seção ativa"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSectionDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSaveSection}
              disabled={savingSection}
            >
              {savingSection ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {sectionDraft.id ? "Salvar alterações" : "Criar seção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {itemDraft?.id ? "Editar link" : "Criar link"}
            </DialogTitle>
            <DialogDescription>
              Cadastre um nome amigável, a URL de destino, a ordem e os vínculos
              usados nos filtros públicos.
            </DialogDescription>
          </DialogHeader>

          {itemDraft ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="public-link-item-display-name">
                  Nome de exibição
                </Label>
                <Input
                  id="public-link-item-display-name"
                  value={itemDraft.displayName}
                  onChange={(event) =>
                    setItemDraft((currentItemDraft) =>
                      currentItemDraft
                        ? {
                            ...currentItemDraft,
                            displayName: event.target.value,
                          }
                        : currentItemDraft,
                    )
                  }
                  placeholder="Ex.: Fotos da final 2026"
                  className="app-input-field"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="public-link-item-url">URL</Label>
                <Input
                  id="public-link-item-url"
                  value={itemDraft.url}
                  onChange={(event) =>
                    setItemDraft((currentItemDraft) =>
                      currentItemDraft
                        ? { ...currentItemDraft, url: event.target.value }
                        : currentItemDraft,
                    )
                  }
                  placeholder="https://drive.google.com/..."
                  className="app-input-field"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                <div className="space-y-2">
                  <Label htmlFor="public-link-item-order">Ordem</Label>
                  <Select
                    value={itemDraft.sortOrder}
                    onValueChange={(sortOrder) =>
                      setItemDraft((currentItemDraft) =>
                        currentItemDraft
                          ? { ...currentItemDraft, sortOrder }
                          : currentItemDraft,
                      )
                    }
                  >
                    <SelectTrigger
                      id="public-link-item-order"
                      className="app-input-field"
                    >
                      <SelectValue placeholder="Selecione a ordem" />
                    </SelectTrigger>
                    <SelectContent>
                      {itemSortOrderOptions.map((itemSortOrderOption) => (
                        <SelectItem
                          key={itemSortOrderOption.value}
                          value={itemSortOrderOption.value}
                        >
                          {itemSortOrderOption.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-border/60 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Link ativo</p>
                    <p className="text-xs text-muted-foreground">
                      Links inativos não aparecem na página pública.
                    </p>
                  </div>
                  <Switch
                    checked={itemDraft.isActive}
                    onCheckedChange={(isActive) =>
                      setItemDraft((currentItemDraft) =>
                        currentItemDraft
                          ? { ...currentItemDraft, isActive }
                          : currentItemDraft,
                      )
                    }
                    aria-label="Alternar link ativo"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="public-link-item-filter-mode">
                  Vínculo para filtros públicos
                </Label>
                <Select
                  value={itemDraft.filterMode}
                  onValueChange={(value) =>
                    setItemDraft((currentItemDraft) =>
                      currentItemDraft
                        ? {
                            ...currentItemDraft,
                            filterMode: value as PublicLinkFilterMode,
                            filters:
                              value == PublicLinkFilterMode.BY_CHAMPIONSHIP_YEAR
                                ? currentItemDraft.filters.length > 0
                                  ? currentItemDraft.filters
                                  : [createLinkFilterDraft()]
                                : currentItemDraft.filters,
                          }
                        : currentItemDraft,
                    )
                  }
                >
                  <SelectTrigger
                    id="public-link-item-filter-mode"
                    className="app-input-field"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PublicLinkFilterMode.GLOBAL}>
                      {
                        PUBLIC_LINK_FILTER_MODE_LABELS[
                          PublicLinkFilterMode.GLOBAL
                        ]
                      }
                    </SelectItem>
                    <SelectItem
                      value={PublicLinkFilterMode.BY_CHAMPIONSHIP_YEAR}
                    >
                      {
                        PUBLIC_LINK_FILTER_MODE_LABELS[
                          PublicLinkFilterMode.BY_CHAMPIONSHIP_YEAR
                        ]
                      }
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {itemDraft.filterMode ==
              PublicLinkFilterMode.BY_CHAMPIONSHIP_YEAR ? (
                <div className="space-y-3 rounded-2xl border border-border/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Filtros do link</p>
                      <p className="text-xs text-muted-foreground">
                        Adicione um ou mais vínculos de campeonato e ano. Sem
                        filtros aplicados na página pública, o link continua
                        visível.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setItemDraft((currentItemDraft) =>
                          currentItemDraft
                            ? {
                                ...currentItemDraft,
                                filters: [
                                  ...currentItemDraft.filters,
                                  createLinkFilterDraft(),
                                ],
                              }
                            : currentItemDraft,
                        )
                      }
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar filtro
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {itemDraft.filters.map((filter, index) => (
                      <div
                        key={filter.id}
                        className="grid gap-3 rounded-2xl border border-border/50 bg-background/60 p-3 md:grid-cols-[minmax(0,1fr)_140px_auto]"
                      >
                        <div className="space-y-2">
                          <Label>Campeonato</Label>
                          <Select
                            value={filter.championshipId || "__empty__"}
                            onValueChange={(value) =>
                              setItemDraft((currentItemDraft) =>
                                currentItemDraft
                                  ? {
                                      ...currentItemDraft,
                                      filters: currentItemDraft.filters.map(
                                        (currentFilter) =>
                                          currentFilter.id == filter.id
                                            ? {
                                                ...currentFilter,
                                                championshipId:
                                                  value == "__empty__"
                                                    ? ""
                                                    : value,
                                              }
                                            : currentFilter,
                                      ),
                                    }
                                  : currentItemDraft,
                              )
                            }
                          >
                            <SelectTrigger className="app-input-field">
                              <SelectValue placeholder="Selecione um campeonato" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__empty__">
                                Selecione
                              </SelectItem>
                              {championships.map((championship) => (
                                <SelectItem
                                  key={championship.id}
                                  value={championship.id}
                                >
                                  {CHAMPIONSHIP_CODE_LABELS[championship.code]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Ano</Label>
                          <Input
                            inputMode="numeric"
                            value={filter.seasonYear}
                            onChange={(event) =>
                              setItemDraft((currentItemDraft) =>
                                currentItemDraft
                                  ? {
                                      ...currentItemDraft,
                                      filters: currentItemDraft.filters.map(
                                        (currentFilter) =>
                                          currentFilter.id == filter.id
                                            ? {
                                                ...currentFilter,
                                                seasonYear: event.target.value,
                                              }
                                            : currentFilter,
                                      ),
                                    }
                                  : currentItemDraft,
                              )
                            }
                            placeholder="2026"
                            className="app-input-field"
                          />
                        </div>

                        <div className="flex items-end">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              setItemDraft((currentItemDraft) =>
                                currentItemDraft
                                  ? {
                                      ...currentItemDraft,
                                      filters:
                                        currentItemDraft.filters.length > 1
                                          ? currentItemDraft.filters.filter(
                                              (currentFilter) =>
                                                currentFilter.id != filter.id,
                                            )
                                          : [createLinkFilterDraft()],
                                    }
                                  : currentItemDraft,
                              )
                            }
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remover
                          </Button>
                        </div>

                        <div className="md:col-span-3">
                          <p className="text-xs text-muted-foreground">
                            Filtro {index + 1}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsItemDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSaveItem}
              disabled={savingItem}
            >
              {savingItem ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {itemDraft?.id ? "Salvar alterações" : "Criar link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={moveItemDialogState != null}
        onOpenChange={(open) => !open && setMoveItemDialogState(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mover link</DialogTitle>
            <DialogDescription>
              Escolha a seção de destino para esse link.
            </DialogDescription>
          </DialogHeader>

          {moveItemDialogState ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {moveItemDialogState.item.display_name}
                </p>
                <p className="text-xs text-muted-foreground break-all">
                  {moveItemDialogState.item.url}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="move-public-link-target-section">
                  Seção de destino
                </Label>
                <Select
                  value={moveItemDialogState.targetSectionId}
                  onValueChange={(targetSectionId) =>
                    setMoveItemDialogState((currentMoveItemDialogState) =>
                      currentMoveItemDialogState
                        ? { ...currentMoveItemDialogState, targetSectionId }
                        : currentMoveItemDialogState,
                    )
                  }
                >
                  <SelectTrigger
                    id="move-public-link-target-section"
                    className="app-input-field"
                  >
                    <SelectValue placeholder="Selecione a seção" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMoveTargetSections.map((publicLinkSection) => (
                      <SelectItem
                        key={publicLinkSection.id}
                        value={publicLinkSection.id}
                      >
                        {publicLinkSection.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMoveItemDialogState(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmMoveItem}
              disabled={movingItemId != null}
            >
              {movingItemId != null ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Mover link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDeleteSection != null}
        onOpenChange={(open) => !open && setPendingDeleteSection(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir seção</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação remove a seção permanentemente. Se ainda houver links
              nela, a exclusão será bloqueada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteSection}>
              Excluir seção
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDeleteItem != null}
        onOpenChange={(open) => !open && setPendingDeleteItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir link</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação remove o link e todos os filtros vinculados a ele.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteItem}>
              Excluir link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
