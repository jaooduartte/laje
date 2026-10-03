import type { LeagueEventReservationRequest, Team } from "@/lib/types";
import { lajeApiRequest } from "./client";

interface DataResponse<DataType> {
  data: DataType;
}

interface ApiTeamDto {
  id: string;
  name: string;
  city?: string | null;
  division?: Team["division"];
  isActive?: boolean;
  createdAt?: string;
}

interface ApiReservationConflictDto {
  id: string;
  teamId: string;
  eventName: string;
  eventType: LeagueEventReservationRequest["event_type"];
  eventDate: string;
  status: LeagueEventReservationRequest["status"];
  createdAt: string;
  updatedAt: string;
  team: ApiTeamDto;
}

function toTeam(dto: ApiTeamDto): Team {
  return {
    id: dto.id,
    name: dto.name,
    city: dto.city ?? "",
    division: dto.division ?? null,
    is_active: dto.isActive ?? true,
    created_at: dto.createdAt ?? "",
  };
}

function toReservationConflict(dto: ApiReservationConflictDto): LeagueEventReservationRequest {
  return {
    id: dto.id,
    team_id: dto.teamId,
    event_name: dto.eventName,
    event_type: dto.eventType,
    event_date: dto.eventDate,
    requester_name: "",
    requester_email: "",
    status: dto.status,
    approved_league_event_id: null,
    review_notes: null,
    reviewed_at: null,
    reviewed_by: null,
    created_at: dto.createdAt,
    updated_at: dto.updatedAt,
    team: toTeam(dto.team),
    approved_league_event: null,
  };
}

export async function listPendingReservationConflictsFromApi(date: string) {
  const search = new URLSearchParams({ date });
  const response = await lajeApiRequest<DataResponse<ApiReservationConflictDto[]>>(
    `/league-events/reservation-requests/conflicts?${search.toString()}`,
  );

  return response.data.map(toReservationConflict);
}
