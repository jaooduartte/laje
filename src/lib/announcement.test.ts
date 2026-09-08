import { describe, expect, it } from "vitest";
import {
  createAnnouncementContent,
  normalizeAnnouncementContent,
  resolveAnnouncementType,
} from "@/lib/announcement";

describe("announcement content", () => {
  it("normalizes text into a single line and preserves supported marks", () => {
    expect(
      normalizeAnnouncementContent({
        version: 1,
        segments: [
          { text: "Nova\n", bold: true },
          { text: " funcionalidade", italic: true, underline: true },
        ],
      }),
    ).toEqual({
      version: 1,
      segments: [
        { text: "Nova ", bold: true },
        { text: " funcionalidade", italic: true, underline: true },
      ],
    });
  });

  it("falls back to a plain legacy announcement and the notice type", () => {
    expect(createAnnouncementContent("  Aviso\nimportante  ")).toEqual({
      version: 1,
      segments: [{ text: "Aviso importante" }],
    });
    expect(resolveAnnouncementType("unknown")).toBe("NOTICE");
  });
});
