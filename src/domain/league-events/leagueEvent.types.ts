import {
  LeagueEventOrganizerType,
  LeagueEventReservationRequestStatus,
  LeagueEventType,
} from "@/lib/enums";

export interface LeagueEventFormValues {
  name: string;
  eventType: LeagueEventType | null;
  organizerTeamIds: string[];
  eventDate: Date | null;
}

type LeagueEventTypeValue = `${LeagueEventType}`;
type LeagueEventOrganizerTypeValue = `${LeagueEventOrganizerType}`;
type LeagueEventReservationRequestStatusValue = `${LeagueEventReservationRequestStatus}`;

/**
 * Contrato de escrita do domínio de eventos da liga.
 *
 * Mantido no domínio para que a API dedicada seja o contrato primário e para
 * evitar que DTOs/repositórios dependam dos tipos gerados pelo Supabase.
 */
export interface LeagueEventWritePayload {
  name: string;
  event_type: LeagueEventTypeValue;
  organizer_type: LeagueEventOrganizerTypeValue;
  organizer_team_id: string | null;
  event_date: string;
}

/**
 * Contrato de criação de uma solicitação pública de reserva do calendário.
 * Os campos de revisão continuam sendo responsabilidade exclusiva do backend.
 */
export interface LeagueEventReservationCreatePayload {
  team_id: string;
  event_name: string;
  event_type: LeagueEventTypeValue;
  event_date: string;
  requester_name: string;
  requester_email: string;
  status: LeagueEventReservationRequestStatusValue;
}
