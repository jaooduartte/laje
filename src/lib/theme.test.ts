import { describe, expect, it } from "vitest";
import { ThemeMode } from "@/lib/enums";
import { resolveSaoPauloHourAndMinute, resolveThemeModeByTime } from "@/lib/theme";

describe("theme", () => {
  it("should resolve Sao Paulo hour and minute", () => {
    const resolvedHourAndMinute = resolveSaoPauloHourAndMinute(new Date("2026-03-01T08:59:00.000Z"));

    expect(resolvedHourAndMinute.hour).toBe(5);
    expect(resolvedHourAndMinute.minute).toBe(59);
  });

  it("should resolve dark mode at 05:59", () => {
    expect(resolveThemeModeByTime(new Date("2026-03-01T08:59:00.000Z"))).toBe(ThemeMode.DARK);
  });

  it("should resolve light mode at 06:00", () => {
    expect(resolveThemeModeByTime(new Date("2026-03-01T09:00:00.000Z"))).toBe(ThemeMode.LIGHT);
  });

  it("should resolve light mode at 17:59", () => {
    expect(resolveThemeModeByTime(new Date("2026-03-01T20:59:00.000Z"))).toBe(ThemeMode.LIGHT);
  });

  it("should resolve dark mode at 18:00", () => {
    expect(resolveThemeModeByTime(new Date("2026-03-01T21:00:00.000Z"))).toBe(ThemeMode.DARK);
  });
});
