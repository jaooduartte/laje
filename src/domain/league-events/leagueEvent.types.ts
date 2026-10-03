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

/**
 * Contrato de escrita do domínio de eventos da liga.
 *
 * Mantido no domínio para que a API dedicada seja o contrato primário e para
 * evitar que DTOs/repositórios dependam dos tipos gerados pelo Supabase.
 */
export interface LeagueEventWritePayload {
  name: string;
  event_type: LeagueEventType;
  organizer_type: LeagueEventOrganizerType;
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
  event_type: LeagueEventType;
  event_date: string;
  requester_name: string;
  requester_email: string;
  status: LeagueEventReservationRequestStatus;
}
