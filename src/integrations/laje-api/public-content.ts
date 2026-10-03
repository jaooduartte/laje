import type {
  LeagueEventReservationCreatePayload,
  LeagueEventWritePayload,
} from "@/domain/league-events/leagueEvent.types";
import type {
  LeagueEvent,
  LeagueEventReservationRequest,
  PublicAccessSettings,
  PublicLinkItem,
  PublicLinkSection,
  Team,
} from "@/lib/types";
import { lajeApiRequest } from "./client";

interface DataResponse<DataType> {
  data: DataType;
}

interface ApiTeamDto {
  id: string;
  name: string;
  city?: string | null;
  division?: Team["division"];
  is_active?: boolean;
  isActive?: boolean;
  created_at?: string;
  createdAt?: string;
}

interface ApiLeagueEventDto {
  id: string;
  name: string;
  eventType: LeagueEvent["event_type"];
  organizerType: LeagueEvent["organizer_type"];
  organizerTeamId: string | null;
  eventDate: string;
  createdAt: string;
  updatedAt: string;
  organizerTeam?: ApiTeamDto | null;
  organizerTeams?: ApiTeamDto[] | null;
}

interface ApiReservationDto {
  id: string;
  teamId: string;
  eventName: string;
  eventType: LeagueEventReservationRequest["event_type"];
  eventDate: string;
  requesterName: string;
  requesterEmail: string;
  status: LeagueEventReservationRequest["status"];
  approvedLeagueEventId: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
  team?: ApiTeamDto | null;
  approvedLeagueEvent?: ApiLeagueEventDto | null;
}

interface ApiPublicLinkFilterDto {
  id: string;
  publicLinkItemId: string;
  championshipId: string;
  seasonYear: number;
  createdAt: string;
}

interface ApiPublicLinkItemDto {
  id: string;
  sectionId: string;
  displayName: string;
  url: string;
  sortOrder: number;
  isActive: boolean;
  filterMode: PublicLinkItem["filter_mode"];
  createdAt: string;
  updatedAt: string;
  publicLinkItemFilters?: ApiPublicLinkFilterDto[] | null;
}

interface ApiPublicLinkSectionDto {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  publicLinkItems?: ApiPublicLinkItemDto[] | null;
}

interface ApiPublicAccessSettingsDto {
  isPublicAccessBlocked: boolean;
  isLivePageBlocked: boolean;
  isChampionshipsPageBlocked: boolean;
  isSchedulePageBlocked: boolean;
  isLeagueCalendarPageBlocked: boolean;
  isLinksPageBlocked: boolean;
  blockedMessage: string | null;
  announcementMessage: string | null;
  announcementContent: PublicAccessSettings["announcement_content"];
  announcementType: PublicAccessSettings["announcement_type"];
  updatedAt: string;
}

export interface PublicLinkFilterWriteInput {
  championshipId: string;
  seasonYear: number;
}

export interface PublicLinkItemWriteInput {
  sectionId: string;
  displayName: string;
  url: string;
  sortOrder: number;
  isActive: boolean;
  filterMode: PublicLinkItem["filter_mode"];
  filters: PublicLinkFilterWriteInput[];
}

export interface PublicLinkSectionWriteInput {
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

function toTeam(dto: ApiTeamDto): Team {
  return {
    id: dto.id,
    name: dto.name,
    city: dto.city ?? "",
    division: dto.division ?? null,
    is_active: dto.is_active ?? dto.isActive ?? true,
    created_at: dto.created_at ?? dto.createdAt ?? "",
  };
}

function toLeagueEvent(dto: ApiLeagueEventDto): LeagueEvent {
  return {
    id: dto.id,
    name: dto.name,
    event_type: dto.eventType,
    organizer_type: dto.organizerType,
    organizer_team_id: dto.organizerTeamId,
    event_date: dto.eventDate,
    created_at: dto.createdAt,
    updated_at: dto.updatedAt,
    organizer_team: dto.organizerTeam ? toTeam(dto.organizerTeam) : null,
    organizer_teams: (dto.organizerTeams ?? []).map(toTeam),
  };
}

function toReservation(dto: ApiReservationDto): LeagueEventReservationRequest {
  return {
    id: dto.id,
    team_id: dto.teamId,
    event_name: dto.eventName,
    event_type: dto.eventType,
    event_date: dto.eventDate,
    requester_name: dto.requesterName,
    requester_email: dto.requesterEmail,
    status: dto.status,
    approved_league_event_id: dto.approvedLeagueEventId,
    review_notes: dto.reviewNotes,
    reviewed_at: dto.reviewedAt,
    reviewed_by: dto.reviewedBy,
    created_at: dto.createdAt,
    updated_at: dto.updatedAt,
    team: dto.team ? toTeam(dto.team) : null,
    approved_league_event: dto.approvedLeagueEvent ? toLeagueEvent(dto.approvedLeagueEvent) : null,
  };
}

function toPublicLinkItem(dto: ApiPublicLinkItemDto): PublicLinkItem {
  return {
    id: dto.id,
    section_id: dto.sectionId,
    display_name: dto.displayName,
    url: dto.url,
    sort_order: dto.sortOrder,
    is_active: dto.isActive,
    filter_mode: dto.filterMode,
    created_at: dto.createdAt,
    updated_at: dto.updatedAt,
    public_link_item_filters: (dto.publicLinkItemFilters ?? []).map((filter) => ({
      id: filter.id,
      public_link_item_id: filter.publicLinkItemId,
      championship_id: filter.championshipId,
      season_year: filter.seasonYear,
      created_at: filter.createdAt,
    })),
  };
}

function toPublicLinkSection(dto: ApiPublicLinkSectionDto): PublicLinkSection {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description,
    sort_order: dto.sortOrder,
    is_active: dto.isActive,
    created_at: dto.createdAt,
    updated_at: dto.updatedAt,
    public_link_items: (dto.publicLinkItems ?? []).map(toPublicLinkItem),
  };
}

