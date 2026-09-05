import { describe, expect, it, vi } from "vitest";
import {
  canSubscribeToCalendar,
  resolveCalendarSubscriptionUrls,
  resolveMatchCalendarSubscriptionOptions,
  resolveSessionCalendarSubscriptionOptions,
} from "@/domain/calendar-subscription/calendarSubscription";
import { MatchNaipe, MatchStatus } from "@/lib/enums";
import type { ChampionshipIndividualSession, Match, Team } from "@/lib/types";

const now = new Date("2026-09-05T12:00:00.000Z");

function buildMatch(): Match {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    championship_id: "22222222-2222-4222-8222-222222222222",
    season_year: 2026,
    division: null,
    naipe: MatchNaipe.MASCULINO,
    supports_cards: false,
    sport_id: "33333333-3333-4333-8333-333333333333",
    home_team_id: "44444444-4444-4444-8444-444444444444",
    away_team_id: "55555555-5555-4555-8555-555555555555",
    location: "Ginásio Central",
    court_name: "Quadra A",
    scheduled_date: "2026-09-10",
    queue_position: 1,
    start_time: "2026-09-10T13:00:00.000Z",
    end_time: "2026-09-10T14:00:00.000Z",
    status: MatchStatus.SCHEDULED,
    home_score: 0,
    away_score: 0,
    home_yellow_cards: 0,
    home_red_cards: 0,
    away_yellow_cards: 0,
    away_red_cards: 0,
    created_at: "2026-09-01T12:00:00.000Z",
    sports: {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Futsal",
      created_at: "2026-09-01T12:00:00.000Z",
    },
    home_team: {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Atlética A",
      city: "Joinville",
      division: null,
      created_at: "2026-09-01T12:00:00.000Z",
    },
    away_team: {
      id: "55555555-5555-4555-8555-555555555555",
      name: "Atlética B",
      city: "Joinville",
      division: null,
      created_at: "2026-09-01T12:00:00.000Z",
    },
  };
}

function buildSession(): ChampionshipIndividualSession {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    championship_id: "22222222-2222-4222-8222-222222222222",
    season_year: 2026,
    sport_id: "77777777-7777-4777-8777-777777777777",
    naipe: MatchNaipe.FEMININO,
    division: null,
    scheduled_date: "2026-09-10",
    period: null,
    start_time: "2026-09-10T13:00:00.000Z",
    end_time: "2026-09-10T14:00:00.000Z",
    location_key: null,
    court_key: null,
    location_name: "Pista",
    court_name: null,
    status: "SCHEDULED",
    exclusive_lock_enabled: false,
    created_at: "2026-09-01T12:00:00.000Z",
    updated_at: "2026-09-01T12:00:00.000Z",
    sports: {
      id: "77777777-7777-4777-8777-777777777777",
      name: "Atletismo",
      created_at: "2026-09-01T12:00:00.000Z",
    },
  };
}

describe("calendar subscriptions", () => {
  it("gera opções por jogo e por atlética no recorte da modalidade e do naipe", () => {
    const options = resolveMatchCalendarSubscriptionOptions(buildMatch());

    expect(options.map((option) => option.scope)).toEqual([
      "MATCH",
      "TEAM_SPORT_NAIPE",
      "TEAM_SPORT_NAIPE",
      "TEAM",
      "TEAM",
    ]);
    expect(options.map((option) => option.label)).toEqual([
      "Este jogo",
      "Jogos de Futsal masculino da Atlética A",
      "Jogos de Futsal masculino da Atlética B",
      "Todos os jogos da Atlética A",
      "Todos os jogos da Atlética B",
    ]);
  });

  it("inclui a sessão e as atléticas participantes nas opções individuais", () => {
    const participantTeam = {
      id: "88888888-8888-4888-8888-888888888888",
      name: "Atlética Atletismo",
      city: "Joinville",
      division: null,
      created_at: "2026-09-01T12:00:00.000Z",
    } satisfies Team;
    const options = resolveSessionCalendarSubscriptionOptions(buildSession(), [participantTeam]);

    expect(options.map((option) => option.scope)).toEqual([
      "SESSION",
      "SPORT_NAIPE",
      "TEAM",
    ]);
    expect(options[2]?.label).toBe("Jogos da Atlética Atletismo");
  });

  it("gera URLs HTTPS para download e webcal para assinatura", () => {
    const option = resolveMatchCalendarSubscriptionOptions(buildMatch())[0]!;
    const urls = resolveCalendarSubscriptionUrls(
      option,
      "https://project.supabase.co",
    );

    expect(urls?.downloadUrl).toContain("https://project.supabase.co/functions/v1/calendar-subscription-feed");
    expect(urls?.downloadUrl).toContain("download=1");
    expect(urls?.subscriptionUrl).toMatch(/^webcal:/);
  });

  it("restringe a assinatura da atlética à modalidade e ao naipe do jogo", () => {
    const option = resolveMatchCalendarSubscriptionOptions(buildMatch())[1]!;
    const urls = resolveCalendarSubscriptionUrls(
      option,
      "https://project.supabase.co",
    );

    expect(option.scope).toBe("TEAM_SPORT_NAIPE");
    expect(urls?.downloadUrl).toContain("scope=TEAM_SPORT_NAIPE");
    expect(urls?.downloadUrl).toContain("team_id=44444444-4444-4444-8444-444444444444");
    expect(urls?.downloadUrl).toContain("sport_id=33333333-3333-4333-8333-333333333333");
    expect(urls?.downloadUrl).toContain("naipe=MASCULINO");
  });

  it("aceita somente horários futuros confirmados", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(canSubscribeToCalendar("2026-09-05T12:01:00.000Z")).toBe(true);
    expect(canSubscribeToCalendar("2026-09-05T11:59:00.000Z")).toBe(false);
    expect(canSubscribeToCalendar(null)).toBe(false);

    vi.useRealTimers();
  });
});
