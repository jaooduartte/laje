import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeMode } from "@/lib/enums";
import { AutomaticThemeProvider, useAutomaticThemeContext } from "@/components/theme/AutomaticThemeProvider";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      })),
    },
    rpc: vi.fn(),
  },
}));

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
  });

  afterEach(() => {
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
});