function toPublicAccessSettings(dto: ApiPublicAccessSettingsDto): PublicAccessSettings {
  return {
    is_public_access_blocked: dto.isPublicAccessBlocked,
    is_live_page_blocked: dto.isLivePageBlocked,
    is_championships_page_blocked: dto.isChampionshipsPageBlocked,
    is_schedule_page_blocked: dto.isSchedulePageBlocked,
    is_league_calendar_page_blocked: dto.isLeagueCalendarPageBlocked,
    is_links_page_blocked: dto.isLinksPageBlocked,
    blocked_message: dto.blockedMessage,
    announcement_message: dto.announcementMessage,
    announcement_content: dto.announcementContent,
    announcement_type: dto.announcementType,
    updated_at: dto.updatedAt,
  };
}

function toEventWritePayload(payload: LeagueEventWritePayload, organizerTeamIds: string[]) {
  return {
    name: payload.name,
    eventType: payload.event_type,
    eventDate: payload.event_date,
    organizerTeamIds,
  };
}

export async function listLeagueEventsFromApi(
  filters: { startDate?: string; endDate?: string; year?: number } = {},
) {
  const search = new URLSearchParams();
  if (filters.startDate) search.set("from", filters.startDate);
  if (filters.endDate) search.set("to", filters.endDate);
  if (filters.year) search.set("year", String(filters.year));
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  const response = await lajeApiRequest<DataResponse<ApiLeagueEventDto[]>>(
    `/league-events${suffix}`,
  );
  return response.data.map(toLeagueEvent);
}

export async function createLeagueEventFromApi(
  payload: LeagueEventWritePayload,
  organizerTeamIds: string[],
) {
  const response = await lajeApiRequest<DataResponse<ApiLeagueEventDto>>("/league-events", {
    method: "POST",
    body: JSON.stringify(toEventWritePayload(payload, organizerTeamIds)),
  });
  return toLeagueEvent(response.data);
}

export async function updateLeagueEventFromApi(
  eventId: string,
  payload: LeagueEventWritePayload,
  organizerTeamIds: string[],
) {
  const response = await lajeApiRequest<DataResponse<ApiLeagueEventDto>>(
    `/league-events/${eventId}`,
    {
      method: "PUT",
      body: JSON.stringify(toEventWritePayload(payload, organizerTeamIds)),
    },
  );
  return toLeagueEvent(response.data);
}

export async function deleteLeagueEventFromApi(eventId: string) {
  await lajeApiRequest<void>(`/league-events/${eventId}`, { method: "DELETE" });
}

export async function listLeagueEventReservationRequestsFromApi(
  filters: {
    year?: number;
    status?: LeagueEventReservationRequest["status"] | null;
    date?: string;
  } = {},
) {
  const search = new URLSearchParams();
  if (filters.year) search.set("year", String(filters.year));
  if (filters.status) search.set("status", filters.status);
  if (filters.date) search.set("date", filters.date);
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  const response = await lajeApiRequest<DataResponse<ApiReservationDto[]>>(
    `/league-events/reservation-requests${suffix}`,
  );
  return response.data.map(toReservation);
}

