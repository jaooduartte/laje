import { LeagueEventType } from "@/lib/enums";

export interface LeagueEventFormValues {
  name: string;
  eventType: LeagueEventType;
  organizerTeamIds: string[];
  location: string;
  eventDate: Date | null;
}
