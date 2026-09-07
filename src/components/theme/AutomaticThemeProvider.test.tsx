import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeMode } from "@/lib/enums";
import { AutomaticThemeProvider, useAutomaticThemeContext } from "@/components/theme/AutomaticThemeProvider";

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
    },
    rpc: mockRpc,
  },
}));

function configureSupabaseMock() {
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockOnAuthStateChange.mockReturnValue({
    data: {
      subscription: {
        unsubscribe: vi.fn(),
      },
    },
  });
  mockRpc.mockResolvedValue({ data: null, error: null });
}

function emitAuthStateChange(hasAuthenticatedUser: boolean) {
  const callback = mockOnAuthStateChange.mock.calls[0]?.[0];

  callback?.("SIGNED_IN", hasAuthenticatedUser ? { user: { id: "admin-user-id" } } : null);
}

function ThemeModeTestValue() {
  const { themeMode, preferredThemeMode, setPreferredThemeMode } = useAutomaticThemeContext();

  return (
    <div>
      <span data-testid="theme-mode-value">{themeMode}</span>
      <span data-testid="preferred-theme-mode-value">{preferredThemeMode}</span>
      <button type="button" onClick={() => setPreferredThemeMode(ThemeMode.DARK)}>
        Usar escuro
      </button>
    </div>
  );
}

describe("AutomaticThemeProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    configureSupabaseMock();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    document.documentElement.classList.remove("dark");
  });

  async function renderProvider() {
    await act(async () => {
      render(
        <AutomaticThemeProvider>
          <ThemeModeTestValue />
        </AutomaticThemeProvider>,
      );

      await Promise.resolve();
    });
  }

  it("should apply dark class during night window", async () => {
    vi.setSystemTime(new Date("2026-03-01T21:00:00.000Z"));

    await renderProvider();

    expect(screen.getByTestId("theme-mode-value")).toHaveTextContent(ThemeMode.DARK);
    expect(screen.getByTestId("preferred-theme-mode-value")).toHaveTextContent(ThemeMode.AUTO);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("should apply light class during day window", async () => {
    vi.setSystemTime(new Date("2026-03-01T09:00:00.000Z"));
    document.documentElement.classList.add("dark");

    await renderProvider();

    expect(screen.getByTestId("theme-mode-value")).toHaveTextContent(ThemeMode.LIGHT);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("should allow overriding automatic theme mode manually", async () => {
    vi.setSystemTime(new Date("2026-03-01T09:00:00.000Z"));

    await renderProvider();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Usar escuro" }));
    });

    expect(screen.getByTestId("preferred-theme-mode-value")).toHaveTextContent(ThemeMode.DARK);
    expect(screen.getByTestId("theme-mode-value")).toHaveTextContent(ThemeMode.DARK);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("loads the authenticated user preference after the authentication state callback returns", async () => {
    await renderProvider();
    mockRpc.mockClear();

    act(() => {
      emitAuthStateChange(true);
    });

    expect(mockRpc).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockRpc).toHaveBeenCalledWith("get_current_user_theme_mode_preference");
  });
});
