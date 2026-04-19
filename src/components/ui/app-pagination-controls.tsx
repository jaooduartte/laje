import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const VISIBLE_PAGE_BUTTONS = 5;

export const DEFAULT_PAGINATION_ITEMS_PER_PAGE = 15;
export const PAGINATION_ITEMS_PER_PAGE_OPTIONS = [15, 30, 60, 120] as const;

function resolveVisiblePages(currentPage: number, totalPages: number): number[] {
  if (totalPages <= VISIBLE_PAGE_BUTTONS) {
    return Array.from({ length: totalPages }, (_, pageIndex) => pageIndex + 1);
  }

  const halfRange = Math.floor(VISIBLE_PAGE_BUTTONS / 2);
  let startPage = currentPage - halfRange;
  let endPage = currentPage + halfRange;

  if (startPage < 1) {
    endPage += 1 - startPage;
    startPage = 1;
  }

  if (endPage > totalPages) {
    startPage -= endPage - totalPages;
    endPage = totalPages;
  }

  return Array.from({ length: endPage - startPage + 1 }, (_, pageIndex) => startPage + pageIndex);
}

interface AppItemsPerPageControlProps {
  itemsPerPage: number;
  onItemsPerPageChange: (value: number) => void;
  options?: readonly number[];
  className?: string;
  shouldRenderCard?: boolean;
}

export function AppItemsPerPageControl({
  itemsPerPage,
  onItemsPerPageChange,
  options = PAGINATION_ITEMS_PER_PAGE_OPTIONS,
  className,
  shouldRenderCard = true,
}: AppItemsPerPageControlProps) {
  const content = (
    <div className={className ?? "flex flex-wrap items-center justify-end gap-2"}>
      <span className="hidden text-xs text-muted-foreground sm:inline">Itens por página</span>
      <Select
        value={String(itemsPerPage)}
        onValueChange={(value) => {
          const parsedValue = Number(value);

          if (Number.isNaN(parsedValue)) {
            return;
          }

          onItemsPerPageChange(parsedValue);
        }}
      >
        <SelectTrigger className="app-input-field h-8 w-16 sm:w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  if (!shouldRenderCard) {
    return content;
  }

  return <div className="glass-card enter-section p-3">{content}</div>;
}

interface AppPaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showBoundaryButtons?: boolean;
  itemsPerPage?: number;
  onItemsPerPageChange?: (value: number) => void;
  itemsPerPageOptions?: readonly number[];
}

export function AppPaginationControls({
  currentPage,
  totalPages,
  onPageChange,
  showBoundaryButtons = false,
  itemsPerPage,
  onItemsPerPageChange,
  itemsPerPageOptions = PAGINATION_ITEMS_PER_PAGE_OPTIONS,
}: AppPaginationControlsProps) {
  const visiblePages = resolveVisiblePages(currentPage, totalPages);
  const shouldShowItemsPerPageControl = typeof itemsPerPage == "number" && onItemsPerPageChange != undefined;

  return (
    <div className="enter-section">
      <div
        className={`rounded-2xl app-pagination-container px-3 py-2 ${
          shouldShowItemsPerPageControl
            ? "flex w-full flex-row items-center justify-between gap-2"
            : "flex items-center justify-center gap-1"
        }`}
      >
        {shouldShowItemsPerPageControl ? (
          <AppItemsPerPageControl
            itemsPerPage={itemsPerPage}
            onItemsPerPageChange={onItemsPerPageChange}
            options={itemsPerPageOptions}
            shouldRenderCard={false}
            className="flex flex-wrap items-center gap-2"
          />
        ) : null}

        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            className="app-pill-option inline-flex h-8 w-8 items-center justify-center rounded-xl disabled:pointer-events-none disabled:opacity-50"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage == 1}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {showBoundaryButtons ? (
            <button
              type="button"
              className="app-pill-option inline-flex h-8 w-8 items-center justify-center rounded-xl disabled:pointer-events-none disabled:opacity-50"
              onClick={() => onPageChange(1)}
              disabled={currentPage == 1}
              aria-label="Primeira página"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
          ) : null}

          {visiblePages.map((visiblePage) => {
            const isCurrentPage = visiblePage == currentPage;

            return (
              <button
                key={visiblePage}
                type="button"
                aria-current={isCurrentPage ? "page" : undefined}
                className={`app-pill-option inline-flex h-8 min-w-8 items-center justify-center rounded-xl px-2 text-xs ${
                  isCurrentPage ? "app-pill-active-indicator text-primary-foreground font-bold" : ""
                }`}
                onClick={() => onPageChange(visiblePage)}
              >
                {visiblePage}
              </button>
            );
          })}

          <button
            type="button"
            className="app-pill-option inline-flex h-8 w-8 items-center justify-center rounded-xl disabled:pointer-events-none disabled:opacity-50"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage == totalPages}
            aria-label="Próxima página"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {showBoundaryButtons ? (
            <button
              type="button"
              className="app-pill-option inline-flex h-8 w-8 items-center justify-center rounded-xl disabled:pointer-events-none disabled:opacity-50"
              onClick={() => onPageChange(totalPages)}
              disabled={currentPage == totalPages}
              aria-label="Última página"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
