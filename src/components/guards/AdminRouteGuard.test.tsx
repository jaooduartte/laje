import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminRouteGuard } from "@/components/guards/AdminRouteGuard";

const mockUseAuth = vi.fn();

vi.mock("@/components/Header", () => ({
  Header: () => <div data-testid="header" />,
}));

vi.mock("@/components/skeletons/AdminShellSkeleton", () => ({
  AdminShellSkeleton: () => <div data-testid="admin-shell-skeleton" />,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe("AdminRouteGuard", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: null,
      canAccessAdminPanel: false,
      loading: true,
      roleLoading: false,
    });
  });

  it("mantém o header fora do skeleton enquanto valida o acesso", () => {
    const { container } = render(
      <MemoryRouter>
        <AdminRouteGuard>
          <div>Conteúdo administrativo</div>
        </AdminRouteGuard>
      </MemoryRouter>,
    );

    const header = screen.getByTestId("header");
    const skeleton = screen.getByTestId("admin-shell-skeleton");

    expect(header.parentElement).toBe(container.firstElementChild);
    expect(skeleton.parentElement?.tagName).toBe("MAIN");
  });
});
