import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminTeams } from "@/components/admin/AdminTeams";
import { TeamDivision } from "@/lib/enums";
import type { Team } from "@/lib/types";

const {
  toastSuccessMock,
  toastErrorMock,
  insertDelay,
  updateDelay,
  deleteDelay,
  insertResolver,
  updateResolver,
  deleteResolver,
} = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  insertDelay: { value: false },
  updateDelay: { value: false },
  deleteDelay: { value: false },
  insertResolver: { current: null as (() => void) | null },
  updateResolver: { current: null as (() => void) | null },
  deleteResolver: { current: null as (() => void) | null },
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: async () => {
        if (insertDelay.value) {
          await new Promise<void>((resolve) => {
            insertResolver.current = resolve;
          });
        }

        return { error: null };
      },
      update: () => ({
        eq: async () => {
          if (updateDelay.value) {
            await new Promise<void>((resolve) => {
              updateResolver.current = resolve;
            });
          }

          return { error: null };
        },
      }),
      delete: () => ({
        eq: async () => {
          if (deleteDelay.value) {
            await new Promise<void>((resolve) => {
              deleteResolver.current = resolve;
            });
          }

          return { error: null };
        },
      }),
    }),
  },
}));

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

function buildTeam(overrides: Partial<Team> & Pick<Team, "id" | "name">): Team {
  return {
    id: overrides.id,
    name: overrides.name,
    city: overrides.city ?? "Joinville",
    division: overrides.division ?? TeamDivision.DIVISAO_PRINCIPAL,
    created_at: overrides.created_at ?? "2026-04-11T00:00:00.000Z",
  };
}

describe("AdminTeams loading states", () => {
  beforeEach(() => {
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    insertDelay.value = false;
    updateDelay.value = false;
    deleteDelay.value = false;
    insertResolver.current = null;
    updateResolver.current = null;
    deleteResolver.current = null;
  });

  afterEach(() => {
    insertDelay.value = false;
    updateDelay.value = false;
    deleteDelay.value = false;
    insertResolver.current = null;
    updateResolver.current = null;
    deleteResolver.current = null;
    vi.clearAllMocks();
  });

  it("mostra loading ao criar atlética", async () => {
    insertDelay.value = true;
    const onRefetch = vi.fn();

    render(<AdminTeams teams={[]} onRefetch={onRefetch} canManageTeams />);

    fireEvent.click(screen.getByRole("button", { name: "Criar atlética" }));
    fireEvent.change(screen.getByPlaceholderText("Nome da atlética"), {
      target: { value: "Nova Atlética" },
    });

    const createButtons = screen.getAllByRole("button", { name: "Criar atlética" });
    const createSubmitButton = createButtons[createButtons.length - 1];

    fireEvent.click(createSubmitButton);

    expect(createSubmitButton.querySelector("svg.animate-spin")).not.toBeNull();

    await act(async () => {
      insertResolver.current?.();
    });

    await waitFor(() => {
      expect(createSubmitButton.querySelector("svg.animate-spin")).toBeNull();
      expect(onRefetch).toHaveBeenCalled();
    });
  });

  it("mostra loading ao salvar edição da atlética", async () => {
    updateDelay.value = true;
    const onRefetch = vi.fn();

    render(
      <AdminTeams
        teams={[buildTeam({ id: "team-1", name: "Equipe 1" })]}
        onRefetch={onRefetch}
        canManageTeams
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));

    const saveButton = await screen.findByRole("button", { name: "Salvar alterações" });
    fireEvent.click(saveButton);

    expect(saveButton.querySelector("svg.animate-spin")).not.toBeNull();

    await act(async () => {
      updateResolver.current?.();
    });

    await waitFor(() => {
      expect(saveButton.querySelector("svg.animate-spin")).toBeNull();
      expect(onRefetch).toHaveBeenCalled();
    });
  });

  it("mostra loading ao excluir atlética", async () => {
    deleteDelay.value = true;
    const onRefetch = vi.fn();

    render(
      <AdminTeams
        teams={[buildTeam({ id: "team-2", name: "Equipe 2" })]}
        onRefetch={onRefetch}
        canManageTeams
      />,
    );

    const actionsButton = screen.getByRole("button", { name: "Ações da atlética Equipe 2" });
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));

    expect(actionsButton.querySelector("svg.animate-spin")).not.toBeNull();

    await act(async () => {
      deleteResolver.current?.();
    });

    await waitFor(() => {
      expect(actionsButton.querySelector("svg.animate-spin")).toBeNull();
      expect(onRefetch).toHaveBeenCalled();
    });
  });
});
