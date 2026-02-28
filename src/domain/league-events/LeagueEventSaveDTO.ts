import type { TablesInsert } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { LeagueEventOrganizerType, LeagueEventType } from "@/lib/enums";
import type { LeagueEventFormValues } from "@/domain/league-events/leagueEvent.types";

export class LeagueEventSaveDTO {
  private readonly formValues: LeagueEventFormValues;

  constructor(formValues: LeagueEventFormValues) {
    this.formValues = formValues;
  }

  static fromFormValues(formValues: LeagueEventFormValues): LeagueEventSaveDTO {
    return new LeagueEventSaveDTO(formValues);
  }

  bindToSave(): TablesInsert<"league_events"> {
    const normalizedName = this.formValues.name.trim();
    const normalizedLocation = this.formValues.location.trim();

    if (!normalizedName) {
      throw new Error("Informe o nome do evento.");
    }

    if (!normalizedLocation) {
      throw new Error("Informe o local do evento.");
    }

    if (!this.formValues.eventDate) {
      throw new Error("Informe a data do evento.");
    }

    const resolvedOrganizerType =
      this.formValues.eventType == LeagueEventType.LAJE_EVENT
        ? LeagueEventOrganizerType.LAJE
        : LeagueEventOrganizerType.ATHLETIC;

    const resolvedOrganizerTeamId =
      resolvedOrganizerType == LeagueEventOrganizerType.ATHLETIC ? this.formValues.organizerTeamId : null;

    if (resolvedOrganizerType == LeagueEventOrganizerType.ATHLETIC && !resolvedOrganizerTeamId) {
      throw new Error("Selecione a atlética organizadora.");
    }

    return {
      name: normalizedName,
      event_type: this.formValues.eventType,
      organizer_type: resolvedOrganizerType,
      organizer_team_id: resolvedOrganizerTeamId,
      location: normalizedLocation,
      event_date: format(this.formValues.eventDate, "yyyy-MM-dd"),
    };
  }
}
