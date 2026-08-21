import { describe, expect, it } from "vitest";
import { shouldRenderMatchScheduleChange } from "@/components/admin/adminLogsMatchSlot.utils";

describe("shouldRenderMatchScheduleChange", () => {
  it("mantém somente o slot agendado como número do jogo", () => {
    expect(shouldRenderMatchScheduleChange("queue_position", 6)).toBe(false);
    expect(shouldRenderMatchScheduleChange("scheduled_slot", 7)).toBe(true);
  });

  it("oculta slots agendados temporários", () => {
    expect(
      shouldRenderMatchScheduleChange("scheduled_slot", 1001),
    ).toBe(false);
  });
});
