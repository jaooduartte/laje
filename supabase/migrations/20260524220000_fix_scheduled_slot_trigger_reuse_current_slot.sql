-- Adiciona scheduled_slot ao output da RPC get_championship_bracket_view.
--
-- O trigger assign_match_queue_position permanece inalterado (MAX+1).
-- O display de "Jogo X" continuará usando queue_position, que já garante:
--   - unicidade dentro de cada naipe+divisão
--   - emparelhamento natural quando os grupos são simétricos (ambos os naipes
--     terminam no mesmo queue_position e o mata-mata de ambos inicia no mesmo número)
--
-- O "Jogo 18-21" observado foi artefato único das migrations retroativas que
-- criaram e deletaram brackets errados consumindo posições 13-17. Com os brackets
-- deletados pelas migrations 20260524200000/210000, as novas geraçõess de KO
-- receberão queue_position correto (ex: Jogo 13, 13 para ambas as semis).

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC com scheduled_slot no output
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_championship_bracket_view(
  _championship_id UUID,
  _season_year INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  response JSONB;
  resolved_season_year INTEGER;
BEGIN
  SELECT COALESCE(
    _season_year,
    championships_table.current_season_year,
    date_part('year', timezone('America/Sao_Paulo', now()))::integer
  )
  INTO resolved_season_year
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id
  LIMIT 1;

  IF resolved_season_year IS NULL THEN
    resolved_season_year := date_part('year', timezone('America/Sao_Paulo', now()))::integer;
  END IF;

  WITH latest_edition AS (
    SELECT editions_table.id
    FROM public.championship_bracket_editions AS editions_table
    WHERE editions_table.championship_id = _championship_id
      AND editions_table.season_year = resolved_season_year
    ORDER BY editions_table.created_at DESC
    LIMIT 1
  ),
  competitions AS (
    SELECT
      competitions_table.id,
      competitions_table.sport_id,
      competitions_table.naipe,
      competitions_table.division,
      competitions_table.groups_count,
      competitions_table.qualifiers_per_group,
      competitions_table.should_complete_knockout_with_best_second_placed_teams,
      competitions_table.third_place_mode,
      sports_table.name AS sport_name
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN latest_edition
      ON latest_edition.id = competitions_table.bracket_edition_id
    JOIN public.sports AS sports_table
      ON sports_table.id = competitions_table.sport_id
  ),
  groups AS (
    SELECT
      groups_table.id,
      groups_table.competition_id,
      groups_table.group_number,
      jsonb_agg(
        jsonb_build_object(
          'team_id', teams_table.id,
          'team_name', teams_table.name,
          'team_city', teams_table.city,
          'position', group_teams_table.position
        )
        ORDER BY group_teams_table.position ASC
      ) AS teams
    FROM public.championship_bracket_groups AS groups_table
    JOIN public.championship_bracket_group_teams AS group_teams_table
      ON group_teams_table.group_id = groups_table.id
    JOIN public.teams AS teams_table
      ON teams_table.id = group_teams_table.team_id
    WHERE groups_table.competition_id IN (SELECT competitions.id FROM competitions)
    GROUP BY groups_table.id, groups_table.competition_id, groups_table.group_number
  ),
  bracket_matches AS (
    SELECT
      bracket_matches_table.id,
      bracket_matches_table.competition_id,
      bracket_matches_table.group_id,
      bracket_matches_table.phase,
      bracket_matches_table.round_number,
      bracket_matches_table.slot_number,
      bracket_matches_table.match_id,
      bracket_matches_table.home_team_id,
      bracket_matches_table.away_team_id,
      bracket_matches_table.winner_team_id,
      bracket_matches_table.is_bye,
      bracket_matches_table.is_third_place,
      matches_table.status,
      matches_table.scheduled_date,
      matches_table.queue_position,
      matches_table.scheduled_slot,
      matches_table.start_time,
      matches_table.end_time,
      matches_table.location,
      matches_table.court_name,
      home_teams_table.name AS home_team_name,
      away_teams_table.name AS away_team_name,
      winner_teams_table.name AS winner_team_name
    FROM public.championship_bracket_matches AS bracket_matches_table
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    LEFT JOIN public.teams AS home_teams_table
      ON home_teams_table.id = bracket_matches_table.home_team_id
    LEFT JOIN public.teams AS away_teams_table
      ON away_teams_table.id = bracket_matches_table.away_team_id
    LEFT JOIN public.teams AS winner_teams_table
      ON winner_teams_table.id = bracket_matches_table.winner_team_id
    WHERE bracket_matches_table.bracket_edition_id IN (SELECT latest_edition.id FROM latest_edition)
  )
  SELECT jsonb_build_object(
    'edition', (
      SELECT to_jsonb(editions_table)
      FROM public.championship_bracket_editions AS editions_table
      WHERE editions_table.id IN (SELECT latest_edition.id FROM latest_edition)
      LIMIT 1
    ),
    'competitions', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', competitions.id,
            'sport_id', competitions.sport_id,
            'sport_name', competitions.sport_name,
            'naipe', competitions.naipe,
            'division', competitions.division,
            'groups_count', competitions.groups_count,
            'qualifiers_per_group', competitions.qualifiers_per_group,
            'should_complete_knockout_with_best_second_placed_teams', competitions.should_complete_knockout_with_best_second_placed_teams,
            'third_place_mode', competitions.third_place_mode,
            'groups', COALESCE(
              (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', groups.id,
                    'group_number', groups.group_number,
                    'teams', groups.teams,
                    'matches', COALESCE(
                      (
                        SELECT jsonb_agg(
                          jsonb_build_object(
                            'id', bracket_matches.id,
                            'match_id', bracket_matches.match_id,
                            'status', bracket_matches.status,
                            'scheduled_date', bracket_matches.scheduled_date,
                            'queue_position', bracket_matches.queue_position,
                            'scheduled_slot', bracket_matches.scheduled_slot,
                            'start_time', bracket_matches.start_time,
                            'end_time', bracket_matches.end_time,
                            'location', bracket_matches.location,
                            'court_name', bracket_matches.court_name,
                            'home_team_id', bracket_matches.home_team_id,
                            'away_team_id', bracket_matches.away_team_id,
                            'home_team_name', bracket_matches.home_team_name,
                            'away_team_name', bracket_matches.away_team_name,
                            'winner_team_id', bracket_matches.winner_team_id,
                            'winner_team_name', bracket_matches.winner_team_name
                          )
                          ORDER BY bracket_matches.round_number ASC, bracket_matches.slot_number ASC
                        )
                        FROM bracket_matches
                        WHERE bracket_matches.group_id = groups.id
                          AND bracket_matches.phase = 'GROUP_STAGE'::public.bracket_phase
                      ),
                      '[]'::jsonb
                    )
                  )
                  ORDER BY groups.group_number ASC
                )
                FROM groups
                WHERE groups.competition_id = competitions.id
              ),
              '[]'::jsonb
            ),
            'knockout_matches', COALESCE(
              (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', bracket_matches.id,
                    'round_number', bracket_matches.round_number,
                    'slot_number', bracket_matches.slot_number,
                    'match_id', bracket_matches.match_id,
                    'status', bracket_matches.status,
                    'scheduled_date', bracket_matches.scheduled_date,
                    'queue_position', bracket_matches.queue_position,
                    'scheduled_slot', bracket_matches.scheduled_slot,
                    'start_time', bracket_matches.start_time,
                    'end_time', bracket_matches.end_time,
                    'location', bracket_matches.location,
                    'court_name', bracket_matches.court_name,
                    'home_team_id', bracket_matches.home_team_id,
                    'away_team_id', bracket_matches.away_team_id,
                    'home_team_name', bracket_matches.home_team_name,
                    'away_team_name', bracket_matches.away_team_name,
                    'winner_team_id', bracket_matches.winner_team_id,
                    'winner_team_name', bracket_matches.winner_team_name,
                    'is_bye', bracket_matches.is_bye,
                    'is_third_place', bracket_matches.is_third_place
                  )
                  ORDER BY bracket_matches.round_number ASC, bracket_matches.slot_number ASC
                )
                FROM bracket_matches
                WHERE bracket_matches.competition_id = competitions.id
                  AND bracket_matches.phase = 'KNOCKOUT'::public.bracket_phase
              ),
              '[]'::jsonb
            )
          )
          ORDER BY competitions.sport_name ASC, competitions.naipe ASC, competitions.division ASC NULLS FIRST
        )
        FROM competitions
      ),
      '[]'::jsonb
    )
  )
  INTO response;

  RETURN COALESCE(
    response,
    jsonb_build_object(
      'edition', NULL,
      'competitions', '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_championship_bracket_view(UUID, INTEGER) TO anon, authenticated;

COMMENT ON FUNCTION public.get_championship_bracket_view(UUID, INTEGER)
IS 'Retorna a visão consolidada do chaveamento com fila diária, horário real e local planejado por temporada. Inclui scheduled_slot em group e knockout matches.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Retroativo: compacta scheduled_slot de KO SCHEDULED para campeonatos ativos
-- ─────────────────────────────────────────────────────────────────────────────
-- Corrige matches criados antes deste fix com slots sequenciais (ex: 13,14,15,16)
-- → compacta para (13,13,14,14) respeitando court_cap.
-- Só age em matches SCHEDULED sem resultado (não toca Copa Laje de Verão ou KO já disputados).

DO $compact_ko_slots$
DECLARE
  v_rec          RECORD;
  v_match        RECORD;
  v_court_cap    INTEGER;
  v_min_slot     INTEGER;
  v_new_slot     INTEGER;
  v_slot_fill    INTEGER;
BEGIN
  FOR v_rec IN
    SELECT DISTINCT
      m.championship_id,
      m.season_year,
      m.scheduled_date,
      m.sport_id
    FROM public.matches AS m
    JOIN public.championship_bracket_matches AS bm ON bm.match_id = m.id
    WHERE bm.phase = 'KNOCKOUT'
      AND m.status = 'SCHEDULED'
      AND m.scheduled_slot IS NOT NULL
  LOOP
    -- Capacidade de quadras
    SELECT COUNT(DISTINCT bc.id)::INTEGER INTO v_court_cap
    FROM public.championship_bracket_editions AS e
    JOIN public.championship_bracket_days AS d ON d.bracket_edition_id = e.id
    JOIN public.championship_bracket_locations AS l ON l.bracket_day_id = d.id
    JOIN public.championship_bracket_courts AS bc ON bc.bracket_location_id = l.id
    JOIN public.championship_bracket_court_sports AS cs ON cs.bracket_court_id = bc.id
    WHERE e.championship_id = v_rec.championship_id
      AND e.season_year     = v_rec.season_year
      AND d.event_date      = v_rec.scheduled_date
      AND cs.sport_id       = v_rec.sport_id;

    IF COALESCE(v_court_cap, 0) = 0 THEN v_court_cap := 1; END IF;

    -- Slot mínimo dos KO matches no dia (não descer abaixo dos slots de grupo)
    SELECT MIN(m2.scheduled_slot) INTO v_min_slot
    FROM public.matches AS m2
    JOIN public.championship_bracket_matches AS bm2 ON bm2.match_id = m2.id
    WHERE m2.championship_id  = v_rec.championship_id
      AND m2.season_year      = v_rec.season_year
      AND m2.scheduled_date   = v_rec.scheduled_date
      AND m2.sport_id         = v_rec.sport_id
      AND bm2.phase           = 'KNOCKOUT'
      AND m2.status           = 'SCHEDULED';

    v_new_slot  := v_min_slot;
    v_slot_fill := 0;

    FOR v_match IN
      SELECT m3.id
      FROM public.matches AS m3
      JOIN public.championship_bracket_matches AS bm3 ON bm3.match_id = m3.id
      WHERE m3.championship_id  = v_rec.championship_id
        AND m3.season_year      = v_rec.season_year
        AND m3.scheduled_date   = v_rec.scheduled_date
        AND m3.sport_id         = v_rec.sport_id
        AND bm3.phase           = 'KNOCKOUT'
        AND m3.status           = 'SCHEDULED'
      ORDER BY m3.scheduled_slot ASC, m3.id ASC
    LOOP
      UPDATE public.matches SET scheduled_slot = v_new_slot WHERE id = v_match.id;
      v_slot_fill := v_slot_fill + 1;
      IF v_slot_fill >= v_court_cap THEN
        v_new_slot  := v_new_slot + 1;
        v_slot_fill := 0;
      END IF;
    END LOOP;
  END LOOP;
END;
$compact_ko_slots$;

NOTIFY pgrst, 'reload schema';
