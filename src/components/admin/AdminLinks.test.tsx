import { act, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminLinks } from "@/components/admin/AdminLinks";
import { ChampionshipCode, ChampionshipStatus, PublicLinkFilterMode } from "@/lib/enums";
import type { Championship, PublicLinkItem, PublicLinkSection } from "@/lib/types";

const {
  refetchMock,
  rpcMock,
  toastErrorMock,
  toastSuccessMock,
  publicLinkSectionsState,
} = vi.hoisted(() => ({
  refetchMock: vi.fn(),
  rpcMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  publicLinkSectionsState: {
    current: [] as PublicLinkSection[],
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock("@/hooks/usePublicLinkSections", () => ({
  usePublicLinkSections: () => ({
    publicLinkSections: publicLinkSectionsState.current,
    loading: false,
    refetch: refetchMock,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: rpcMock,
  },
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  AlertDialogAction: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/select", () => {
  const SelectContext = React.createContext<{ onValueChange?: (value: string) => void } | null>(null);

  return {
    Select: ({
      children,
      onValueChange,
    }: {
      children: ReactNode;
      value?: string;
      onValueChange?: (value: string) => void;
    }) => <SelectContext.Provider value={{ onValueChange }}>{children}</SelectContext.Provider>,
    SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? "Selecionado"}</span>,
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
      const context = React.useContext(SelectContext);

      return (
        <button type="button" onClick={() => context?.onValueChange?.(value)}>
          {children}
        </button>
      );
    },
  };
});

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onSelect,
    className,
    disabled,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    className?: string;
    disabled?: boolean;
  }) => (
    <button type="button" className={className} disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}));