export async function createLeagueEventReservationRequestFromApi(
  payload: LeagueEventReservationCreatePayload,
) {
  const response = await lajeApiRequest<DataResponse<ApiReservationDto>>(
    "/league-events/reservation-requests",
    {
      method: "POST",
      body: JSON.stringify({
        teamId: payload.team_id,
        eventName: payload.event_name,
        eventType: payload.event_type,
        eventDate: payload.event_date,
        requesterName: payload.requester_name,
        requesterEmail: payload.requester_email,
      }),
    },
  );
  return toReservation(response.data);
}

export async function reviewLeagueEventReservationRequestFromApi(input: {
  requestId: string;
  decision: LeagueEventReservationRequest["status"];
  reviewNotes?: string;
}) {
  const response = await lajeApiRequest<
    DataResponse<{ request: ApiReservationDto; leagueEvent: ApiLeagueEventDto | null }>
  >(`/league-events/reservation-requests/${input.requestId}/review`, {
    method: "POST",
    body: JSON.stringify({ decision: input.decision, reviewNotes: input.reviewNotes }),
  });
  return {
    request: toReservation(response.data.request),
    league_event: response.data.leagueEvent ? toLeagueEvent(response.data.leagueEvent) : null,
  };
}

export async function fetchPendingReservationRequestCountFromApi() {
  const response = await lajeApiRequest<DataResponse<{ count: number }>>(
    "/league-events/reservation-requests/pending-count",
  );
  return response.data.count;
}

export async function listLeagueEventYearsFromApi() {
  const response = await lajeApiRequest<DataResponse<number[]>>("/league-events/years");
  return response.data;
}

export async function getPublicAccessSettingsFromApi() {
  const response =
    await lajeApiRequest<DataResponse<ApiPublicAccessSettingsDto | null>>("/public/settings");
  return response.data ? toPublicAccessSettings(response.data) : null;
}

export async function updatePublicAccessSettingsFromApi(settings: PublicAccessSettings) {
  const response = await lajeApiRequest<DataResponse<ApiPublicAccessSettingsDto>>(
    "/public/settings",
    {
      method: "PUT",
      body: JSON.stringify({
        isPublicAccessBlocked: settings.is_public_access_blocked,
        isLivePageBlocked: settings.is_live_page_blocked,
        isChampionshipsPageBlocked: settings.is_championships_page_blocked,
        isSchedulePageBlocked: settings.is_schedule_page_blocked,
        isLeagueCalendarPageBlocked: settings.is_league_calendar_page_blocked,
        isLinksPageBlocked: settings.is_links_page_blocked,
        blockedMessage: settings.blocked_message,
        announcementMessage: settings.announcement_message,
        announcementContent: settings.announcement_content,
        announcementType: settings.announcement_type,
      }),
    },
  );
  return toPublicAccessSettings(response.data);
}

export async function listPublicLinkSectionsFromApi(includeInactive = false) {
  const response = await lajeApiRequest<DataResponse<ApiPublicLinkSectionDto[]>>(
    includeInactive ? "/public/links/admin" : "/public/links",
  );
  return response.data.map(toPublicLinkSection);
}

export async function createPublicLinkSectionFromApi(input: PublicLinkSectionWriteInput) {
  const response = await lajeApiRequest<DataResponse<ApiPublicLinkSectionDto>>(
    "/public/link-sections",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return toPublicLinkSection(response.data);
}

export async function updatePublicLinkSectionFromApi(
  sectionId: string,
  input: PublicLinkSectionWriteInput,
) {
  const response = await lajeApiRequest<DataResponse<ApiPublicLinkSectionDto>>(
    `/public/link-sections/${sectionId}`,
    { method: "PUT", body: JSON.stringify(input) },
  );
  return toPublicLinkSection(response.data);
}

export async function deletePublicLinkSectionFromApi(sectionId: string) {
  await lajeApiRequest<void>(`/public/link-sections/${sectionId}`, { method: "DELETE" });
}

export async function createPublicLinkItemFromApi(input: PublicLinkItemWriteInput) {
  const response = await lajeApiRequest<DataResponse<ApiPublicLinkItemDto>>("/public/link-items", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return toPublicLinkItem(response.data);
}

export async function updatePublicLinkItemFromApi(itemId: string, input: PublicLinkItemWriteInput) {
  const response = await lajeApiRequest<DataResponse<ApiPublicLinkItemDto>>(
    `/public/link-items/${itemId}`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
  return toPublicLinkItem(response.data);
}

export async function deletePublicLinkItemFromApi(itemId: string) {
  await lajeApiRequest<void>(`/public/link-items/${itemId}`, { method: "DELETE" });
}
