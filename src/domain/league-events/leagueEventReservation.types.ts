import { LeagueEventType, LeagueEventReservationRequestStatus } from "@/lib/enums";

export interface LeagueEventReservationRequestFormValues {
  teamId: string;
  eventName: string;
  eventType: LeagueEventType | null;
  eventDate: Date | null;
  requesterName: string;
  requesterContact: string;
}

export const LEAGUE_EVENT_RESERVATION_REQUEST_STATUS_LABELS: Record<
  LeagueEventReservationRequestStatus,
  string
> = {
  [LeagueEventReservationRequestStatus.PENDING]: "Pendente",
  [LeagueEventReservationRequestStatus.APPROVED]: "Aprovada",
  [LeagueEventReservationRequestStatus.REJECTED]: "Recusada",
};