const championships: Championship[] = [
  {
    id: "championship-1",
    code: ChampionshipCode.CLV,
    name: "Copa Laje de Verão",
    status: ChampionshipStatus.FINISHED,
    current_season_year: 2026,
    uses_divisions: false,
    default_location: null,
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

function buildSection(overrides: Partial<PublicLinkSection> = {}): PublicLinkSection {
  return {
    id: overrides.id ?? "section-1",
    name: overrides.name ?? "Fotos",
    description: overrides.description ?? null,
    sort_order: overrides.sort_order ?? 1,
    is_active: overrides.is_active ?? true,
    created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-01-01T00:00:00.000Z",
    public_link_items: overrides.public_link_items ?? [],
  };
}

function buildItem(overrides: Partial<PublicLinkItem> = {}): PublicLinkItem {
  return {
    id: overrides.id ?? "item-1",
    section_id: overrides.section_id ?? "section-1",
    display_name: overrides.display_name ?? "Fotos 2026",
    url: overrides.url ?? "https://example.com/fotos-2026",
    sort_order: overrides.sort_order ?? 1,
    is_active: overrides.is_active ?? true,
    filter_mode: overrides.filter_mode ?? PublicLinkFilterMode.GLOBAL,
    created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-01-01T00:00:00.000Z",
    public_link_item_filters: overrides.public_link_item_filters ?? [],
  };
}

describe("AdminLinks", () => {
  beforeEach(() => {
    publicLinkSectionsState.current = [buildSection()];
    rpcMock.mockReset();
    refetchMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
  });

  it("não salva link com URL inválida", () => {
    render(<AdminLinks championships={championships} canManageLinks />);

    fireEvent.click(screen.getByRole("button", { name: "Adicionar link na seção Fotos" }));
    fireEvent.change(screen.getByLabelText("Nome de exibição"), {
      target: { value: "Fotos da final" },
    });
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "drive.google.com/final" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Criar link" }));

    expect(toastErrorMock).toHaveBeenCalledWith("Informe uma URL absoluta válida começando com http:// ou https://.");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("não salva link filtrado sem campeonato e ano preenchidos", () => {
    render(<AdminLinks championships={championships} canManageLinks />);

    fireEvent.click(screen.getByRole("button", { name: "Adicionar link na seção Fotos" }));
    fireEvent.change(screen.getByLabelText("Nome de exibição"), {
      target: { value: "Fotos da final" },
    });
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/final" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Vincular campeonato e ano" }));

    fireEvent.click(screen.getByRole("button", { name: "Criar link" }));

    expect(toastErrorMock).toHaveBeenCalledWith("Preencha campeonato e ano em todos os filtros do link.");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("bloqueia exclusão de seção que ainda possui links dependentes", () => {
    publicLinkSectionsState.current = [
      buildSection({
        public_link_items: [
          buildItem({ sort_order: 0 }),
        ],
      }),
    ];

    render(<AdminLinks championships={championships} canManageLinks />);

    fireEvent.click(screen.getByRole("button", { name: "Ações da seção Fotos" }));
    const deleteSectionButtons = screen.getAllByRole("button", { name: "Excluir seção" });
    fireEvent.click(deleteSectionButtons[0]!);

    const confirmButtons = screen.getAllByRole("button", { name: "Excluir seção" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    expect(toastErrorMock).toHaveBeenCalledWith("Remova os links da seção antes de excluí-la.");
    expect(rpcMock).not.toHaveBeenCalledWith("delete_public_link_section", expect.anything());
  });

  it("salva seção com ordem selecionada pelo select", async () => {
    publicLinkSectionsState.current = [buildSection(), buildSection({ id: "section-2", sort_order: 2, name: "Vídeos" })];
    rpcMock.mockResolvedValue({ error: null });

    render(<AdminLinks championships={championships} canManageLinks />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Criar seção" }));
    });

    fireEvent.change(screen.getByLabelText("Nome da seção"), {
      target: { value: "Regulamentos" },
    });

    expect(screen.getByRole("button", { name: "1º" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2º" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3º" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "2º" }));
    });

    const createSectionButtons = screen.getAllByRole("button", { name: "Criar seção" });
    await act(async () => {
      fireEvent.click(createSectionButtons[createSectionButtons.length - 1]!);
    });

    expect(rpcMock).toHaveBeenCalledWith("upsert_public_link_section", expect.objectContaining({ _sort_order: 2 }));
  });

  it("salva link com ordem selecionada pelo select", async () => {
    publicLinkSectionsState.current = [
      buildSection({
        public_link_items: [
          buildItem({
            id: "item-1",
            display_name: "Fotos 2025",
            url: "https://example.com/fotos-2025",
          }),
        ],
      }),
    ];
    rpcMock.mockResolvedValue({ error: null });

    render(<AdminLinks championships={championships} canManageLinks />);

    fireEvent.click(screen.getByRole("button", { name: "Adicionar link na seção Fotos" }));
    fireEvent.change(screen.getByLabelText("Nome de exibição"), {
      target: { value: "Fotos 2026" },
    });
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/fotos-2026" },
    });

    expect(screen.getByRole("button", { name: "1º" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2º" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "1º" }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Criar link" }));
    });

    expect(rpcMock).toHaveBeenCalledWith("upsert_public_link_item", expect.objectContaining({ _sort_order: 1 }));
  });

  it("duplica link pelo menu de ações", async () => {
    publicLinkSectionsState.current = [
      buildSection({
        public_link_items: [
          buildItem({
            id: "item-1",
            display_name: "Fotos 2025",
            url: "https://example.com/fotos-2025",
          }),
        ],
      }),
    ];
    rpcMock.mockResolvedValue({ error: null });

    render(<AdminLinks championships={championships} canManageLinks />);

    fireEvent.click(screen.getByRole("button", { name: "Ações do link Fotos 2025" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Duplicar" }));
    });

    expect(rpcMock).toHaveBeenCalledWith(
      "upsert_public_link_item",
      expect.objectContaining({
        _item_id: null,
        _section_id: "section-1",
        _display_name: "Fotos 2025 (cópia)",
        _sort_order: 2,
      }),
    );
  });

  it("move link para outra seção pelo menu de ações", async () => {
    publicLinkSectionsState.current = [
      buildSection({
        id: "section-1",
        name: "Fotos",
        public_link_items: [
          buildItem({
            id: "item-1",
            display_name: "Fotos 2025",
            url: "https://example.com/fotos-2025",
          }),
        ],
      }),
      buildSection({
        id: "section-2",
        name: "Regulamentos",
        public_link_items: [],
      }),
    ];
    rpcMock.mockResolvedValue({ data: "new-item-id", error: null });

    render(<AdminLinks championships={championships} canManageLinks />);

    fireEvent.click(screen.getByRole("button", { name: "Ações do link Fotos 2025" }));
    fireEvent.click(screen.getByRole("button", { name: "Mover de seção" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Regulamentos" }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mover link" }));
    });

    expect(rpcMock).toHaveBeenNthCalledWith(
      1,
      "upsert_public_link_item",
      expect.objectContaining({
        _item_id: null,
        _section_id: "section-2",
        _display_name: "Fotos 2025",
        _sort_order: 1,
      }),
    );
    expect(rpcMock).toHaveBeenNthCalledWith(2, "delete_public_link_item", { _item_id: "item-1" });
  });
});
