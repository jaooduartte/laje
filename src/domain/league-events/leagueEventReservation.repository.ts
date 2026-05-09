import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { LeagueEventReservationRequestStatus } from "@/lib/enums";
import type { LeagueEvent, LeagueEventReservationRequest } from "@/lib/types";

interface FetchLeagueEventReservationRequestsOptions {
  year: number;
  status?: LeagueEventReservationRequestStatus | null;
}

function resolveReservationRequestSelectQuery() {
  return "*, team:teams(*), approved_league_event:league_events(*)";
}

export async function fetchLeagueEventReservationRequests({
  year,
  status = null,
}: FetchLeagueEventReservationRequestsOptions) {
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
  payload: TablesInsert<"league_event_reservation_requests">,
) {
  return supabase
    .from("league_event_reservation_requests")
    .insert(payload)
    .select(resolveReservationRequestSelectQuery())
    .single();
}

export async function reviewLeagueEventReservationRequest({
  requestId,
  decision,
  reviewNotes,
}: {
  requestId: string;
  decision: LeagueEventReservationRequestStatus.APPROVED | LeagueEventReservationRequestStatus.REJECTED;
  reviewNotes?: string;
}): Promise<{
  data: {
    request: LeagueEventReservationRequest | null;
    league_event: LeagueEvent | null;
  } | null;
  error: Error | null;
}> {
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

  const payload = response.data as
    | {
        request?: LeagueEventReservationRequest | null;
        league_event?: LeagueEvent | null;
      }
    | null;

  return {
    data: {
      request: payload?.request ?? null,
      league_event: payload?.league_event ?? null,
    },
    error: null,
  };
}

export async function fetchPendingLeagueEventReservationRequestCount() {
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
  requesterContact: string;
}): TablesInsert<"league_event_reservation_requests"> {
  const normalizedEventName = formValues.eventName.trim();
  const normalizedRequesterName = formValues.requesterName.trim();
  const normalizedRequesterContact = formValues.requesterContact.replace(/\D/g, "");

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

  if (!normalizedRequesterContact) {
    throw new Error("Informe um contato do solicitante.");
  }

  if (normalizedRequesterContact.length < 10) {
    throw new Error("Informe um contato válido com DDD.");
  }

  return {
    team_id: formValues.teamId,
    event_name: normalizedEventName,
    event_type: formValues.eventType,
    event_date: format(formValues.eventDate, "yyyy-MM-dd"),
    requester_name: normalizedRequesterName,
    requester_contact: normalizedRequesterContact,
    status: LeagueEventReservationRequestStatus.PENDING,
  };
}
