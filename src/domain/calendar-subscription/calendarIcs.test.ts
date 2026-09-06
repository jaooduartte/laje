import { describe, expect, it } from "vitest";
import {
  buildCalendarDocument,
  resolveCalendarDescription,
  resolveETag,
  resolveMatchCalendarTitle,
  resolveScheduledSessionDateTime,
} from "../../../supabase/functions/calendar-subscription-feed/calendarIcs";

describe("calendar ICS document", () => {
  it("inclui o naipe no título do jogo e mantém a descrição em múltiplas linhas", () => {
    expect(
      resolveMatchCalendarTitle("Voleibol", "Masculino", "ENGÊNIOS", "UEFA"),
    ).toBe("LAJE · Voleibol Masculino — ENGÊNIOS x UEFA");
    expect(
      resolveCalendarDescription(["Interlaje", "Edição 2026", "Masculino"]),
    ).toBe("Interlaje\nEdição 2026\nMasculino");
  });

  it("gera evento estável, com CRLF, UTC e textos escapados", () => {
    const calendar = buildCalendarDocument([
      {
        uid: "match-123@laje.app",
        title: "LAJE, Futsal; A x B",
        description: "Copa LAJE\nAgenda pública",
        location: "Ginásio, Quadra A",
        startTime: "2026-09-10T13:00:00.000Z",
        endTime: "2026-09-10T14:00:00.000Z",
        updatedAt: "2026-09-01T12:00:00.000Z",
      },
    ]);

    expect(calendar).toContain("UID:match-123@laje.app");
    expect(calendar).toContain("TZID:America/Sao_Paulo");
    expect(calendar).toContain("DTSTART;TZID=America/Sao_Paulo:20260910T100000");
    expect(calendar).toContain("DTEND;TZID=America/Sao_Paulo:20260910T110000");
    expect(calendar).toContain("SUMMARY:LAJE\\, Futsal\\; A x B");
    expect(calendar).toContain("DESCRIPTION:Copa LAJE\\nAgenda pública");
    expect(calendar).toContain("LOCATION:Ginásio\\, Quadra A");
    expect(calendar).toContain("\r\n");
    expect(calendar.endsWith("\r\n")).toBe(true);
  });

  it("altera o ETag quando uma revisão do evento muda", async () => {
    const firstCalendar = buildCalendarDocument([
      {
        uid: "match-123@laje.app",
        title: "LAJE · Futsal — A x B",
        description: "Copa LAJE",
        location: "Quadra A",
        startTime: "2026-09-10T13:00:00.000Z",
        endTime: "2026-09-10T14:00:00.000Z",
        updatedAt: "2026-09-01T12:00:00.000Z",
      },
    ]);
    const updatedCalendar = buildCalendarDocument([
      {
        uid: "match-123@laje.app",
        title: "LAJE · Futsal — A x B",
        description: "Copa LAJE",
        location: "Quadra B",
        startTime: "2026-09-10T13:00:00.000Z",
        endTime: "2026-09-10T14:00:00.000Z",
        updatedAt: "2026-09-02T12:00:00.000Z",
      },
    ]);

    await expect(resolveETag(firstCalendar)).resolves.not.toBe(
      await resolveETag(updatedCalendar),
    );
  });

  it("combina a data e o horário de uma sessão no fuso da liga", () => {
    expect(resolveScheduledSessionDateTime("2026-09-10", "10:00:00")).toBe(
      "2026-09-10T13:00:00.000Z",
    );
    expect(resolveScheduledSessionDateTime("2026-09-10", "inválido")).toBeNull();
  });
});
