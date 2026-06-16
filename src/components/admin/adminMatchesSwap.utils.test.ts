import { describe, expect, it } from "vitest";
import { MatchNaipe, MatchStatus, TeamDivision } from "@/lib/enums";
import {
  resolveIsMatchEligibleForQueueSwap,
  resolveMatchQueueSwapConflictMessage,
  resolveMatchOperationalQueueSlot,
  resolveMatchSwapOptionLabel,
} from "@/components/admin/adminMatchesSwap.utils";
import type { Match } from "@/lib/types";

function buildScheduledMatch(overrides: Partial<Match> & Pick<Match, "id">): Match {
  return {
    id: overrides.id,
    championship_id: overrides.championship_id ?? "championship-1",
    season_year: overrides.season_year ?? 2026,
    division: overrides.division === undefined ? TeamDivision.DIVISAO_PRINCIPAL : overrides.division,
    naipe: overrides.naipe ?? MatchNaipe.MASCULINO,
    supports_cards: overrides.supports_cards ?? false,
    result_rule: overrides.result_rule ?? null,
    sport_id: overrides.sport_id ?? "sport-1",
    home_team_id: overrides.home_team_id ?? `${overrides.id}-home`,
    away_team_id: overrides.away_team_id ?? `${overrides.id}-away`,
    location: overrides.location ?? "Quadra Central",
    court_name: overrides.court_name ?? null,
    scheduled_date: overrides.scheduled_date ?? "2026-04-12",
    queue_position: overrides.queue_position === undefined ? 1 : overrides.queue_position,
    scheduled_slot: overrides.scheduled_slot === undefined ? null : overrides.scheduled_slot,
    current_set_home_score: overrides.current_set_home_score ?? 0,
    current_set_away_score: overrides.current_set_away_score ?? 0,
    is_walkover: overrides.is_walkover ?? false,
    walkover_loser_team_id: overrides.walkover_loser_team_id ?? null,
    is_score_sheet_reviewed: overrides.is_score_sheet_reviewed ?? false,
    resolved_tie_breaker_rule: overrides.resolved_tie_breaker_rule ?? null,
    resolved_tie_break_winner_team_id: overrides.resolved_tie_break_winner_team_id ?? null,
    start_time: overrides.start_time ?? null,
    end_time: overrides.end_time ?? null,
    status: overrides.status ?? MatchStatus.SCHEDULED,
    home_score: overrides.home_score ?? 0,
    home_yellow_cards: overrides.home_yellow_cards ?? 0,
    home_red_cards: overrides.home_red_cards ?? 0,
    away_score: overrides.away_score ?? 0,
    away_yellow_cards: overrides.away_yellow_cards ?? 0,
    away_red_cards: overrides.away_red_cards ?? 0,
    created_at: overrides.created_at ?? "2026-04-12T08:00:00.000Z",
    group_number: overrides.group_number ?? null,
    championships: overrides.championships,
    sports: overrides.sports,
    home_team: overrides.home_team ?? { id: "home-team", name: "Atlética Casa", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-04-01T00:00:00.000Z" },
    away_team: overrides.away_team ?? { id: "away-team", name: "Atlética Visitante", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-04-01T00:00:00.000Z" },
    match_sets: overrides.match_sets ?? [],
  };
}

describe("adminMatchesSwap utils", () => {
  it("aceita troca quando os jogos são agendados, do mesmo dia, mesma quadra e sem conflito final", () => {
    const sourceMatch = buildScheduledMatch({
      id: "match-1",
      queue_position: 2,
      sport_id: "sport-beach-soccer",
      naipe: MatchNaipe.FEMININO,
      division: TeamDivision.DIVISAO_ACESSO,
      scheduled_date: "2026-04-12",
      location: "Arena Seven",
      court_name: "Quadra B",
      start_time: "2026-04-12T08:40:00.000Z",
    });
    const candidateMatch = buildScheduledMatch({
      id: "match-2",
      queue_position: 5,
      sport_id: "sport-beach-soccer",
      naipe: MatchNaipe.MASCULINO,
      division: TeamDivision.DIVISAO_PRINCIPAL,
      scheduled_date: "2026-04-12",
      location: "Arena Seven",
      court_name: "Quadra B",
      start_time: "2026-04-12T10:40:00.000Z",
    });

    expect(resolveIsMatchEligibleForQueueSwap(sourceMatch, candidateMatch, [sourceMatch, candidateMatch])).toBe(true);
  });

  it("rejeita troca quando qualquer regra de elegibilidade não é atendida", () => {
    const sourceMatch = buildScheduledMatch({
      id: "match-1",
      queue_position: 3,
      sport_id: "sport-1",
      naipe: MatchNaipe.MASCULINO,
      division: TeamDivision.DIVISAO_PRINCIPAL,
      scheduled_date: "2026-04-12",
    });

    expect(resolveIsMatchEligibleForQueueSwap(sourceMatch, sourceMatch)).toBe(false);
    expect(
      resolveIsMatchEligibleForQueueSwap(
        sourceMatch,
        buildScheduledMatch({ id: "match-2", status: MatchStatus.FINISHED, queue_position: 4 }),
      ),
    ).toBe(false);
    expect(
      resolveIsMatchEligibleForQueueSwap(
        sourceMatch,
        buildScheduledMatch({ id: "match-3", queue_position: 4, scheduled_date: "2026-04-13" }),
      ),
    ).toBe(false);
    expect(
      resolveIsMatchEligibleForQueueSwap(
        sourceMatch,
        buildScheduledMatch({ id: "match-4", queue_position: 4, sport_id: "sport-2" }),
      ),
    ).toBe(false);
    expect(
      resolveIsMatchEligibleForQueueSwap(
        sourceMatch,
        buildScheduledMatch({ id: "match-5", queue_position: 4, location: "Arena Eight" }),
      ),
    ).toBe(false);
    expect(
      resolveIsMatchEligibleForQueueSwap(
        sourceMatch,
        buildScheduledMatch({ id: "match-6", queue_position: 4, court_name: "Quadra B" }),
      ),
    ).toBe(false);
    expect(
      resolveIsMatchEligibleForQueueSwap(
        sourceMatch,
        buildScheduledMatch({ id: "match-7", queue_position: null, scheduled_slot: null }),
      ),
    ).toBe(false);
  });

  it("resolve slot operacional e monta label de opção da troca", () => {
    const candidateMatch = buildScheduledMatch({
      id: "match-2",
      queue_position: 7,
      scheduled_slot: 9,
      home_team: { id: "home-2", name: "Atlética Delta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-04-01T00:00:00.000Z" },
      away_team: { id: "away-2", name: "Atlética Sigma", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-04-01T00:00:00.000Z" },
    });

    expect(resolveMatchOperationalQueueSlot(candidateMatch)).toBe(7);
    expect(resolveMatchSwapOptionLabel(candidateMatch, false)).toBe("Jogo 7 • Atlética Delta x Atlética Sigma");
    expect(resolveMatchSwapOptionLabel(candidateMatch, true)).toBe("Jogo 9 • Atlética Delta x Atlética Sigma");
  });

  it("rejeita troca quando a nova sequência da quadra criaria conflito consecutivo", () => {
    const previousMatch = buildScheduledMatch({
      id: "previous-match",
      queue_position: 1,
      scheduled_slot: 1,
      location: "Arena Seven",
      court_name: "Quadra B",
      start_time: "2026-04-12T08:00:00.000Z",
      home_team_id: "team-1",
      away_team_id: "team-2",
    });
    const sourceMatch = buildScheduledMatch({
      id: "source-match",
      queue_position: 2,
      scheduled_slot: 2,
      location: "Arena Seven",
      court_name: "Quadra B",
      start_time: "2026-04-12T08:40:00.000Z",
      home_team_id: "team-3",
      away_team_id: "team-4",
    });
    const targetMatch = buildScheduledMatch({
      id: "target-match",
      queue_position: 3,
      scheduled_slot: 3,
      location: "Arena Seven",
      court_name: "Quadra B",
      start_time: "2026-04-12T09:20:00.000Z",
      home_team_id: "team-1",
      away_team_id: "team-5",
    });

    expect(
      resolveMatchQueueSwapConflictMessage({
        matches: [previousMatch, sourceMatch, targetMatch],
        sourceMatch,
        targetMatch,
      }),
    ).toBe("A mesma atlética não pode jogar ou representar jogos consecutivos na mesma quadra.");
    expect(resolveIsMatchEligibleForQueueSwap(sourceMatch, targetMatch, [previousMatch, sourceMatch, targetMatch])).toBe(
      false,
    );
  });
});
