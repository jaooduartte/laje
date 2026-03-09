import { LeagueEventType } from "@/lib/enums";

export interface LeagueEventFormValues {
  name: string;
  eventType: LeagueEventType | null;
  organizerTeamIds: string[];
  location: string;
  eventDate: Date | null;
}
