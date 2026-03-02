import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeMode } from "@/lib/enums";
import { AutomaticThemeProvider, useAutomaticThemeContext } from "@/components/theme/AutomaticThemeProvider";

function ThemeModeTestValue() {
  const { themeMode } = useAutomaticThemeContext();

  return <span data-testid="theme-mode-value">{themeMode}</span>;
}

describe("AutomaticThemeProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.classList.remove("dark");
  });

  it("should apply dark class during night window", () => {
    vi.setSystemTime(new Date("2026-03-01T21:00:00.000Z"));

    render(
      <AutomaticThemeProvider>
        <ThemeModeTestValue />
      </AutomaticThemeProvider>,
    );

    expect(screen.getByTestId("theme-mode-value")).toHaveTextContent(ThemeMode.DARK);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("should apply light class during day window", () => {
    vi.setSystemTime(new Date("2026-03-01T09:00:00.000Z"));
    document.documentElement.classList.add("dark");

    render(
      <AutomaticThemeProvider>
        <ThemeModeTestValue />
      </AutomaticThemeProvider>,
    );

    expect(screen.getByTestId("theme-mode-value")).toHaveTextContent(ThemeMode.LIGHT);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
