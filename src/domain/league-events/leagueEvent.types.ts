import { LeagueEventType } from "@/lib/enums";

export interface LeagueEventFormValues {
  name: string;
  eventType: LeagueEventType;
  organizerTeamId: string | null;
  location: string;
  eventDate: Date | null;
}
