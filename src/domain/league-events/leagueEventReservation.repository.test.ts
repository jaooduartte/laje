import { describe, expect, it } from "vitest";
import { bindLeagueEventReservationRequestPayload } from "@/domain/league-events/leagueEventReservation.repository";
import { LeagueEventReservationRequestStatus, LeagueEventType } from "@/lib/enums";

describe("bindLeagueEventReservationRequestPayload", () => {
  it("normaliza os dados da reserva pública e marca a solicitação como pendente", () => {
    const payload = bindLeagueEventReservationRequestPayload({
      teamId: "team-1",
      eventName: "  Churrasco de integração  ",
      eventType: LeagueEventType.OPEN_BAR,
      eventDate: new Date("2026-07-18T20:00:00.000Z"),
      requesterName: "  João Duarte ",
      requesterContact: "  (47)99991-9004 ",
    });

    expect(payload).toEqual({
      team_id: "team-1",
      event_name: "Churrasco de integração",
      event_type: LeagueEventType.OPEN_BAR,
      event_date: "2026-07-18",
      requester_name: "João Duarte",
      requester_contact: "47999919004",
      status: LeagueEventReservationRequestStatus.PENDING,
    });
  });

  it("exige nome e contato do solicitante", () => {
    expect(() => {
      bindLeagueEventReservationRequestPayload({
        teamId: "team-1",
        eventName: "Reserva sem nome",
        eventType: LeagueEventType.HH,
        eventDate: new Date("2026-07-18T20:00:00.000Z"),
        requesterName: "   ",
        requesterContact: "(47)99991-9004",
      });
    }).toThrow("Informe o nome do solicitante.");

    expect(() => {
      bindLeagueEventReservationRequestPayload({
        teamId: "team-1",
        eventName: "Reserva sem contato",
        eventType: LeagueEventType.HH,
        eventDate: new Date("2026-07-18T20:00:00.000Z"),
        requesterName: "Solicitante",
        requesterContact: "   ",
      });
    }).toThrow("Informe um contato do solicitante.");

    expect(() => {
      bindLeagueEventReservationRequestPayload({
        teamId: "team-1",
        eventName: "Reserva com contato inválido",
        eventType: LeagueEventType.HH,
        eventDate: new Date("2026-07-18T20:00:00.000Z"),
        requesterName: "Solicitante",
        requesterContact: "(47)9999-123",
      });
    }).toThrow("Informe um contato válido com DDD.");
  });
});
