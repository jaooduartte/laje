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
      requesterEmail: "  Joao.Duarte@Email.com ",
    });

    expect(payload).toEqual({
      team_id: "team-1",
      event_name: "Churrasco de integração",
      event_type: LeagueEventType.OPEN_BAR,
      event_date: "2026-07-18",
      requester_name: "João Duarte",
      requester_email: "joao.duarte@email.com",
      status: LeagueEventReservationRequestStatus.PENDING,
    });
  });

  it("exige nome e email do solicitante", () => {
    expect(() => {
      bindLeagueEventReservationRequestPayload({
        teamId: "team-1",
        eventName: "Reserva sem nome",
        eventType: LeagueEventType.HH,
        eventDate: new Date("2026-07-18T20:00:00.000Z"),
        requesterName: "   ",
        requesterEmail: "solicitante@email.com",
      });
    }).toThrow("Informe o nome do solicitante.");

    expect(() => {
      bindLeagueEventReservationRequestPayload({
        teamId: "team-1",
        eventName: "Reserva sem email",
        eventType: LeagueEventType.HH,
        eventDate: new Date("2026-07-18T20:00:00.000Z"),
        requesterName: "Solicitante",
        requesterEmail: "   ",
      });
    }).toThrow("Informe o email do solicitante.");

    expect(() => {
      bindLeagueEventReservationRequestPayload({
        teamId: "team-1",
        eventName: "Reserva com email inválido",
        eventType: LeagueEventType.HH,
        eventDate: new Date("2026-07-18T20:00:00.000Z"),
        requesterName: "Solicitante",
        requesterEmail: "email-invalido",
      });
    }).toThrow("Informe um email válido.");
  });
});
