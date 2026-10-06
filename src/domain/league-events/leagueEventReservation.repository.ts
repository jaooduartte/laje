import { format } from "date-fns";
import { isAwsBackendEnabled } from "@/config/environment";
import type { LeagueEventReservationCreatePayload } from "@/domain/league-events/leagueEvent.types";
import {
  createLeagueEventReservationRequestFromApi,
  fetchPendingReservationRequestCountFromApi,
  listLeagueEventReservationRequestsFromApi,
  reviewLeagueEventReservationRequestFromApi,
} from "@/integrations/laje-api/public-content";
import { listPendingReservationConflictsFromApi } from "@/integrations/laje-api/reservation-conflicts";
import { supabase } from "@/integrations/supabase/client";
import { LeagueEventReservationRequestStatus } from "@/lib/enums";
import type { LeagueEvent, LeagueEventReservationRequest } from "@/lib/types";

interface FetchLeagueEventReservationRequestsOptions {
  year: number;
  status?: LeagueEventReservationRequestStatus | null;
}

function shouldUseLajeApi() {
  return isAwsBackendEnabled();
}

function normalizeApiError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error("Não foi possível acessar as reservas do calendário.");
}

function resolveReservationRequestSelectQuery() {
  return "*, team:teams(*), approved_league_event:league_events(*)";
}

export async function fetchLeagueEventReservationRequests({
  year,
  status = null,
}: FetchLeagueEventReservationRequestsOptions) {
  if (shouldUseLajeApi()) {
    try {
      return {
        data: await listLeagueEventReservationRequestsFromApi({ year, status }),
        error: null,
      };
    } catch (error) {
      return { data: [], error: normalizeApiError(error) };
    }
  }

  let query = supabase
    .from("league_event_reservation_requests")
    .select(resolveReservationRequestSelectQuery())
    .gte("event_date", `${year.toString()}-01-01`)
    .lte("event_date", `${year.toString()}-12-31`)
    .order("created_at", { ascending: true });

  if (status) {
    query = query.eq("status", status);
  }

  return query;
}

export async function createLeagueEventReservationRequest(
  payload: LeagueEventReservationCreatePayload,
) {
  if (shouldUseLajeApi()) {
    try {
      return {
        data: await createLeagueEventReservationRequestFromApi(payload),
        error: null,
      };
    } catch (error) {
      return { data: null, error: normalizeApiError(error) };
    }
  }

  return supabase.from("league_event_reservation_requests").insert(payload);
}

export async function reviewLeagueEventReservationRequest({
  requestId,
  decision,
  reviewNotes,
}: {
  requestId: string;
  decision:
    LeagueEventReservationRequestStatus.APPROVED | LeagueEventReservationRequestStatus.REJECTED;
  reviewNotes?: string;
}): Promise<{
  data: {
    request: LeagueEventReservationRequest | null;
    league_event: LeagueEvent | null;
  } | null;
  error: Error | null;
}> {
  if (shouldUseLajeApi()) {
    try {
      const data = await reviewLeagueEventReservationRequestFromApi({
        requestId,
        decision,
        reviewNotes: reviewNotes?.trim() || undefined,
      });
      return { data, error: null };
    } catch (error) {
      return { data: null, error: normalizeApiError(error) };
    }
  }

  const response = await supabase.rpc("review_league_event_reservation_request", {
    _request_id: requestId,
    _decision: decision,
    _review_notes: reviewNotes?.trim() || null,
  });

  if (response.error) {
    return {
      data: null,
      error: response.error,
    };
  }

  const responsePayload = response.data as {
    request?: LeagueEventReservationRequest | null;
    league_event?: LeagueEvent | null;
  } | null;

  return {
    data: {
      request: responsePayload?.request ?? null,
      league_event: responsePayload?.league_event ?? null,
    },
    error: null,
  };
}

export async function fetchPendingReservationRequestsByDate(date: string) {
  if (shouldUseLajeApi()) {
    try {
      return {
        data: await listPendingReservationConflictsFromApi(date),
        error: null,
      };
    } catch (error) {
      return { data: [], error: normalizeApiError(error) };
    }
  }

  return supabase
    .from("league_event_reservation_requests")
    .select(resolveReservationRequestSelectQuery())
    .eq("event_date", date)
    .eq("status", LeagueEventReservationRequestStatus.PENDING);
}

export async function fetchPendingLeagueEventReservationRequestCount() {
  if (shouldUseLajeApi()) {
    try {
      return {
        count: await fetchPendingReservationRequestCountFromApi(),
        data: null,
        error: null,
      };
    } catch (error) {
      return { count: null, data: null, error: normalizeApiError(error) };
    }
  }

  return supabase
    .from("league_event_reservation_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", LeagueEventReservationRequestStatus.PENDING);
}

export function bindLeagueEventReservationRequestPayload(formValues: {
  teamId: string;
  eventName: string;
  eventType: string | null;
  eventDate: Date | null;
  requesterName: string;
  requesterEmail: string;
}): LeagueEventReservationCreatePayload {
  const normalizedEventName = formValues.eventName.trim();
  const normalizedRequesterName = formValues.requesterName.trim();
  const normalizedRequesterEmail = formValues.requesterEmail.trim().toLowerCase();

  if (!formValues.teamId) {
    throw new Error("Selecione a atlética responsável pela reserva.");
  }

  if (!normalizedEventName) {
    throw new Error("Informe o nome do evento.");
  }

  if (!formValues.eventType) {
    throw new Error("Selecione o tipo do evento.");
  }

  if (!formValues.eventDate) {
    throw new Error("Informe a data do evento.");
  }

  if (!normalizedRequesterName) {
    throw new Error("Informe o nome do solicitante.");
  }

  if (!normalizedRequesterEmail) {
    throw new Error("Informe o email do solicitante.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedRequesterEmail)) {
    throw new Error("Informe um email válido.");
  }

  return {
    team_id: formValues.teamId,
    event_name: normalizedEventName,
    event_type: formValues.eventType as LeagueEventReservationCreatePayload["event_type"],
    event_date: format(formValues.eventDate, "yyyy-MM-dd"),
    requester_name: normalizedRequesterName,
    requester_email: normalizedRequesterEmail,
    status: LeagueEventReservationRequestStatus.PENDING,
  };
}
