-- Garante que a criação definitiva use a mesma programação exibida na
-- prévia exata. A prévia continua executando em rollback e somente guarda
-- assinaturas pequenas no rascunho do frontend.

CREATE OR REPLACE FUNCTION
  public.resolve_championship_bracket_preview_payload_signature(
    _payload JSONB
  )
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT encode(
    extensions.digest(
      convert_to(
        COALESCE(_payload, '{}'::jsonb)::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$function$;


CREATE OR REPLACE FUNCTION
  public.resolve_championship_bracket_programming_signature(
    _bracket_edition_id UUID,
    _operational_preview JSONB
  )
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  programming_manifest JSONB;
BEGIN
  SELECT
    jsonb_build_object(
      'operational_preview',
        COALESCE(_operational_preview, '{}'::jsonb),

      'competitions',
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'sport_id', competitions_table.sport_id,
              'naipe', competitions_table.naipe,
              'division', competitions_table.division,
              'groups_count', competitions_table.groups_count,
              'qualifiers_per_group', competitions_table.qualifiers_per_group,
              'third_place_mode', competitions_table.third_place_mode,
              'best_second',
                competitions_table.should_complete_knockout_with_best_second_placed_teams,
              'pairing_mode', competitions_table.knockout_pairing_mode,

              'groups',
                COALESCE(
                  (
                    SELECT
                      jsonb_agg(
                        jsonb_build_object(
                          'group_number', groups_table.group_number,
                          'teams',
                            COALESCE(
                              (
                                SELECT
                                  jsonb_agg(
                                    jsonb_build_object(
                                      'position', group_teams_table.position,
                                      'team_id', group_teams_table.team_id
                                    )
                                    ORDER BY group_teams_table.position ASC
                                  )
                                FROM public.championship_bracket_group_teams
                                  AS group_teams_table
                                WHERE group_teams_table.group_id = groups_table.id
                              ),
                              '[]'::jsonb
                            )
                        )
                        ORDER BY groups_table.group_number ASC
                      )
                    FROM public.championship_bracket_groups AS groups_table
                    WHERE groups_table.competition_id = competitions_table.id
                  ),
                  '[]'::jsonb
                ),

              'matches',
                COALESCE(
                  (
                    SELECT
                      jsonb_agg(
                        jsonb_build_object(
                          'phase', bracket_matches_table.phase,
                          'round_number', bracket_matches_table.round_number,
                          'slot_number', bracket_matches_table.slot_number,
                          'group_number', groups_table.group_number,
                          'is_bye', bracket_matches_table.is_bye,
                          'is_third_place', bracket_matches_table.is_third_place,
                          'home_team_id', bracket_matches_table.home_team_id,
                          'away_team_id', bracket_matches_table.away_team_id,
                          'source_home',
                            CASE
                              WHEN source_home_table.id IS NULL THEN NULL
                              ELSE jsonb_build_object(
                                'phase', source_home_table.phase,
                                'round_number', source_home_table.round_number,
                                'slot_number', source_home_table.slot_number
                              )
                            END,
                          'source_away',
                            CASE
                              WHEN source_away_table.id IS NULL THEN NULL
                              ELSE jsonb_build_object(
                                'phase', source_away_table.phase,
                                'round_number', source_away_table.round_number,
                                'slot_number', source_away_table.slot_number
                              )
                            END,
                          'next_match',
                            CASE
                              WHEN next_match_table.id IS NULL THEN NULL
                              ELSE jsonb_build_object(
                                'phase', next_match_table.phase,
                                'round_number', next_match_table.round_number,
                                'slot_number', next_match_table.slot_number
                              )
                            END,
                          'scheduled_date', matches_table.scheduled_date,
                          'scheduled_slot', matches_table.scheduled_slot,
                          'queue_position', matches_table.queue_position,
                          'global_queue_order', matches_table.global_queue_order,
                          'start_time', matches_table.start_time,
                          'end_time', matches_table.end_time,
                          'location', matches_table.location,
                          'court_name', matches_table.court_name,
                          'planned_scheduled_date', bracket_matches_table.planned_scheduled_date,
                          'planned_period', bracket_matches_table.planned_period,
                          'planned_scheduled_slot', bracket_matches_table.planned_scheduled_slot,
                          'planned_queue_position', bracket_matches_table.planned_queue_position,
                          'planned_start_time', bracket_matches_table.planned_start_time,
                          'planned_end_time', bracket_matches_table.planned_end_time,
                          'planned_location_name', bracket_matches_table.planned_location_name,
                          'planned_court_name', bracket_matches_table.planned_court_name
                        )
                        ORDER BY
                          bracket_matches_table.phase ASC,
                          bracket_matches_table.round_number ASC,
                          bracket_matches_table.slot_number ASC
                      )
                    FROM public.championship_bracket_matches AS bracket_matches_table
                    LEFT JOIN public.championship_bracket_groups AS groups_table
                      ON groups_table.id = bracket_matches_table.group_id
                    LEFT JOIN public.matches AS matches_table
                      ON matches_table.id = bracket_matches_table.match_id
                    LEFT JOIN public.championship_bracket_matches AS source_home_table
                      ON source_home_table.id = bracket_matches_table.source_home_bracket_match_id
                    LEFT JOIN public.championship_bracket_matches AS source_away_table
                      ON source_away_table.id = bracket_matches_table.source_away_bracket_match_id
                    LEFT JOIN public.championship_bracket_matches AS next_match_table
                      ON next_match_table.id = bracket_matches_table.next_bracket_match_id
                    WHERE bracket_matches_table.competition_id = competitions_table.id
                  ),
                  '[]'::jsonb
                )
            )
            ORDER BY
              competitions_table.sport_id ASC,
              competitions_table.naipe ASC,
              competitions_table.division ASC NULLS FIRST
          ),
          '[]'::jsonb
        )
    )
  INTO programming_manifest
  FROM public.championship_bracket_competitions AS competitions_table
  WHERE competitions_table.bracket_edition_id = _bracket_edition_id;

  RETURN encode(
    extensions.digest(
      convert_to(
        COALESCE(programming_manifest, '{}'::jsonb)::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
END;
$function$;


DO $migration$
DECLARE
  function_definition TEXT;
  previous_function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.preview_championship_bracket_groups(uuid, jsonb)'::regprocedure
  )
  INTO function_definition;

  previous_function_definition := function_definition;
  function_definition := replace(
    function_definition,
    '  knockout_conflict_count INTEGER := 0;',
    '  knockout_conflict_count INTEGER := 0;' || E'\n\n'
      || '  server_payload_signature TEXT;' || E'\n'
      || '  generation_signature TEXT;'
  );

  IF function_definition = previous_function_definition THEN
    RAISE EXCEPTION
      'Não foi possível incluir as assinaturas na prévia exata do chaveamento.';
  END IF;

  previous_function_definition := function_definition;
  function_definition := replace(
    function_definition,
    E'    preview_result :=\n      jsonb_build_object(',
    E'    server_payload_signature :=\n'
      || E'      public.resolve_championship_bracket_preview_payload_signature(\n'
      || E'        COALESCE(_payload, \'{}\'::jsonb)\n'
      || E'      );\n\n'
      || E'    generation_signature :=\n'
      || E'      public.resolve_championship_bracket_programming_signature(\n'
      || E'        generated_edition_id,\n'
      || E'        operational_preview\n'
      || E'      );\n\n'
      || E'    preview_result :=\n      jsonb_build_object('
  );

  IF function_definition = previous_function_definition THEN
    RAISE EXCEPTION
      'Não foi possível calcular as assinaturas na prévia exata do chaveamento.';
  END IF;

  previous_function_definition := function_definition;
  function_definition := replace(
    function_definition,
    E'        \'ok\',\n          true,',
    E'        \'ok\',\n          true,\n\n        \'server_payload_signature\',\n          server_payload_signature,\n\n        \'generation_signature\',\n          generation_signature,'
  );

  IF function_definition = previous_function_definition THEN
    RAISE EXCEPTION
      'Não foi possível retornar as assinaturas na prévia exata do chaveamento.';
  END IF;

  EXECUTE function_definition;
END;
$migration$;


CREATE OR REPLACE FUNCTION
  public.generate_championship_bracket_groups_from_exact_preview(
    _championship_id UUID,
    _payload JSONB,
    _expected_payload_signature TEXT,
    _expected_generation_signature TEXT
  )
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $function$
DECLARE
  actual_payload_signature TEXT;
  actual_generation_signature TEXT;
  generated_edition_id UUID;
  knockout_result JSONB;
  operational_preview JSONB;
  knockout_conflict_count INTEGER := 0;
BEGIN
  IF NULLIF(trim(COALESCE(_expected_payload_signature, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(_expected_generation_signature, '')), '') IS NULL
  THEN
    RAISE EXCEPTION
      'Calcule a programação exata antes de criar o campeonato.';
  END IF;

  actual_payload_signature :=
    public.resolve_championship_bracket_preview_payload_signature(
      COALESCE(_payload, '{}'::jsonb)
    );

  IF actual_payload_signature IS DISTINCT FROM _expected_payload_signature
  THEN
    RAISE EXCEPTION
      'A configuração foi alterada desde a prévia exata. Calcule novamente a programação antes de criar o campeonato.';
  END IF;

  SELECT public.generate_championship_bracket_groups(
    _championship_id,
    COALESCE(_payload, '{}'::jsonb)
  )
  INTO generated_edition_id;

  IF generated_edition_id IS NULL
  THEN
    RAISE EXCEPTION
      'Não foi possível gerar a edição definitiva do chaveamento.';
  END IF;

  knockout_result :=
    public.rebuild_championship_knockout_schedule_reservations(
      generated_edition_id,
      false
    );

  knockout_conflict_count := COALESCE(
    NULLIF(knockout_result ->> 'conflict_count', '')::integer,
    0
  );

  IF knockout_conflict_count > 0
  THEN
    RAISE EXCEPTION
      'A programação definitiva encontrou conflito(s) após a prévia. Calcule novamente antes de criar o campeonato.';
  END IF;

  operational_preview :=
    public.build_championship_bracket_operational_preview(
      generated_edition_id,
      COALESCE(_payload, '{}'::jsonb),
      knockout_result
    );

  actual_generation_signature :=
    public.resolve_championship_bracket_programming_signature(
      generated_edition_id,
      operational_preview
    );

  IF actual_generation_signature IS DISTINCT FROM _expected_generation_signature
  THEN
    RAISE EXCEPTION
      'A programação definitiva divergiu da prévia exata. Nenhum jogo foi criado; calcule novamente a programação.';
  END IF;

  RETURN generated_edition_id;
END;
$function$;


REVOKE ALL ON FUNCTION
  public.resolve_championship_bracket_preview_payload_signature(JSONB)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.resolve_championship_bracket_programming_signature(UUID, JSONB)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.generate_championship_bracket_groups_from_exact_preview(UUID, JSONB, TEXT, TEXT)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.generate_championship_bracket_groups_from_exact_preview(UUID, JSONB, TEXT, TEXT)
TO authenticated;


COMMENT ON FUNCTION
  public.generate_championship_bracket_groups_from_exact_preview(UUID, JSONB, TEXT, TEXT)
IS
  'Gera o chaveamento somente quando a assinatura da programação definitiva coincide com a prévia exata; qualquer divergência faz rollback integral.';

NOTIFY pgrst, 'reload schema';
