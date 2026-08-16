import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AdminTeams } from "@/components/admin/AdminTeams";
import { TeamDivision } from "@/lib/enums";
import type { Team } from "@/lib/types";

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const SelectContext = React.createContext<(value: string) => void>(() => undefined);

  return {
    Select: ({
      children,
      onValueChange,
    }: {
      children: ReactNode;
      onValueChange?: (value: string) => void;
    }) => (
      <SelectContext.Provider value={onValueChange ?? (() => undefined)}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
      const onValueChange = React.useContext(SelectContext);
      return (
        <button type="button" onClick={() => onValueChange(value)}>
          {children}
        </button>
      );
    },
  };
});

function buildTeam(overrides: Partial<Team> & Pick<Team, "id" | "name">): Team {
  return {
    id: overrides.id,
    name: overrides.name,
    city: overrides.city ?? "Joinville",
    division: overrides.division ?? TeamDivision.DIVISAO_PRINCIPAL,
    is_active: overrides.is_active ?? true,
    created_at: overrides.created_at ?? "2026-08-03T00:00:00.000Z",
  } as Team;
}

describe("AdminTeams", () => {
  it("filtra por padrão somente atléticas ativas", () => {
    render(
      <AdminTeams
        teams={[
          buildTeam({ id: "team-active", name: "Atlética Ativa", is_active: true }),
          buildTeam({ id: "team-inactive", name: "Atlética Inativa", is_active: false }),
        ]}
        onRefetch={vi.fn()}
        canManageTeams
      />,
    );

    expect(screen.getByText("Atlética Ativa")).toBeInTheDocument();
    expect(screen.queryByText("Atlética Inativa")).not.toBeInTheDocument();
  });

  it("deixa o card da atlética inativa mais apagado ao mostrar ativas e inativas", () => {
    render(
      <AdminTeams
        teams={[
          buildTeam({ id: "team-active", name: "Atlética Ativa", is_active: true }),
          buildTeam({ id: "team-inactive", name: "Atlética Inativa", is_active: false }),
        ]}
        onRefetch={vi.fn()}
        canManageTeams
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ativas e inativas" }));

    const inactiveCard = screen.getByText("Atlética Inativa").closest(".list-item-card");
    const activeCard = screen.getByText("Atlética Ativa").closest(".list-item-card");

    expect(inactiveCard).toHaveClass("opacity-70");
    expect(activeCard).not.toHaveClass("opacity-70");
  });
});
