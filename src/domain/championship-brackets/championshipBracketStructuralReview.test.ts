import { describe, expect, it } from "vitest";
import {
  resolveChampionshipBracketExactPreviewPayloadSignature,
  resolveChampionshipBracketExactPreviewCacheValidity,
  resolveChampionshipBracketReviewConfigurationSummary,
  resolveChampionshipBracketSportMatchTargetRecommendations,
  resolveChampionshipBracketStructuralReview,
} from "@/domain/championship-brackets/championshipBracketStructuralReview";
import type {
  ChampionshipBracketSetupFormValues,
  ChampionshipBracketWizardDraftFormValues,
} from "@/domain/championship-brackets/championshipBracket.types";
import {
  BracketThirdPlaceMode,
  ChampionshipSeasonDivisionFormat,
  ChampionshipSeasonDivisionSettlementMode,
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
  MatchNaipe,
  TeamDivision,
} from "@/lib/enums";
import type { ChampionshipSport, Team } from "@/lib/types";

function buildTeam(id: string, name: string): Team {
  return {
    id,
    name,
    city: "Joinville",
    division: TeamDivision.DIVISAO_PRINCIPAL,
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

function buildChampionshipSport(
  overrides: Partial<ChampionshipSport> = {},
): ChampionshipSport {
  return {
    id: overrides.id ?? "championship-sport-1",
    championship_id: overrides.championship_id ?? "championship-1",
    sport_id: overrides.sport_id ?? "sport-1",
    naipe_mode:
      overrides.naipe_mode ?? ChampionshipSportNaipeMode.MASCULINO_FEMININO,
    result_rule: overrides.result_rule ?? ChampionshipSportResultRule.POINTS,
    supports_cards: overrides.supports_cards ?? false,
    tie_breaker_rule:
      overrides.tie_breaker_rule ??
      ChampionshipSportTieBreakerRule.BEACH_SOCCER,
    default_match_duration_minutes:
      overrides.default_match_duration_minutes ?? 30,
    show_estimated_start_time_on_cards:
      overrides.show_estimated_start_time_on_cards ?? false,
    points_win: overrides.points_win ?? 3,
    points_draw: overrides.points_draw ?? 1,
    points_loss: overrides.points_loss ?? 0,
    created_at: overrides.created_at ?? "2026-08-01T00:00:00.000Z",
    walkover_winner_points: overrides.walkover_winner_points ?? 3,
    awards_include_knockout_phase:
      overrides.awards_include_knockout_phase ?? true,
    supports_individual_awards: overrides.supports_individual_awards ?? true,
    sports: overrides.sports ?? {
      id: overrides.sport_id ?? "sport-1",
      name: "Futsal",
      created_at: "2026-08-01T00:00:00.000Z",
    },
  };
}

function buildPayload(
  overrides: Partial<ChampionshipBracketSetupFormValues> = {},
): ChampionshipBracketSetupFormValues {
  return {
    season_settings: overrides.season_settings ?? {
      division_format: ChampionshipSeasonDivisionFormat.SEPARATED,
      division_settlement_mode:
        ChampionshipSeasonDivisionSettlementMode.PROMOTION_RELEGATION,
      principal_slots_count: null,
      principal_relegation_count: 2,
      access_promotion_count: 2,
    },
    enabled_sport_ids: overrides.enabled_sport_ids ?? ["sport-1", "sport-2"],
    participants: overrides.participants ?? [
      {
        team_id: "team-1",
        modalities: [
          {
            sport_id: "sport-1",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
          },
        ],
      },
      {
        team_id: "team-2",
        modalities: [
          {
            sport_id: "sport-1",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
          },
        ],
      },
    ],
    competitions: overrides.competitions ?? [
      {
        sport_id: "sport-1",
        naipe: MatchNaipe.MASCULINO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
        groups_count: 1,
        qualifiers_per_group: 1,
        should_complete_knockout_with_best_second_placed_teams: false,
        knockout_pairing_mode: "LINEAR",
        third_place_mode: BracketThirdPlaceMode.NONE,
        groups: [
          {
            group_number: 1,
            team_ids: ["team-1", "team-2"],
          },
        ],
      },
    ],
    schedule_days: overrides.schedule_days ?? [
      {
        date: "2026-08-29",
        start_time: "08:00",
        end_time: "18:00",
        break_start_time: "12:00",
        break_end_time: "13:00",
        locations: [
          {
            location_key: "loc-1",
            name: "Ginásio Central",
            position: 1,
            courts: [
              {
                court_key: "court-1",
                name: "Quadra 1",
                position: 1,
                sport_ids: ["sport-1"],
                sport_match_targets: [
                  {
                    sport_id: "sport-1",
                    planned_match_count: 4,
                  },
                ],
                sport_preference: null,
              },
            ],
          },
        ],
      },
    ],
    competition_date_availability:
      overrides.competition_date_availability ?? [
        {
          competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
          date: "2026-08-29",
          mode: "FULL_DAY",
          windows: [],
        },
      ],
    team_competition_date_availability:
      overrides.team_competition_date_availability ?? [
        {
          team_id: "team-1",
          competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
          date: "2026-08-29",
          mode: "FULL_DAY",
          windows: [],
        },
        {
          team_id: "team-2",
          competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
          date: "2026-08-29",
          mode: "FULL_DAY",
          windows: [],
        },
      ],
    individual_event_configs: overrides.individual_event_configs ?? [],
    individual_session_configs: overrides.individual_session_configs ?? [],
    resource_locks: overrides.resource_locks ?? [],
    match_numbering_mode: overrides.match_numbering_mode ?? "COURT",
    knockout_program_blocks: overrides.knockout_program_blocks ?? [],
  };
}

function buildDraftScheduleDaysFromPayload(
  payload: ChampionshipBracketSetupFormValues,
  overrideTargetsByCourtKey: Record<
    string,
    ChampionshipBracketWizardDraftFormValues["schedule_days"][number]["locations"][number]["courts"][number]["sport_match_targets"]
  > = {},
): ChampionshipBracketWizardDraftFormValues["schedule_days"] {
  return payload.schedule_days.map((scheduleDay, scheduleDayIndex) => ({
    id: `day-${scheduleDayIndex + 1}`,
    date: scheduleDay.date,
    start_time: scheduleDay.start_time,
    end_time: scheduleDay.end_time,
    break_start_time: scheduleDay.break_start_time ?? "",
    break_end_time: scheduleDay.break_end_time ?? "",
    locations: scheduleDay.locations.map((location, locationIndex) => ({
      id: location.location_key,
      location_template_id: null,
      name: location.name,
      position: location.position ?? locationIndex + 1,
      courts: location.courts.map((court, courtIndex) => ({
        id: court.court_key,
        name: court.name,
        position: court.position ?? courtIndex + 1,
        sport_ids: [...court.sport_ids],
        sport_preference: court.sport_preference,
        sport_match_targets:
          overrideTargetsByCourtKey[court.court_key] ??
          (court.sport_match_targets ?? []).map((target) => ({
            ...target,
            planning_mode: "MANUAL",
          })),
      })),
    })),
  }));
}

describe("resolveChampionshipBracketStructuralReview", () => {
  const teams = [buildTeam("team-1", "Atlética A"), buildTeam("team-2", "Atlética B")];
  const sports = [
    buildChampionshipSport({
      sport_id: "sport-1",
      sports: {
        id: "sport-1",
        name: "Futsal",
        created_at: "2026-08-01T00:00:00.000Z",
      },
      default_match_duration_minutes: 30,
    }),
    buildChampionshipSport({
      sport_id: "sport-2",
      sports: {
        id: "sport-2",
        name: "Atletismo",
        created_at: "2026-08-01T00:00:00.000Z",
      },
      default_match_duration_minutes: 20,
    }),
  ];

  it("resume jogos coletivos com final e sessões individuais por naipe e divisão", () => {
    const summary = resolveChampionshipBracketReviewConfigurationSummary({
      payload: buildPayload({
        participants: [
          "team-1",
          "team-2",
          "team-3",
          "team-4",
        ].map((team_id) => ({
          team_id,
          modalities: [
            {
              sport_id: "sport-1",
              naipe: MatchNaipe.FEMININO,
              division: TeamDivision.DIVISAO_PRINCIPAL,
            },
            ...(team_id == "team-1" || team_id == "team-2"
              ? [
                  {
                    sport_id: "sport-1",
                    naipe: MatchNaipe.MISTO,
                    division: null,
                  },
                ]
              : []),
          ],
        })),
        competitions: [
          {
            sport_id: "sport-1",
            naipe: MatchNaipe.FEMININO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            groups_count: 2,
            qualifiers_per_group: 1,
            should_complete_knockout_with_best_second_placed_teams: false,
            knockout_pairing_mode: "LINEAR",
            third_place_mode: BracketThirdPlaceMode.MATCH,
            groups: [
              { group_number: 1, team_ids: ["team-1", "team-2"] },
              { group_number: 2, team_ids: ["team-3", "team-4"] },
            ],
          },
          {
            sport_id: "sport-1",
            naipe: MatchNaipe.MISTO,
            division: null,
            groups_count: 1,
            qualifiers_per_group: 2,
            should_complete_knockout_with_best_second_placed_teams: false,
            knockout_pairing_mode: "LINEAR",
            third_place_mode: BracketThirdPlaceMode.NONE,
            groups: [{ group_number: 1, team_ids: ["team-1", "team-2"] }],
          },
        ],
        individual_session_configs: [
          {
            sport_id: "sport-2",
            naipe: MatchNaipe.FEMININO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            scheduled_date: "2026-08-29",
            start_time: "08:00",
            end_time: "09:00",
            location_key: "loc-1",
            court_key: "court-1",
            location_name: "Ginásio Central",
            court_name: "Quadra 1",
            exclusive_lock_enabled: false,
          },
          {
            sport_id: "sport-2",
            naipe: MatchNaipe.FEMININO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            scheduled_date: "2026-08-30",
            start_time: "08:00",
            end_time: "09:00",
            location_key: "loc-1",
            court_key: "court-1",
            location_name: "Ginásio Central",
            court_name: "Quadra 1",
            exclusive_lock_enabled: false,
          },
          {
            sport_id: "sport-2",
            naipe: MatchNaipe.MISTO,
            division: null,
            scheduled_date: "2026-08-31",
            start_time: "08:00",
            end_time: "09:00",
            location_key: "loc-1",
            court_key: "court-1",
            location_name: "Ginásio Central",
            court_name: "Quadra 1",
            exclusive_lock_enabled: false,
          },
        ],
      }),
      championshipSports: sports,
    });

    expect(summary.collective_competitions).toEqual([
      expect.objectContaining({
        sport_id: "sport-1",
        naipe: MatchNaipe.FEMININO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
        expected_match_count: 3,
      }),
      expect.objectContaining({
        sport_id: "sport-1",
        naipe: MatchNaipe.MISTO,
        division: null,
        expected_match_count: 2,
      }),
    ]);
    expect(summary.individual_sessions).toEqual([
      expect.objectContaining({
        naipe: MatchNaipe.FEMININO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
        configured_session_count: 2,
      }),
      expect.objectContaining({
        naipe: MatchNaipe.MISTO,
        division: null,
        configured_session_count: 1,
      }),
    ]);
  });

  it("monta a timeline estrutural com intervalo, reserva, sessão individual, final manual e janela livre", () => {
    const review = resolveChampionshipBracketStructuralReview({
      payload: buildPayload({
        schedule_days: [
          {
            date: "2026-08-29",
            start_time: "08:00",
            end_time: "18:00",
            break_start_time: "12:00",
            break_end_time: "13:00",
            locations: [
              {
                location_key: "loc-1",
                name: "Ginásio Central",
                position: 1,
                courts: [
                  {
                    court_key: "court-1",
                    name: "Quadra 1",
                    position: 1,
                    sport_ids: ["sport-1"],
                    sport_match_targets: [
                      {
                        sport_id: "sport-1",
                        planned_match_count: 4,
                      },
                    ],
                    sport_preference: null,
                  },
                  {
                    court_key: "court-2",
                    name: "Quadra 2",
                    position: 2,
                    sport_ids: ["sport-1"],
                    sport_match_targets: [],
                    sport_preference: null,
                  },
                ],
              },
            ],
          },
        ],
        individual_session_configs: [
          {
            sport_id: "sport-2",
            naipe: MatchNaipe.MISTO,
            division: null,
            scheduled_date: "2026-08-29",
            start_time: "08:00",
            end_time: "10:00",
            location_key: "loc-1",
            court_key: "court-1",
            location_name: "Ginásio Central",
            court_name: "Quadra 1",
            exclusive_lock_enabled: false,
          },
        ],
        resource_locks: [
          {
            date: "2026-08-29",
            start_time: "08:00",
            end_time: "10:00",
            location_key: "loc-1",
            court_key: "court-2",
            location_name: "Ginásio Central",
            court_name: "Quadra 2",
            lock_mode: "HARD",
            competition_key: null,
            sport_id: null,
            naipe: null,
            division: null,
          },
        ],
        knockout_program_blocks: [
          {
            date: "2026-08-29",
            start_time: "13:00",
            end_time: "18:00",
            location_key: "loc-1",
            court_key: "court-2",
            location_name: "Ginásio Central",
            court_name: "Quadra 2",
            sport_id: "sport-1",
            phase: "FINAL",
            division_scope: "ALL",
            naipe_sequence: [MatchNaipe.MASCULINO],
            match_duration_minutes_override: 60,
            display_order: 1,
          },
        ],
      }),
      championshipSports: sports,
      teams,
    });

    const allEntryTypes = review.days
      .flatMap((day) => day.locations)
      .flatMap((location) => location.courts)
      .flatMap((court) => court.timeline_entries.map((entry) => entry.type));

    expect(allEntryTypes).toContain("BREAK");
    expect(allEntryTypes).toContain("RESOURCE_LOCK");
    expect(allEntryTypes).toContain("INDIVIDUAL_SESSION");
    expect(allEntryTypes).toContain("MANUAL_FINAL_BLOCK");
    expect(allEntryTypes).toContain("FREE_WINDOW");
  });

  it("recomenda metas AUTO sem ultrapassar o total automático necessário", () => {
    const payload = buildPayload({
      schedule_days: [
        {
          date: "2026-08-29",
          start_time: "08:00",
          end_time: "18:00",
          break_start_time: "12:00",
          break_end_time: "13:00",
          locations: [
            {
              location_key: "loc-1",
              name: "Ginásio Central",
              position: 1,
              courts: [
                {
                  court_key: "court-1",
                  name: "Quadra 1",
                  position: 1,
                  sport_ids: ["sport-1"],
                  sport_match_targets: [],
                  sport_preference: null,
                },
              ],
            },
          ],
        },
      ],
    });

    const result = resolveChampionshipBracketSportMatchTargetRecommendations({
      scheduleDays: buildDraftScheduleDaysFromPayload(payload, {
        "court-1": [
          {
            sport_id: "sport-1",
            planned_match_count: 0,
            planning_mode: "AUTO",
          },
        ],
      }),
      competitions: payload.competitions,
      participants: payload.participants,
      competitionDateAvailability: payload.competition_date_availability,
      individualSessionConfigs: payload.individual_session_configs,
      resourceLocks: payload.resource_locks,
      knockoutProgramBlocks: payload.knockout_program_blocks,
      championshipSports: sports,
    });

    const recommendationLine = result.line_recommendations[0];
    const sportSummary = result.sport_summaries[0];

    expect(recommendationLine?.planning_mode).toBe("AUTO");
    expect(recommendationLine?.recommended_match_count).toBeGreaterThan(0);
    expect(recommendationLine?.effective_match_count).toBe(
      sportSummary?.required_match_count,
    );
    expect(sportSummary?.resolved_match_count).toBe(
      sportSummary?.required_match_count,
    );
    expect(sportSummary?.excess_match_count).toBe(0);
  });

  it("expõe o saldo por naipe/divisão quando a modalidade fica desequilibrada", () => {
    const payload = buildPayload({
      participants: [
        {
          team_id: "team-1",
          modalities: [
            {
              sport_id: "sport-1",
              naipe: MatchNaipe.FEMININO,
              division: TeamDivision.DIVISAO_PRINCIPAL,
            },
          ],
        },
        {
          team_id: "team-2",
          modalities: [
            {
              sport_id: "sport-1",
              naipe: MatchNaipe.FEMININO,
              division: TeamDivision.DIVISAO_PRINCIPAL,
            },
          ],
        },
        {
          team_id: "team-3",
          modalities: [
            {
              sport_id: "sport-1",
              naipe: MatchNaipe.MASCULINO,
              division: TeamDivision.DIVISAO_PRINCIPAL,
            },
          ],
        },
        {
          team_id: "team-4",
          modalities: [
            {
              sport_id: "sport-1",
              naipe: MatchNaipe.MASCULINO,
              division: TeamDivision.DIVISAO_PRINCIPAL,
            },
          ],
        },
      ],
      competitions: [
        {
          sport_id: "sport-1",
          naipe: MatchNaipe.FEMININO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          groups_count: 1,
          qualifiers_per_group: 1,
          should_complete_knockout_with_best_second_placed_teams: false,
          knockout_pairing_mode: "LINEAR",
          third_place_mode: BracketThirdPlaceMode.NONE,
          groups: [{ group_number: 1, team_ids: ["team-1", "team-2"] }],
        },
        {
          sport_id: "sport-1",
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          groups_count: 1,
          qualifiers_per_group: 1,
          should_complete_knockout_with_best_second_placed_teams: false,
          knockout_pairing_mode: "LINEAR",
          third_place_mode: BracketThirdPlaceMode.NONE,
          groups: [{ group_number: 1, team_ids: ["team-3", "team-4"] }],
        },
      ],
      schedule_days: [
        {
          date: "2026-08-29",
          start_time: "08:00",
          end_time: "18:00",
          break_start_time: "",
          break_end_time: "",
          locations: [
            {
              location_key: "loc-1",
              name: "Ginásio Central",
              position: 1,
              courts: [
                {
                  court_key: "court-1",
                  name: "Quadra 1",
                  position: 1,
                  sport_ids: ["sport-1"],
                  sport_match_targets: [],
                  sport_preference: {
                    preferred_sport_id: "sport-1",
                    preferred_naipe: MatchNaipe.FEMININO,
                    preferred_division: TeamDivision.DIVISAO_PRINCIPAL,
              sequence_mode: "GROUP_NAIPE",
              alternate_naipe_after_exclusive_knockout_phase: false,
                  },
                },
              ],
            },
          ],
        },
      ],
      competition_date_availability: [
        {
          competition_key: "sport-1::FEMININO::DIVISAO_PRINCIPAL",
          date: "2026-08-29",
          mode: "FULL_DAY",
          windows: [],
        },
        {
          competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
          date: "2026-08-29",
          mode: "FULL_DAY",
          windows: [],
        },
      ],
      team_competition_date_availability: [
        {
          team_id: "team-1",
          competition_key: "sport-1::FEMININO::DIVISAO_PRINCIPAL",
          date: "2026-08-29",
          mode: "FULL_DAY",
          windows: [],
        },
        {
          team_id: "team-2",
          competition_key: "sport-1::FEMININO::DIVISAO_PRINCIPAL",
          date: "2026-08-29",
          mode: "FULL_DAY",
          windows: [],
        },
        {
          team_id: "team-3",
          competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
          date: "2026-08-29",
          mode: "FULL_DAY",
          windows: [],
        },
        {
          team_id: "team-4",
          competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
          date: "2026-08-29",
          mode: "FULL_DAY",
          windows: [],
        },
      ],
    });

    const result = resolveChampionshipBracketSportMatchTargetRecommendations({
      scheduleDays: buildDraftScheduleDaysFromPayload(payload, {
        "court-1": [
          {
            sport_id: "sport-1",
            planned_match_count: 1,
            planning_mode: "MANUAL",
          },
        ],
      }),
      competitions: payload.competitions,
      participants: payload.participants,
      competitionDateAvailability: payload.competition_date_availability,
      individualSessionConfigs: payload.individual_session_configs,
      resourceLocks: payload.resource_locks,
      knockoutProgramBlocks: payload.knockout_program_blocks,
      championshipSports: sports,
    });

    const femininoSummary = result.competition_summaries.find(
      (summary) =>
        summary.competition_key ==
        "sport-1::FEMININO::DIVISAO_PRINCIPAL",
    );
    const masculinoSummary = result.competition_summaries.find(
      (summary) =>
        summary.competition_key ==
        "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
    );

    expect(femininoSummary?.resolved_match_count).toBe(1);
    expect(femininoSummary?.shortage_match_count).toBe(0);
    expect(masculinoSummary?.resolved_match_count).toBe(0);
    expect(masculinoSummary?.shortage_match_count).toBe(1);
    expect(result.line_recommendations[0]?.competition_breakdowns).toEqual([
      {
        competition_key: "sport-1::FEMININO::DIVISAO_PRINCIPAL",
        naipe: MatchNaipe.FEMININO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
        planned_match_count: 1,
      },
    ]);
  });

  it("aponta excesso quando a meta manual ultrapassa o necessário", () => {
    const payload = buildPayload({
      schedule_days: [
        {
          date: "2026-08-29",
          start_time: "08:00",
          end_time: "18:00",
          break_start_time: "",
          break_end_time: "",
          locations: [
            {
              location_key: "loc-1",
              name: "Ginásio Central",
              position: 1,
              courts: [
                {
                  court_key: "court-1",
                  name: "Quadra 1",
                  position: 1,
                  sport_ids: ["sport-1"],
                  sport_match_targets: [],
                  sport_preference: null,
                },
              ],
            },
          ],
        },
      ],
    });

    const result = resolveChampionshipBracketSportMatchTargetRecommendations({
      scheduleDays: buildDraftScheduleDaysFromPayload(payload, {
        "court-1": [
          {
            sport_id: "sport-1",
            planned_match_count: 10,
            planning_mode: "MANUAL",
          },
        ],
      }),
      competitions: payload.competitions,
      participants: payload.participants,
      competitionDateAvailability: payload.competition_date_availability,
      individualSessionConfigs: payload.individual_session_configs,
      resourceLocks: payload.resource_locks,
      knockoutProgramBlocks: payload.knockout_program_blocks,
      championshipSports: sports,
    });

    expect(result.line_recommendations[0]?.effective_match_count).toBe(10);
    expect(result.sport_summaries[0]?.resolved_match_count).toBe(1);
    expect(
      result.line_recommendations[0]?.competition_breakdowns.reduce(
        (totalMatchCount, competitionBreakdown) =>
          totalMatchCount + competitionBreakdown.planned_match_count,
        0,
      ),
    ).toBe(1);
  });

  it("não altera a meta automática necessária quando existem finais manuais fixas", () => {
    const basePayload = buildPayload({
      schedule_days: [
        {
          date: "2026-08-29",
          start_time: "08:00",
          end_time: "18:00",
          break_start_time: "",
          break_end_time: "",
          locations: [
            {
              location_key: "loc-1",
              name: "Ginásio Central",
              position: 1,
              courts: [
                {
                  court_key: "court-1",
                  name: "Quadra 1",
                  position: 1,
                  sport_ids: ["sport-1"],
                  sport_match_targets: [],
                  sport_preference: null,
                },
              ],
            },
          ],
        },
      ],
    });

    const scheduleDays = buildDraftScheduleDaysFromPayload(basePayload, {
      "court-1": [
        {
          sport_id: "sport-1",
          planned_match_count: 0,
          planning_mode: "AUTO",
        },
      ],
    });
    const baseResult = resolveChampionshipBracketSportMatchTargetRecommendations(
      {
        scheduleDays,
        competitions: basePayload.competitions,
        participants: basePayload.participants,
        competitionDateAvailability: basePayload.competition_date_availability,
        individualSessionConfigs: basePayload.individual_session_configs,
        resourceLocks: basePayload.resource_locks,
        knockoutProgramBlocks: [],
        championshipSports: sports,
      },
    );
    const resultWithManualFinal = resolveChampionshipBracketSportMatchTargetRecommendations(
      {
        scheduleDays,
        competitions: basePayload.competitions,
        participants: basePayload.participants,
        competitionDateAvailability: basePayload.competition_date_availability,
        individualSessionConfigs: basePayload.individual_session_configs,
        resourceLocks: basePayload.resource_locks,
        knockoutProgramBlocks: [
          {
            date: "2026-08-29",
            start_time: "13:00",
            end_time: "18:00",
            location_key: "loc-1",
            court_key: "court-1",
            location_name: "Ginásio Central",
            court_name: "Quadra 1",
            sport_id: "sport-1",
            phase: "FINAL",
            division_scope: "ALL",
            naipe_sequence: [MatchNaipe.MASCULINO],
            match_duration_minutes_override: 60,
            display_order: 1,
          },
        ],
        championshipSports: sports,
      },
    );

    expect(resultWithManualFinal.sport_summaries[0]?.required_match_count).toBe(
      baseResult.sport_summaries[0]?.required_match_count,
    );
  });

  it("não marca conflito quando dois naipes da mesma modalidade individual compartilham a mesma sessão", () => {
    const review = resolveChampionshipBracketStructuralReview({
      payload: buildPayload({
        participants: [
          {
            team_id: "team-1",
            modalities: [
              {
                sport_id: "sport-2",
                naipe: MatchNaipe.MASCULINO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
              {
                sport_id: "sport-2",
                naipe: MatchNaipe.FEMININO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
            ],
          },
          {
            team_id: "team-2",
            modalities: [
              {
                sport_id: "sport-2",
                naipe: MatchNaipe.MASCULINO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
              {
                sport_id: "sport-2",
                naipe: MatchNaipe.FEMININO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
            ],
          },
        ],
        individual_session_configs: [
          {
            sport_id: "sport-2",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            scheduled_date: "2026-08-29",
            start_time: "08:00",
            end_time: "10:00",
            location_key: "loc-1",
            court_key: "court-1",
            location_name: "Ginásio Central",
            court_name: "Quadra 1",
            exclusive_lock_enabled: true,
          },
          {
            sport_id: "sport-2",
            naipe: MatchNaipe.FEMININO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            scheduled_date: "2026-08-29",
            start_time: "08:00",
            end_time: "10:00",
            location_key: "loc-1",
            court_key: "court-1",
            location_name: "Ginásio Central",
            court_name: "Quadra 1",
            exclusive_lock_enabled: true,
          },
        ],
        resource_locks: [
          {
            date: "2026-08-29",
            start_time: "08:00",
            end_time: "10:00",
            location_key: "loc-1",
            court_key: "court-1",
            location_name: "Ginásio Central",
            court_name: "Quadra 1",
            lock_mode: "HARD",
            competition_key: null,
            sport_id: "sport-2",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
          },
        ],
      }),
      championshipSports: sports,
      teams,
    });

    expect(
      review.diagnostics.some(
        (diagnostic) => diagnostic.code == "STRUCTURAL_FIXED_BLOCK_CONFLICT",
      ),
    ).toBe(false);
  });

  it("mantém uma meta dentro da capacidade livre da quadra", () => {
    const review = resolveChampionshipBracketStructuralReview({
      payload: buildPayload(),
      championshipSports: sports,
      teams,
    });

    expect(review.summary.collective_planned_minutes).toBe(120);
    expect(review.summary.remaining_minutes).toBe(420);
    expect(review.summary.overflow_minutes).toBe(0);
    expect(review.days[0]?.locations[0]?.courts[0]?.planning_items[0]?.status).toBe(
      "WITHIN_CAPACITY",
    );
    expect(
      review.days[0]?.locations[0]?.courts[0]?.planning_items[0]
        ?.remaining_minutes,
    ).toBe(420);
    expect(
      review.days[0]?.locations[0]?.courts[0]?.planning_items[0]
        ?.additional_match_capacity,
    ).toBe(14);
  });

  it("projeta o mata-mata automático nos mini-cards locais sem incluir a final manual", () => {
    const review = resolveChampionshipBracketStructuralReview({
      payload: buildPayload({
        participants: [
          {
            team_id: "team-1",
            modalities: [
              {
                sport_id: "sport-1",
                naipe: MatchNaipe.MASCULINO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
            ],
          },
          {
            team_id: "team-2",
            modalities: [
              {
                sport_id: "sport-1",
                naipe: MatchNaipe.MASCULINO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
            ],
          },
          {
            team_id: "team-3",
            modalities: [
              {
                sport_id: "sport-1",
                naipe: MatchNaipe.MASCULINO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
            ],
          },
          {
            team_id: "team-4",
            modalities: [
              {
                sport_id: "sport-1",
                naipe: MatchNaipe.MASCULINO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
            ],
          },
        ],
        competitions: [
          {
            sport_id: "sport-1",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            groups_count: 2,
            qualifiers_per_group: 2,
            should_complete_knockout_with_best_second_placed_teams: false,
            knockout_pairing_mode: "LINEAR",
            third_place_mode: BracketThirdPlaceMode.NONE,
            groups: [
              {
                group_number: 1,
                team_ids: ["team-1", "team-2"],
              },
              {
                group_number: 2,
                team_ids: ["team-3", "team-4"],
              },
            ],
          },
        ],
        schedule_days: [
          {
            date: "2026-08-29",
            start_time: "08:00",
            end_time: "18:00",
            break_start_time: "12:00",
            break_end_time: "13:00",
            locations: [
              {
                location_key: "loc-1",
                name: "Ginásio Central",
                position: 1,
                courts: [
                  {
                    court_key: "court-1",
                    name: "Quadra 1",
                    position: 1,
                    sport_ids: ["sport-1"],
                    sport_match_targets: [
                      {
                        sport_id: "sport-1",
                        planned_match_count: 2,
                      },
                    ],
                    sport_preference: null,
                  },
                ],
              },
            ],
          },
          {
            date: "2026-08-30",
            start_time: "08:00",
            end_time: "18:00",
            break_start_time: "12:00",
            break_end_time: "13:00",
            locations: [
              {
                location_key: "loc-1",
                name: "Ginásio Central",
                position: 1,
                courts: [
                  {
                    court_key: "court-1",
                    name: "Quadra 1",
                    position: 1,
                    sport_ids: ["sport-1"],
                    sport_match_targets: [
                      {
                        sport_id: "sport-1",
                        planned_match_count: 2,
                      },
                    ],
                    sport_preference: null,
                  },
                ],
              },
            ],
          },
        ],
        competition_date_availability: [
          {
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            date: "2026-08-29",
            mode: "FULL_DAY",
            windows: [],
          },
          {
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            date: "2026-08-30",
            mode: "FULL_DAY",
            windows: [],
          },
        ],
        team_competition_date_availability: [
          {
            team_id: "team-1",
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            date: "2026-08-29",
            mode: "FULL_DAY",
            windows: [],
          },
          {
            team_id: "team-2",
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            date: "2026-08-29",
            mode: "FULL_DAY",
            windows: [],
          },
          {
            team_id: "team-3",
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            date: "2026-08-29",
            mode: "FULL_DAY",
            windows: [],
          },
          {
            team_id: "team-4",
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            date: "2026-08-29",
            mode: "FULL_DAY",
            windows: [],
          },
          {
            team_id: "team-1",
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            date: "2026-08-30",
            mode: "FULL_DAY",
            windows: [],
          },
          {
            team_id: "team-2",
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            date: "2026-08-30",
            mode: "FULL_DAY",
            windows: [],
          },
          {
            team_id: "team-3",
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            date: "2026-08-30",
            mode: "FULL_DAY",
            windows: [],
          },
          {
            team_id: "team-4",
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            date: "2026-08-30",
            mode: "FULL_DAY",
            windows: [],
          },
        ],
        knockout_program_blocks: [
          {
            date: "2026-08-31",
            start_time: "10:00",
            end_time: "11:00",
            location_key: "loc-1",
            court_key: "court-1",
            location_name: "Ginásio Central",
            court_name: "Quadra 1",
            sport_id: "sport-1",
            phase: "FINAL",
            division_scope: "ALL",
            naipe_sequence: [MatchNaipe.MASCULINO],
            match_duration_minutes_override: 60,
            display_order: 1,
          },
        ],
      }),
      championshipSports: sports,
      teams: [
        ...teams,
        buildTeam("team-3", "Atlética C"),
        buildTeam("team-4", "Atlética D"),
      ],
    });

    const firstDayEntries =
      review.days[0]?.locations[0]?.courts[0]?.estimated_match_entries ?? [];
    const secondDayEntries =
      review.days[1]?.locations[0]?.courts[0]?.estimated_match_entries ?? [];

    expect(firstDayEntries.map((entry) => entry.phase)).toEqual([
      "GROUP_STAGE",
      "GROUP_STAGE",
    ]);
    expect(secondDayEntries.map((entry) => entry.phase)).toEqual([
      "SEMIFINAL",
      "SEMIFINAL",
    ]);
    expect(
      review.days
        .flatMap((day) => day.locations)
        .flatMap((location) => location.courts)
        .flatMap((court) => court.estimated_match_entries)
        .some((entry) => entry.phase == "FINAL"),
    ).toBe(false);
  });

  it("respeita a disponibilidade do naipe na data antes de alternar a projeção local", () => {
    const review = resolveChampionshipBracketStructuralReview({
      payload: buildPayload({
        participants: [
          {
            team_id: "team-1",
            modalities: [
              {
                sport_id: "sport-1",
                naipe: MatchNaipe.FEMININO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
            ],
          },
          {
            team_id: "team-2",
            modalities: [
              {
                sport_id: "sport-1",
                naipe: MatchNaipe.FEMININO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
            ],
          },
          {
            team_id: "team-3",
            modalities: [
              {
                sport_id: "sport-1",
                naipe: MatchNaipe.MASCULINO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
            ],
          },
          {
            team_id: "team-4",
            modalities: [
              {
                sport_id: "sport-1",
                naipe: MatchNaipe.MASCULINO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
            ],
          },
        ],
        competitions: [
          {
            sport_id: "sport-1",
            naipe: MatchNaipe.FEMININO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            groups_count: 1,
            qualifiers_per_group: 1,
            should_complete_knockout_with_best_second_placed_teams: false,
            knockout_pairing_mode: "LINEAR",
            third_place_mode: BracketThirdPlaceMode.NONE,
            groups: [
              {
                group_number: 1,
                team_ids: ["team-1", "team-2"],
              },
            ],
          },
          {
            sport_id: "sport-1",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            groups_count: 1,
            qualifiers_per_group: 1,
            should_complete_knockout_with_best_second_placed_teams: false,
            knockout_pairing_mode: "LINEAR",
            third_place_mode: BracketThirdPlaceMode.NONE,
            groups: [
              {
                group_number: 1,
                team_ids: ["team-3", "team-4"],
              },
            ],
          },
        ],
        schedule_days: [
          {
            date: "2026-08-29",
            start_time: "08:00",
            end_time: "18:00",
            break_start_time: "12:00",
            break_end_time: "13:00",
            locations: [
              {
                location_key: "loc-1",
                name: "Ginásio Central",
                position: 1,
                courts: [
                  {
                    court_key: "court-1",
                    name: "Quadra 1",
                    position: 1,
                    sport_ids: ["sport-1"],
                    sport_match_targets: [
                      {
                        sport_id: "sport-1",
                        planned_match_count: 4,
                      },
                    ],
                    sport_preference: {
                      preferred_sport_id: "sport-1",
                      preferred_naipe: MatchNaipe.FEMININO,
                      preferred_division: TeamDivision.DIVISAO_PRINCIPAL,
                sequence_mode: "GROUP_NAIPE",
                alternate_naipe_after_exclusive_knockout_phase: false,
                    },
                  },
                ],
              },
            ],
          },
        ],
        competition_date_availability: [
          {
            competition_key: "sport-1::FEMININO::DIVISAO_PRINCIPAL",
            date: "2026-08-29",
            mode: "FULL_DAY",
            windows: [],
          },
          {
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            date: "2026-08-29",
            mode: "UNAVAILABLE",
            windows: [],
          },
        ],
        team_competition_date_availability: [
          {
            team_id: "team-1",
            competition_key: "sport-1::FEMININO::DIVISAO_PRINCIPAL",
            date: "2026-08-29",
            mode: "FULL_DAY",
            windows: [],
          },
          {
            team_id: "team-2",
            competition_key: "sport-1::FEMININO::DIVISAO_PRINCIPAL",
            date: "2026-08-29",
            mode: "FULL_DAY",
            windows: [],
          },
          {
            team_id: "team-3",
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            date: "2026-08-29",
            mode: "FULL_DAY",
            windows: [],
          },
          {
            team_id: "team-4",
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            date: "2026-08-29",
            mode: "FULL_DAY",
            windows: [],
          },
        ],
      }),
      championshipSports: sports,
      teams: [
        buildTeam("team-1", "Atlética A"),
        buildTeam("team-2", "Atlética B"),
        buildTeam("team-3", "Atlética C"),
        buildTeam("team-4", "Atlética D"),
      ],
    });

    expect(
      review.days[0]?.locations[0]?.courts[0]?.estimated_match_entries.map(
        (entry) => entry.naipe,
      ),
    ).toEqual([MatchNaipe.FEMININO]);
  });

  it("agrupa o naipe prioritário em um bloco inicial antes de usar o fallback", () => {
    const review = resolveChampionshipBracketStructuralReview({
      payload: buildPayload({
        participants: [
          ...Array.from({ length: 4 }, (_, index) => ({
            team_id: `team-f-${index + 1}`,
            modalities: [
              {
                sport_id: "sport-1",
                naipe: MatchNaipe.FEMININO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
            ],
          })),
          ...Array.from({ length: 4 }, (_, index) => ({
            team_id: `team-m-${index + 1}`,
            modalities: [
              {
                sport_id: "sport-1",
                naipe: MatchNaipe.MASCULINO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
            ],
          })),
        ],
        competitions: [
          {
            sport_id: "sport-1",
            naipe: MatchNaipe.FEMININO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            groups_count: 1,
            qualifiers_per_group: 1,
            should_complete_knockout_with_best_second_placed_teams: false,
            knockout_pairing_mode: "LINEAR",
            third_place_mode: BracketThirdPlaceMode.NONE,
            groups: [
              {
                group_number: 1,
                team_ids: ["team-f-1", "team-f-2", "team-f-3", "team-f-4"],
              },
            ],
          },
          {
            sport_id: "sport-1",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            groups_count: 1,
            qualifiers_per_group: 1,
            should_complete_knockout_with_best_second_placed_teams: false,
            knockout_pairing_mode: "LINEAR",
            third_place_mode: BracketThirdPlaceMode.NONE,
            groups: [
              {
                group_number: 1,
                team_ids: ["team-m-1", "team-m-2", "team-m-3", "team-m-4"],
              },
            ],
          },
        ],
        schedule_days: [
          {
            date: "2026-08-29",
            start_time: "08:00",
            end_time: "18:00",
            break_start_time: "",
            break_end_time: "",
            locations: [
              {
                location_key: "loc-1",
                name: "Ginásio Central",
                position: 1,
                courts: [
                  {
                    court_key: "court-1",
                    name: "Quadra 1",
                    position: 1,
                    sport_ids: ["sport-1"],
                    sport_match_targets: [
                      {
                        sport_id: "sport-1",
                        planned_match_count: 8,
                      },
                    ],
                    sport_preference: {
                      preferred_sport_id: "sport-1",
                      preferred_naipe: MatchNaipe.FEMININO,
                      preferred_division: TeamDivision.DIVISAO_PRINCIPAL,
                sequence_mode: "GROUP_NAIPE",
                alternate_naipe_after_exclusive_knockout_phase: false,
                    },
                  },
                ],
              },
            ],
          },
        ],
        competition_date_availability: [
          {
            competition_key: "sport-1::FEMININO::DIVISAO_PRINCIPAL",
            date: "2026-08-29",
            mode: "FULL_DAY",
            windows: [],
          },
          {
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            date: "2026-08-29",
            mode: "FULL_DAY",
            windows: [],
          },
        ],
        team_competition_date_availability: [
          ...Array.from({ length: 4 }, (_, index) => ({
            team_id: `team-f-${index + 1}`,
            competition_key: "sport-1::FEMININO::DIVISAO_PRINCIPAL",
            date: "2026-08-29",
            mode: "FULL_DAY" as const,
            windows: [],
          })),
          ...Array.from({ length: 4 }, (_, index) => ({
            team_id: `team-m-${index + 1}`,
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            date: "2026-08-29",
            mode: "FULL_DAY" as const,
            windows: [],
          })),
        ],
      }),
      championshipSports: sports,
      teams: [
        ...Array.from({ length: 4 }, (_, index) =>
          buildTeam(`team-f-${index + 1}`, `Atlética F ${index + 1}`),
        ),
        ...Array.from({ length: 4 }, (_, index) =>
          buildTeam(`team-m-${index + 1}`, `Atlética M ${index + 1}`),
        ),
      ],
    });

    expect(
      review.days[0]?.locations[0]?.courts[0]?.estimated_match_entries.map(
        (entry) => entry.naipe,
      ),
    ).toEqual([
      MatchNaipe.FEMININO,
      MatchNaipe.FEMININO,
      MatchNaipe.FEMININO,
      MatchNaipe.FEMININO,
      MatchNaipe.MASCULINO,
      MatchNaipe.MASCULINO,
      MatchNaipe.MASCULINO,
      MatchNaipe.MASCULINO,
    ]);
  });

  it("alterna a prioridade do mata-mata depois de uma fase exclusiva", () => {
    const feminineTeamIds = Array.from(
      { length: 4 },
      (_, index) => `team-f-${index + 1}`,
    );
    const masculineTeamIds = Array.from(
      { length: 8 },
      (_, index) => `team-m-${index + 1}`,
    );
    const scheduledDates = ["2026-08-29", "2026-08-30"];
    const competitionDateAvailability = [
      MatchNaipe.FEMININO,
      MatchNaipe.MASCULINO,
    ].flatMap((naipe) =>
      scheduledDates.map((date) => ({
        competition_key: `sport-1::${naipe}::DIVISAO_PRINCIPAL`,
        date,
        mode: "FULL_DAY" as const,
        windows: [],
      })),
    );
    const teamCompetitionDateAvailability = [
      ...feminineTeamIds.flatMap((team_id) =>
        scheduledDates.map((date) => ({
          team_id,
          competition_key: "sport-1::FEMININO::DIVISAO_PRINCIPAL",
          date,
          mode: "FULL_DAY" as const,
          windows: [],
        })),
      ),
      ...masculineTeamIds.flatMap((team_id) =>
        scheduledDates.map((date) => ({
          team_id,
          competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
          date,
          mode: "FULL_DAY" as const,
          windows: [],
        })),
      ),
    ];
    const review = resolveChampionshipBracketStructuralReview({
      payload: buildPayload({
        participants: [
          ...feminineTeamIds.map((team_id) => ({
            team_id,
            modalities: [
              {
                sport_id: "sport-1",
                naipe: MatchNaipe.FEMININO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
            ],
          })),
          ...masculineTeamIds.map((team_id) => ({
            team_id,
            modalities: [
              {
                sport_id: "sport-1",
                naipe: MatchNaipe.MASCULINO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
            ],
          })),
        ],
        competitions: [
          {
            sport_id: "sport-1",
            naipe: MatchNaipe.FEMININO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            groups_count: 2,
            qualifiers_per_group: 2,
            should_complete_knockout_with_best_second_placed_teams: false,
            knockout_pairing_mode: "LINEAR",
            third_place_mode: BracketThirdPlaceMode.NONE,
            groups: [
              { group_number: 1, team_ids: feminineTeamIds.slice(0, 2) },
              { group_number: 2, team_ids: feminineTeamIds.slice(2, 4) },
            ],
          },
          {
            sport_id: "sport-1",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            groups_count: 4,
            qualifiers_per_group: 2,
            should_complete_knockout_with_best_second_placed_teams: false,
            knockout_pairing_mode: "LINEAR",
            third_place_mode: BracketThirdPlaceMode.NONE,
            groups: [
              { group_number: 1, team_ids: masculineTeamIds.slice(0, 2) },
              { group_number: 2, team_ids: masculineTeamIds.slice(2, 4) },
              { group_number: 3, team_ids: masculineTeamIds.slice(4, 6) },
              { group_number: 4, team_ids: masculineTeamIds.slice(6, 8) },
            ],
          },
        ],
        schedule_days: [
          {
            date: "2026-08-29",
            start_time: "08:00",
            end_time: "18:00",
            break_start_time: "",
            break_end_time: "",
            locations: [
              {
                location_key: "loc-1",
                name: "Ginásio Central",
                position: 1,
                courts: [
                  {
                    court_key: "court-1",
                    name: "Quadra 1",
                    position: 1,
                    sport_ids: ["sport-1"],
                    sport_match_targets: [
                      { sport_id: "sport-1", planned_match_count: 10 },
                    ],
                    sport_preference: {
                      preferred_sport_id: "sport-1",
                      preferred_naipe: MatchNaipe.MASCULINO,
                      preferred_division: null,
                      sequence_mode: "GROUP_NAIPE",
                      alternate_naipe_after_exclusive_knockout_phase: true,
                    },
                  },
                ],
              },
            ],
          },
          {
            date: "2026-08-30",
            start_time: "08:00",
            end_time: "18:00",
            break_start_time: "",
            break_end_time: "",
            locations: [
              {
                location_key: "loc-1",
                name: "Ginásio Central",
                position: 1,
                courts: [
                  {
                    court_key: "court-1",
                    name: "Quadra 1",
                    position: 1,
                    sport_ids: ["sport-1"],
                    sport_match_targets: [
                      { sport_id: "sport-1", planned_match_count: 4 },
                    ],
                    sport_preference: {
                      preferred_sport_id: "sport-1",
                      preferred_naipe: MatchNaipe.MASCULINO,
                      preferred_division: null,
                      sequence_mode: "GROUP_NAIPE",
                      alternate_naipe_after_exclusive_knockout_phase: true,
                    },
                  },
                ],
              },
            ],
          },
        ],
        competition_date_availability: competitionDateAvailability,
        team_competition_date_availability: teamCompetitionDateAvailability,
      }),
      championshipSports: sports,
      teams: [
        ...feminineTeamIds.map((teamId) => buildTeam(teamId, teamId)),
        ...masculineTeamIds.map((teamId) => buildTeam(teamId, teamId)),
      ],
    });

    expect(
      review.days[0]?.locations[0]?.courts[0]?.estimated_match_entries.map(
        (entry) => `${entry.phase}:${entry.naipe}`,
      ),
    ).toEqual([
      "GROUP_STAGE:MASCULINO",
      "GROUP_STAGE:MASCULINO",
      "GROUP_STAGE:MASCULINO",
      "GROUP_STAGE:MASCULINO",
      "GROUP_STAGE:FEMININO",
      "GROUP_STAGE:FEMININO",
      "QUARTERFINAL:MASCULINO",
      "QUARTERFINAL:MASCULINO",
      "QUARTERFINAL:MASCULINO",
      "QUARTERFINAL:MASCULINO",
    ]);

    expect(
      review.days[1]?.locations[0]?.courts[0]?.estimated_match_entries.map(
        (entry) => `${entry.phase}:${entry.naipe}`,
      ),
    ).toEqual([
      "SEMIFINAL:FEMININO",
      "SEMIFINAL:FEMININO",
      "SEMIFINAL:MASCULINO",
      "SEMIFINAL:MASCULINO",
    ]);
  });

  it("marca overflow quando múltiplas metas excedem a capacidade livre", () => {
    const review = resolveChampionshipBracketStructuralReview({
      payload: buildPayload({
        schedule_days: [
          {
            date: "2026-08-29",
            start_time: "08:00",
            end_time: "18:00",
            break_start_time: "12:00",
            break_end_time: "13:00",
            locations: [
              {
                location_key: "loc-1",
                name: "Ginásio Central",
                position: 1,
                courts: [
                  {
                    court_key: "court-1",
                    name: "Quadra 1",
                    position: 1,
                    sport_ids: ["sport-1"],
                    sport_match_targets: [
                      {
                        sport_id: "sport-1",
                        planned_match_count: 20,
                      },
                    ],
                    sport_preference: null,
                  },
                ],
              },
            ],
          },
        ],
      }),
      championshipSports: sports,
      teams,
    });

    expect(review.summary.overflow_minutes).toBeGreaterThan(0);
    expect(
      review.diagnostics.some(
        (diagnostic) => diagnostic.code == "STRUCTURAL_COURT_DAY_OVERFLOW",
      ),
    ).toBe(true);
    expect(review.days[0]?.locations[0]?.courts[0]?.planning_items[0]?.status).toBe(
      "OVERFLOW",
    );
  });

  it("identifica quais jogos ficaram pendentes quando a quadra não comporta toda a meta", () => {
    const review = resolveChampionshipBracketStructuralReview({
      payload: buildPayload({
        participants: [
          {
            team_id: "team-1",
            modalities: [
              {
                sport_id: "sport-1",
                naipe: MatchNaipe.MASCULINO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
            ],
          },
          {
            team_id: "team-2",
            modalities: [
              {
                sport_id: "sport-1",
                naipe: MatchNaipe.MASCULINO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
            ],
          },
          {
            team_id: "team-3",
            modalities: [
              {
                sport_id: "sport-1",
                naipe: MatchNaipe.MASCULINO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
            ],
          },
          {
            team_id: "team-4",
            modalities: [
              {
                sport_id: "sport-1",
                naipe: MatchNaipe.MASCULINO,
                division: TeamDivision.DIVISAO_PRINCIPAL,
              },
            ],
          },
        ],
        competitions: [
          {
            sport_id: "sport-1",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            groups_count: 1,
            qualifiers_per_group: 1,
            should_complete_knockout_with_best_second_placed_teams: false,
            knockout_pairing_mode: "LINEAR",
            third_place_mode: BracketThirdPlaceMode.NONE,
            groups: [
              {
                group_number: 1,
                team_ids: ["team-1", "team-2", "team-3", "team-4"],
              },
            ],
          },
        ],
        schedule_days: [
          {
            date: "2026-08-29",
            start_time: "08:00",
            end_time: "09:00",
            break_start_time: "",
            break_end_time: "",
            locations: [
              {
                location_key: "loc-1",
                name: "Ginásio Central",
                position: 1,
                courts: [
                  {
                    court_key: "court-1",
                    name: "Quadra 1",
                    position: 1,
                    sport_ids: ["sport-1"],
                    sport_match_targets: [
                      {
                        sport_id: "sport-1",
                        planned_match_count: 4,
                      },
                    ],
                    sport_preference: null,
                  },
                ],
              },
            ],
          },
        ],
      }),
      championshipSports: sports,
      teams: [
        buildTeam("team-1", "Atlética A"),
        buildTeam("team-2", "Atlética B"),
        buildTeam("team-3", "Atlética C"),
        buildTeam("team-4", "Atlética D"),
      ],
    });

    const reviewCourt = review.days[0]?.locations[0]?.courts[0];

    expect(reviewCourt?.unallocated_match_count).toBeGreaterThan(0);
    expect(reviewCourt?.pending_match_entries.length).toBeGreaterThan(0);
    expect(reviewCourt?.pending_match_entries[0]).toMatchObject({
      sport_id: "sport-1",
      sport_name: "Futsal",
      naipe: MatchNaipe.MASCULINO,
    });
  });

  it("não fabrica jogo pendente quando a meta está acima do necessário, mas a agenda comporta os jogos reais", () => {
    const review = resolveChampionshipBracketStructuralReview({
      payload: buildPayload({
        schedule_days: [
          {
            date: "2026-08-29",
            start_time: "08:00",
            end_time: "18:00",
            break_start_time: "",
            break_end_time: "",
            locations: [
              {
                location_key: "loc-1",
                name: "Ginásio Central",
                position: 1,
                courts: [
                  {
                    court_key: "court-1",
                    name: "Quadra 1",
                    position: 1,
                    sport_ids: ["sport-1"],
                    sport_match_targets: [
                      {
                        sport_id: "sport-1",
                        planned_match_count: 4,
                      },
                    ],
                    sport_preference: null,
                  },
                ],
              },
            ],
          },
        ],
      }),
      championshipSports: sports,
      teams,
    });

    const reviewCourt = review.days[0]?.locations[0]?.courts[0];

    expect(review.summary.planned_match_count).toBe(4);
    expect(review.summary.estimated_match_count).toBe(1);
    expect(review.summary.unallocated_match_count).toBe(0);
    expect(reviewCourt?.pending_match_entries).toEqual([]);
    expect(
      review.diagnostics.some(
        (diagnostic) =>
          diagnostic.code == "STRUCTURAL_TARGET_ABOVE_REQUIRED_MATCH_COUNT",
      ),
    ).toBe(true);
  });

  it("sinaliza meta planejada sem janela jogável da modalidade", () => {
    const review = resolveChampionshipBracketStructuralReview({
      payload: buildPayload({
        competition_date_availability: [
          {
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            date: "2026-08-29",
            mode: "UNAVAILABLE",
            windows: [],
          },
        ],
      }),
      championshipSports: sports,
      teams,
    });

    expect(
      review.diagnostics.some(
        (diagnostic) =>
          diagnostic.code == "STRUCTURAL_TARGET_WITHOUT_PLAYABLE_WINDOW",
      ),
    ).toBe(true);
  });

  it("avisa quando a disponibilidade das atléticas fica restrita na data", () => {
    const review = resolveChampionshipBracketStructuralReview({
      payload: buildPayload({
        team_competition_date_availability: [
          {
            team_id: "team-1",
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            date: "2026-08-29",
            mode: "CUSTOM",
            windows: [
              {
                start_time: "08:00",
                end_time: "08:20",
              },
            ],
          },
          {
            team_id: "team-2",
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            date: "2026-08-29",
            mode: "FULL_DAY",
            windows: [],
          },
        ],
      }),
      championshipSports: sports,
      teams,
    });

    expect(
      review.diagnostics.some(
        (diagnostic) =>
          diagnostic.code == "STRUCTURAL_RESTRICTED_TEAM_AVAILABILITY",
      ),
    ).toBe(true);
  });
});

describe("resolveChampionshipBracketExactPreviewCacheValidity", () => {
  const payloadSignature = "payload-v8";
  const cache = {
    job_id: "job-v8",
    payload_signature: payloadSignature,
    server_payload_signature: "server-v8",
    generation_signature: "generation-v8",
    dependency_signature: "dependency-v8",
    algorithm_version: "async-exact-v8",
    status: "COMPLETED" as const,
    stage: "Concluída",
    current_date: null,
    progress_percentage: 100,
    processed_slots: 1,
    total_slots: 1,
    expires_at: "2099-09-19T00:00:00.000Z",
    is_valid_for_creation: true,
    generated_at: "2026-08-13T00:00:00.000Z",
    result: null,
  };

  it("aceita somente uma prévia estrutural v8 concluída", () => {
    expect(
      resolveChampionshipBracketExactPreviewCacheValidity({
        cache,
        payloadSignature,
      }),
    ).toBe(true);
    expect(
      resolveChampionshipBracketExactPreviewCacheValidity({
        cache: { ...cache, algorithm_version: "async-exact-v7" },
        payloadSignature,
      }),
    ).toBe(false);
  });

  it("rejeita uma prévia v8 expirada mesmo que o servidor a tenha marcado como válida", () => {
    expect(
      resolveChampionshipBracketExactPreviewCacheValidity({
        cache: {
          ...cache,
          expires_at: "2020-09-19T00:00:00.000Z",
          is_valid_for_creation: true,
        },
        payloadSignature,
      }),
    ).toBe(false);
  });
});

describe("resolveChampionshipBracketExactPreviewPayloadSignature", () => {
  it("invalida o cache quando o payload muda", () => {
    const firstSignature = resolveChampionshipBracketExactPreviewPayloadSignature(
      buildPayload(),
    );
    const secondSignature =
      resolveChampionshipBracketExactPreviewPayloadSignature(
        buildPayload({
          schedule_days: [
            {
              date: "2026-08-29",
              start_time: "08:00",
              end_time: "18:00",
              break_start_time: "12:00",
              break_end_time: "13:00",
              locations: [
                {
                  location_key: "loc-1",
                  name: "Ginásio Central",
                  position: 1,
                  courts: [
                    {
                      court_key: "court-1",
                      name: "Quadra 1",
                      position: 1,
                      sport_ids: ["sport-1"],
                      sport_match_targets: [
                        {
                          sport_id: "sport-1",
                          planned_match_count: 6,
                        },
                      ],
                      sport_preference: null,
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );

    expect(firstSignature).not.toBe(secondSignature);
  });
});
