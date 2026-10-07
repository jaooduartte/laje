import { describe, expect, it } from "vitest";
import { resolveMatchScheduledDateValue } from "@/lib/championship";

describe("resolveMatchScheduledDateValue", () => {
  it("keeps valid scheduled dates", () => {
    expect(
      resolveMatchScheduledDateValue({
        scheduled_date: "2026-10-11",
        start_time: null,
      }),
    ).toBe("2026-10-11");
  });

  it("rejects malformed scheduled dates instead of propagating Invalid Date", () => {
    expect(
      resolveMatchScheduledDateValue({
        scheduled_date: "null",
        start_time: null,
      }),
    ).toBeNull();

    expect(
      resolveMatchScheduledDateValue({
        scheduled_date: "2026-02-31",
        start_time: null,
      }),
    ).toBeNull();
  });

  it("falls back to start_time when scheduled_date is invalid", () => {
    expect(
      resolveMatchScheduledDateValue({
        scheduled_date: "invalid-date",
        start_time: "2026-10-11T15:00:00-03:00",
      }),
    ).toBe("2026-10-11");
  });
});
