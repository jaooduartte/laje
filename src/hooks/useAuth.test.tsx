import { act, render, screen } from "@testing-library/react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/hooks/useAuth";

const { mockGetSession, mockOnAuthStateChange, mockRpc } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    rpc: mockRpc,
  },
}));

function AuthValue() {
  const { roleLoading } = useAuth();

  return <span data-testid="role-loading">{String(roleLoading)}</span>;
}

describe("AuthProvider", () => {
  let authStateChangeCallback: ((event: AuthChangeEvent, session: Session | null) => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockRpc.mockResolvedValue({ data: [], error: null });
    mockOnAuthStateChange.mockImplementation((callback) => {
      authStateChangeCallback = callback;

      return {
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("loads permissions after the authentication state callback returns", async () => {
    render(
      <AuthProvider>
        <AuthValue />
      </AuthProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    mockRpc.mockClear();

    act(() => {
      authStateChangeCallback?.("SIGNED_IN", {
        user: { id: "admin-user-id" },
      } as Session);
    });

    expect(screen.getByTestId("role-loading")).toHaveTextContent("true");
    expect(mockRpc).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockRpc).toHaveBeenCalledWith("get_current_user_admin_context");
  });
});
