export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_action_logs: {
        Row: {
          action_type: Database["public"]["Enums"]["admin_action_type"]
          actor_email: string | null
          actor_name: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          actor_user_id: string | null
          created_at: string
          description: string | null
          id: string
          metadata: Json
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          resource_table: string
        }
        Insert: {
          action_type: Database["public"]["Enums"]["admin_action_type"]
          actor_email?: string | null
          actor_name?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          actor_user_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          resource_table: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["admin_action_type"]
          actor_email?: string | null
          actor_name?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          actor_user_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          resource_table?: string
        }
        Relationships: []
      }
      admin_profile_permissions: {
        Row: {
          access_level: Database["public"]["Enums"]["admin_panel_permission_level"]
          admin_tab: Database["public"]["Enums"]["admin_panel_tab"]
          created_at: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["admin_panel_permission_level"]
          admin_tab: Database["public"]["Enums"]["admin_panel_tab"]
          created_at?: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["admin_panel_permission_level"]
          admin_tab?: Database["public"]["Enums"]["admin_panel_tab"]
          created_at?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_profile_permissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_profiles: {
        Row: {
          created_at: string
          id: string
          is_system: boolean
          name: string
          system_role: Database["public"]["Enums"]["app_role"] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          system_role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          system_role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string
        }
        Relationships: []
      }
      admin_user_profiles: {
        Row: {
          created_at: string
          login_identifier: string
          name: string
          password_status: Database["public"]["Enums"]["admin_user_password_status"]
          profile_id: string
          theme_mode_preference: Database["public"]["Enums"]["theme_mode_preference"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          login_identifier: string
          name: string
          password_status?: Database["public"]["Enums"]["admin_user_password_status"]
          profile_id: string
          theme_mode_preference?: Database["public"]["Enums"]["theme_mode_preference"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          login_identifier?: string
          name?: string
          password_status?: Database["public"]["Enums"]["admin_user_password_status"]
          profile_id?: string
          theme_mode_preference?: Database["public"]["Enums"]["theme_mode_preference"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_user_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_award_draw_results: {
        Row: {
          award_type: Database["public"]["Enums"]["championship_award_type"]
          championship_id: string
          created_at: string
          division: Database["public"]["Enums"]["team_division"] | null
          id: string
          naipe: Database["public"]["Enums"]["match_naipe"]
          season_year: number
          sport_id: string
          tied_player_ids_signature: string
          updated_at: string
          winner_player_id: string | null
          winner_team_id: string | null
        }
        Insert: {
          award_type: Database["public"]["Enums"]["championship_award_type"]
          championship_id: string
          created_at?: string
          division?: Database["public"]["Enums"]["team_division"] | null
          id?: string
          naipe: Database["public"]["Enums"]["match_naipe"]
          season_year: number
          sport_id: string
          tied_player_ids_signature: string
          updated_at?: string
          winner_player_id?: string | null
          winner_team_id?: string | null
        }
        Update: {
          award_type?: Database["public"]["Enums"]["championship_award_type"]
          championship_id?: string
          created_at?: string
          division?: Database["public"]["Enums"]["team_division"] | null
          id?: string
          naipe?: Database["public"]["Enums"]["match_naipe"]
          season_year?: number
          sport_id?: string
          tied_player_ids_signature?: string
          updated_at?: string
          winner_player_id?: string | null
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "championship_award_draw_results_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_award_draw_results_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_award_draw_results_winner_player_id_fkey"
            columns: ["winner_player_id"]
            isOneToOne: false
            referencedRelation: "championship_award_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_award_draw_results_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_award_players: {
        Row: {
          championship_id: string
          created_at: string
          division: Database["public"]["Enums"]["team_division"] | null
          id: string
          naipe: Database["public"]["Enums"]["match_naipe"]
          name: string
          normalized_name: string
          season_year: number
          sport_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          championship_id: string
          created_at?: string
          division?: Database["public"]["Enums"]["team_division"] | null
          id?: string
          naipe: Database["public"]["Enums"]["match_naipe"]
          name: string
          normalized_name: string
          season_year: number
          sport_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          championship_id?: string
          created_at?: string
          division?: Database["public"]["Enums"]["team_division"] | null
          id?: string
          naipe?: Database["public"]["Enums"]["match_naipe"]
          name?: string
          normalized_name?: string
          season_year?: number
          sport_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_award_players_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_award_players_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_award_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_bracket_competitions: {
        Row: {
          bracket_edition_id: string
          created_at: string
          division: Database["public"]["Enums"]["team_division"] | null
          groups_count: number
          id: string
          knockout_pairing_mode: string
          naipe: Database["public"]["Enums"]["match_naipe"]
          qualifiers_per_group: number
          should_complete_knockout_with_best_second_placed_teams: boolean
          sport_id: string
          third_place_mode: Database["public"]["Enums"]["bracket_third_place_mode"]
        }
        Insert: {
          bracket_edition_id: string
          created_at?: string
          division?: Database["public"]["Enums"]["team_division"] | null
          groups_count: number
          id?: string
          knockout_pairing_mode?: string
          naipe: Database["public"]["Enums"]["match_naipe"]
          qualifiers_per_group: number
          should_complete_knockout_with_best_second_placed_teams?: boolean
          sport_id: string
          third_place_mode?: Database["public"]["Enums"]["bracket_third_place_mode"]
        }
        Update: {
          bracket_edition_id?: string
          created_at?: string
          division?: Database["public"]["Enums"]["team_division"] | null
          groups_count?: number
          id?: string
          knockout_pairing_mode?: string
          naipe?: Database["public"]["Enums"]["match_naipe"]
          qualifiers_per_group?: number
          should_complete_knockout_with_best_second_placed_teams?: boolean
          sport_id?: string
          third_place_mode?: Database["public"]["Enums"]["bracket_third_place_mode"]
        }
        Relationships: [
          {
            foreignKeyName: "championship_bracket_competitions_bracket_edition_id_fkey"
            columns: ["bracket_edition_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_competitions_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_bracket_court_sports: {
        Row: {
          alternate_naipe_after_exclusive_knockout_phase: boolean
          bracket_court_id: string
          created_at: string
          id: string
          preferred_division:
            | Database["public"]["Enums"]["team_division"]
            | null
          preferred_naipe: Database["public"]["Enums"]["match_naipe"] | null
          sequence_mode: Database["public"]["Enums"]["bracket_court_sequence_mode"]
          sport_id: string
        }
        Insert: {
          alternate_naipe_after_exclusive_knockout_phase?: boolean
          bracket_court_id: string
          created_at?: string
          id?: string
          preferred_division?:
            | Database["public"]["Enums"]["team_division"]
            | null
          preferred_naipe?: Database["public"]["Enums"]["match_naipe"] | null
          sequence_mode?: Database["public"]["Enums"]["bracket_court_sequence_mode"]
          sport_id: string
        }
        Update: {
          alternate_naipe_after_exclusive_knockout_phase?: boolean
          bracket_court_id?: string
          created_at?: string
          id?: string
          preferred_division?:
            | Database["public"]["Enums"]["team_division"]
            | null
          preferred_naipe?: Database["public"]["Enums"]["match_naipe"] | null
          sequence_mode?: Database["public"]["Enums"]["bracket_court_sequence_mode"]
          sport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_bracket_court_sports_bracket_court_id_fkey"
            columns: ["bracket_court_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_court_sports_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_bracket_courts: {
        Row: {
          bracket_location_id: string
          court_group_id: string
          created_at: string
          id: string
          name: string
          position: number
          preferred_sport_id: string | null
        }
        Insert: {
          bracket_location_id: string
          court_group_id: string
          created_at?: string
          id?: string
          name: string
          position?: number
          preferred_sport_id?: string | null
        }
        Update: {
          bracket_location_id?: string
          court_group_id?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          preferred_sport_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "championship_bracket_courts_bracket_location_id_fkey"
            columns: ["bracket_location_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_courts_preferred_sport_id_fkey"
            columns: ["preferred_sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_bracket_day_breaks: {
        Row: {
          bracket_court_id: string | null
          bracket_day_id: string
          break_end_time: string
          break_start_time: string
          created_at: string
          id: string
          position: number
          scope_type: Database["public"]["Enums"]["bracket_day_break_scope_type"]
        }
        Insert: {
          bracket_court_id?: string | null
          bracket_day_id: string
          break_end_time: string
          break_start_time: string
          created_at?: string
          id?: string
          position?: number
          scope_type?: Database["public"]["Enums"]["bracket_day_break_scope_type"]
        }
        Update: {
          bracket_court_id?: string | null
          bracket_day_id?: string
          break_end_time?: string
          break_start_time?: string
          created_at?: string
          id?: string
          position?: number
          scope_type?: Database["public"]["Enums"]["bracket_day_break_scope_type"]
        }
        Relationships: [
          {
            foreignKeyName: "championship_bracket_day_breaks_bracket_court_id_fkey"
            columns: ["bracket_court_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_day_breaks_bracket_day_id_fkey"
            columns: ["bracket_day_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_days"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_bracket_days: {
        Row: {
          bracket_edition_id: string
          break_end_time: string | null
          break_start_time: string | null
          created_at: string
          end_time: string
          event_date: string
          id: string
          start_time: string
        }
        Insert: {
          bracket_edition_id: string
          break_end_time?: string | null
          break_start_time?: string | null
          created_at?: string
          end_time: string
          event_date: string
          id?: string
          start_time: string
        }
        Update: {
          bracket_edition_id?: string
          break_end_time?: string | null
          break_start_time?: string | null
          created_at?: string
          end_time?: string
          event_date?: string
          id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_bracket_days_bracket_edition_id_fkey"
            columns: ["bracket_edition_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_editions"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_bracket_editions: {
        Row: {
          championship_id: string
          created_at: string
          created_by: string | null
          id: string
          payload_snapshot: Json
          season_year: number
          status: Database["public"]["Enums"]["bracket_edition_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          championship_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          payload_snapshot?: Json
          season_year?: number
          status?: Database["public"]["Enums"]["bracket_edition_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          championship_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          payload_snapshot?: Json
          season_year?: number
          status?: Database["public"]["Enums"]["bracket_edition_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "championship_bracket_editions_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_bracket_group_teams: {
        Row: {
          created_at: string
          group_id: string
          id: string
          position: number
          team_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          position: number
          team_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          position?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_bracket_group_teams_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_group_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_bracket_groups: {
        Row: {
          competition_id: string
          created_at: string
          group_number: number
          id: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          group_number: number
          id?: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          group_number?: number
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_bracket_groups_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_bracket_knockout_court_priorities: {
        Row: {
          bracket_edition_id: string
          court_group_id: string
          created_at: string
          division_scope: Database["public"]["Enums"]["bracket_knockout_division_scope"]
          id: string
          location_group_id: string
          phase: Database["public"]["Enums"]["bracket_knockout_priority_phase"]
          sport_id: string
          updated_at: string
        }
        Insert: {
          bracket_edition_id: string
          court_group_id: string
          created_at?: string
          division_scope?: Database["public"]["Enums"]["bracket_knockout_division_scope"]
          id?: string
          location_group_id: string
          phase: Database["public"]["Enums"]["bracket_knockout_priority_phase"]
          sport_id: string
          updated_at?: string
        }
        Update: {
          bracket_edition_id?: string
          court_group_id?: string
          created_at?: string
          division_scope?: Database["public"]["Enums"]["bracket_knockout_division_scope"]
          id?: string
          location_group_id?: string
          phase?: Database["public"]["Enums"]["bracket_knockout_priority_phase"]
          sport_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_bracket_knockout_court_pri_bracket_edition_id_fkey"
            columns: ["bracket_edition_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_knockout_court_priorities_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_bracket_location_sport_priorities: {
        Row: {
          bracket_edition_id: string
          created_at: string
          id: string
          location_group_id: string
          priority_mode: Database["public"]["Enums"]["bracket_court_priority_mode"]
          sport_id: string
          updated_at: string
        }
        Insert: {
          bracket_edition_id: string
          created_at?: string
          id?: string
          location_group_id: string
          priority_mode?: Database["public"]["Enums"]["bracket_court_priority_mode"]
          sport_id: string
          updated_at?: string
        }
        Update: {
          bracket_edition_id?: string
          created_at?: string
          id?: string
          location_group_id?: string
          priority_mode?: Database["public"]["Enums"]["bracket_court_priority_mode"]
          sport_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_bracket_location_sport_pri_bracket_edition_id_fkey"
            columns: ["bracket_edition_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_location_sport_priorities_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_bracket_location_template_court_sports: {
        Row: {
          created_at: string
          id: string
          location_template_court_id: string
          sport_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_template_court_id: string
          sport_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_template_court_id?: string
          sport_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_bracket_location_t_location_template_court_id_fkey"
            columns: ["location_template_court_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_location_template_courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_location_template_court_spor_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_bracket_location_template_courts: {
        Row: {
          created_at: string
          id: string
          location_template_id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_template_id: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_template_id?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_bracket_location_templat_location_template_id_fkey"
            columns: ["location_template_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_location_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_bracket_location_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          normalized_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          normalized_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          normalized_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      championship_bracket_locations: {
        Row: {
          bracket_day_id: string
          created_at: string
          id: string
          location_group_id: string
          name: string
          position: number
        }
        Insert: {
          bracket_day_id: string
          created_at?: string
          id?: string
          location_group_id: string
          name: string
          position?: number
        }
        Update: {
          bracket_day_id?: string
          created_at?: string
          id?: string
          location_group_id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "championship_bracket_locations_bracket_day_id_fkey"
            columns: ["bracket_day_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_days"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_bracket_matches: {
        Row: {
          away_team_id: string | null
          bracket_edition_id: string
          competition_id: string
          created_at: string
          group_id: string | null
          home_team_id: string | null
          id: string
          is_bye: boolean
          is_third_place: boolean
          match_id: string | null
          next_bracket_match_id: string | null
          phase: Database["public"]["Enums"]["bracket_phase"]
          planned_court_group_id: string | null
          planned_court_name: string | null
          planned_end_time: string | null
          planned_location_group_id: string | null
          planned_location_name: string | null
          planned_period:
            | Database["public"]["Enums"]["championship_schedule_period"]
            | null
          planned_queue_position: number | null
          planned_scheduled_date: string | null
          planned_scheduled_slot: number | null
          planned_start_time: string | null
          round_number: number
          slot_number: number
          source_away_bracket_match_id: string | null
          source_home_bracket_match_id: string | null
          winner_team_id: string | null
        }
        Insert: {
          away_team_id?: string | null
          bracket_edition_id: string
          competition_id: string
          created_at?: string
          group_id?: string | null
          home_team_id?: string | null
          id?: string
          is_bye?: boolean
          is_third_place?: boolean
          match_id?: string | null
          next_bracket_match_id?: string | null
          phase: Database["public"]["Enums"]["bracket_phase"]
          planned_court_group_id?: string | null
          planned_court_name?: string | null
          planned_end_time?: string | null
          planned_location_group_id?: string | null
          planned_location_name?: string | null
          planned_period?:
            | Database["public"]["Enums"]["championship_schedule_period"]
            | null
          planned_queue_position?: number | null
          planned_scheduled_date?: string | null
          planned_scheduled_slot?: number | null
          planned_start_time?: string | null
          round_number?: number
          slot_number?: number
          source_away_bracket_match_id?: string | null
          source_home_bracket_match_id?: string | null
          winner_team_id?: string | null
        }
        Update: {
          away_team_id?: string | null
          bracket_edition_id?: string
          competition_id?: string
          created_at?: string
          group_id?: string | null
          home_team_id?: string | null
          id?: string
          is_bye?: boolean
          is_third_place?: boolean
          match_id?: string | null
          next_bracket_match_id?: string | null
          phase?: Database["public"]["Enums"]["bracket_phase"]
          planned_court_group_id?: string | null
          planned_court_name?: string | null
          planned_end_time?: string | null
          planned_location_group_id?: string | null
          planned_location_name?: string | null
          planned_period?:
            | Database["public"]["Enums"]["championship_schedule_period"]
            | null
          planned_queue_position?: number | null
          planned_scheduled_date?: string | null
          planned_scheduled_slot?: number | null
          planned_start_time?: string | null
          round_number?: number
          slot_number?: number
          source_away_bracket_match_id?: string | null
          source_home_bracket_match_id?: string | null
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "championship_bracket_matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_matches_bracket_edition_id_fkey"
            columns: ["bracket_edition_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_matches_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_matches_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_matches_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_matches_next_bracket_match_id_fkey"
            columns: ["next_bracket_match_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_matches_source_away_bracket_match_id_fkey"
            columns: ["source_away_bracket_match_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_matches_source_home_bracket_match_id_fkey"
            columns: ["source_home_bracket_match_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_bracket_team_modalities: {
        Row: {
          bracket_edition_id: string
          created_at: string
          division: Database["public"]["Enums"]["team_division"] | null
          id: string
          naipe: Database["public"]["Enums"]["match_naipe"]
          sport_id: string
          team_id: string
        }
        Insert: {
          bracket_edition_id: string
          created_at?: string
          division?: Database["public"]["Enums"]["team_division"] | null
          id?: string
          naipe: Database["public"]["Enums"]["match_naipe"]
          sport_id: string
          team_id: string
        }
        Update: {
          bracket_edition_id?: string
          created_at?: string
          division?: Database["public"]["Enums"]["team_division"] | null
          id?: string
          naipe?: Database["public"]["Enums"]["match_naipe"]
          sport_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_bracket_team_modalities_bracket_edition_id_fkey"
            columns: ["bracket_edition_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_team_modalities_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_team_modalities_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_bracket_team_registrations: {
        Row: {
          bracket_edition_id: string
          created_at: string
          id: string
          team_id: string
        }
        Insert: {
          bracket_edition_id: string
          created_at?: string
          id?: string
          team_id: string
        }
        Update: {
          bracket_edition_id?: string
          created_at?: string
          id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_bracket_team_registrations_bracket_edition_id_fkey"
            columns: ["bracket_edition_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_team_registrations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_bracket_tie_break_resolution_teams: {
        Row: {
          created_at: string
          draw_order: number
          id: string
          resolution_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          draw_order: number
          id?: string
          resolution_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          draw_order?: number
          id?: string
          resolution_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_bracket_tie_break_resolution_te_resolution_id_fkey"
            columns: ["resolution_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_tie_break_resolutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_tie_break_resolution_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_bracket_tie_break_resolutions: {
        Row: {
          bracket_edition_id: string
          competition_id: string
          context_key: string
          context_type: Database["public"]["Enums"]["championship_bracket_tie_break_context_type"]
          created_at: string
          created_by: string | null
          group_id: string | null
          id: string
          qualification_rank: number | null
          tied_team_signature: string
          updated_at: string
        }
        Insert: {
          bracket_edition_id: string
          competition_id: string
          context_key: string
          context_type: Database["public"]["Enums"]["championship_bracket_tie_break_context_type"]
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          qualification_rank?: number | null
          tied_team_signature: string
          updated_at?: string
        }
        Update: {
          bracket_edition_id?: string
          competition_id?: string
          context_key?: string
          context_type?: Database["public"]["Enums"]["championship_bracket_tie_break_context_type"]
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          qualification_rank?: number | null
          tied_team_signature?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_bracket_tie_break_resoluti_bracket_edition_id_fkey"
            columns: ["bracket_edition_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_tie_break_resolutions_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_bracket_tie_break_resolutions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "championship_bracket_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_competition_team_disqualifications: {
        Row: {
          championship_id: string
          created_at: string
          created_by: string | null
          division: Database["public"]["Enums"]["team_division"] | null
          id: string
          naipe: Database["public"]["Enums"]["match_naipe"]
          season_year: number
          sport_id: string
          team_id: string
        }
        Insert: {
          championship_id: string
          created_at?: string
          created_by?: string | null
          division?: Database["public"]["Enums"]["team_division"] | null
          id?: string
          naipe: Database["public"]["Enums"]["match_naipe"]
          season_year: number
          sport_id: string
          team_id: string
        }
        Update: {
          championship_id?: string
          created_at?: string
          created_by?: string | null
          division?: Database["public"]["Enums"]["team_division"] | null
          id?: string
          naipe?: Database["public"]["Enums"]["match_naipe"]
          season_year?: number
          sport_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_competition_team_disqualifica_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_competition_team_disqualifications_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_competition_team_disqualifications_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_individual_event_entries: {
        Row: {
          athlete_id: string | null
          athlete_name: string | null
          created_at: string
          entry_type: Database["public"]["Enums"]["championship_individual_event_kind"]
          event_id: string
          final_position: number | null
          id: string
          points_awarded: number
          status: Database["public"]["Enums"]["championship_individual_entry_status"]
          team_id: string
          updated_at: string
        }
        Insert: {
          athlete_id?: string | null
          athlete_name?: string | null
          created_at?: string
          entry_type: Database["public"]["Enums"]["championship_individual_event_kind"]
          event_id: string
          final_position?: number | null
          id?: string
          points_awarded?: number
          status?: Database["public"]["Enums"]["championship_individual_entry_status"]
          team_id: string
          updated_at?: string
        }
        Update: {
          athlete_id?: string | null
          athlete_name?: string | null
          created_at?: string
          entry_type?: Database["public"]["Enums"]["championship_individual_event_kind"]
          event_id?: string
          final_position?: number | null
          id?: string
          points_awarded?: number
          status?: Database["public"]["Enums"]["championship_individual_entry_status"]
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_individual_event_entries_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "championship_award_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_individual_event_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "championship_individual_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_individual_event_entries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_individual_event_entry_members: {
        Row: {
          athlete_id: string | null
          athlete_name: string
          created_at: string
          entry_id: string
          id: string
          is_starter: boolean
          position: number
        }
        Insert: {
          athlete_id?: string | null
          athlete_name: string
          created_at?: string
          entry_id: string
          id?: string
          is_starter?: boolean
          position?: number
        }
        Update: {
          athlete_id?: string | null
          athlete_name?: string
          created_at?: string
          entry_id?: string
          id?: string
          is_starter?: boolean
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "championship_individual_event_entry_members_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "championship_award_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_individual_event_entry_members_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "championship_individual_event_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_individual_events: {
        Row: {
          championship_id: string
          created_at: string
          display_order: number
          division: Database["public"]["Enums"]["team_division"] | null
          event_code: string
          id: string
          kind: Database["public"]["Enums"]["championship_individual_event_kind"]
          location: string | null
          naipe: Database["public"]["Enums"]["match_naipe"]
          name: string
          period:
            | Database["public"]["Enums"]["championship_schedule_period"]
            | null
          relay_multiplier: number
          scheduled_date: string | null
          season_year: number
          session_id: string | null
          sport_id: string
          status: Database["public"]["Enums"]["championship_individual_event_status"]
          updated_at: string
        }
        Insert: {
          championship_id: string
          created_at?: string
          display_order?: number
          division?: Database["public"]["Enums"]["team_division"] | null
          event_code: string
          id?: string
          kind: Database["public"]["Enums"]["championship_individual_event_kind"]
          location?: string | null
          naipe: Database["public"]["Enums"]["match_naipe"]
          name: string
          period?:
            | Database["public"]["Enums"]["championship_schedule_period"]
            | null
          relay_multiplier?: number
          scheduled_date?: string | null
          season_year: number
          session_id?: string | null
          sport_id: string
          status?: Database["public"]["Enums"]["championship_individual_event_status"]
          updated_at?: string
        }
        Update: {
          championship_id?: string
          created_at?: string
          display_order?: number
          division?: Database["public"]["Enums"]["team_division"] | null
          event_code?: string
          id?: string
          kind?: Database["public"]["Enums"]["championship_individual_event_kind"]
          location?: string | null
          naipe?: Database["public"]["Enums"]["match_naipe"]
          name?: string
          period?:
            | Database["public"]["Enums"]["championship_schedule_period"]
            | null
          relay_multiplier?: number
          scheduled_date?: string | null
          season_year?: number
          session_id?: string | null
          sport_id?: string
          status?: Database["public"]["Enums"]["championship_individual_event_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_individual_events_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_individual_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "championship_individual_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_individual_events_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_individual_sessions: {
        Row: {
          championship_id: string
          court_key: string | null
          court_name: string | null
          created_at: string
          division: Database["public"]["Enums"]["team_division"] | null
          exclusive_lock_enabled: boolean
          id: string
          location_key: string | null
          location_name: string | null
          naipe: Database["public"]["Enums"]["match_naipe"]
          period:
            | Database["public"]["Enums"]["championship_schedule_period"]
            | null
          scheduled_date: string | null
          season_year: number
          sport_id: string
          status: Database["public"]["Enums"]["championship_individual_session_status"]
          updated_at: string
        }
        Insert: {
          championship_id: string
          court_key?: string | null
          court_name?: string | null
          created_at?: string
          division?: Database["public"]["Enums"]["team_division"] | null
          exclusive_lock_enabled?: boolean
          id?: string
          location_key?: string | null
          location_name?: string | null
          naipe: Database["public"]["Enums"]["match_naipe"]
          period?:
            | Database["public"]["Enums"]["championship_schedule_period"]
            | null
          scheduled_date?: string | null
          season_year: number
          sport_id: string
          status?: Database["public"]["Enums"]["championship_individual_session_status"]
          updated_at?: string
        }
        Update: {
          championship_id?: string
          court_key?: string | null
          court_name?: string | null
          created_at?: string
          division?: Database["public"]["Enums"]["team_division"] | null
          exclusive_lock_enabled?: boolean
          id?: string
          location_key?: string | null
          location_name?: string | null
          naipe?: Database["public"]["Enums"]["match_naipe"]
          period?:
            | Database["public"]["Enums"]["championship_schedule_period"]
            | null
          scheduled_date?: string | null
          season_year?: number
          sport_id?: string
          status?: Database["public"]["Enums"]["championship_individual_session_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_individual_sessions_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_individual_sessions_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_individual_team_standings: {
        Row: {
          championship_id: string
          created_at: string
          division: Database["public"]["Enums"]["team_division"] | null
          eighteenth_places: number
          eighth_places: number
          eleventh_places: number
          fifteenth_places: number
          fifth_places: number
          first_places: number
          fourteenth_places: number
          fourth_places: number
          id: string
          naipe: Database["public"]["Enums"]["match_naipe"]
          nineteenth_places: number
          ninth_places: number
          relay_points_total: number
          scored_events_count: number
          season_year: number
          second_places: number
          seventeenth_places: number
          seventh_places: number
          sixteenth_places: number
          sixth_places: number
          sport_id: string
          team_id: string
          tenth_places: number
          third_places: number
          thirteenth_places: number
          total_points: number
          twelfth_places: number
          twentieth_places: number
          updated_at: string
        }
        Insert: {
          championship_id: string
          created_at?: string
          division?: Database["public"]["Enums"]["team_division"] | null
          eighteenth_places?: number
          eighth_places?: number
          eleventh_places?: number
          fifteenth_places?: number
          fifth_places?: number
          first_places?: number
          fourteenth_places?: number
          fourth_places?: number
          id?: string
          naipe: Database["public"]["Enums"]["match_naipe"]
          nineteenth_places?: number
          ninth_places?: number
          relay_points_total?: number
          scored_events_count?: number
          season_year: number
          second_places?: number
          seventeenth_places?: number
          seventh_places?: number
          sixteenth_places?: number
          sixth_places?: number
          sport_id: string
          team_id: string
          tenth_places?: number
          third_places?: number
          thirteenth_places?: number
          total_points?: number
          twelfth_places?: number
          twentieth_places?: number
          updated_at?: string
        }
        Update: {
          championship_id?: string
          created_at?: string
          division?: Database["public"]["Enums"]["team_division"] | null
          eighteenth_places?: number
          eighth_places?: number
          eleventh_places?: number
          fifteenth_places?: number
          fifth_places?: number
          first_places?: number
          fourteenth_places?: number
          fourth_places?: number
          id?: string
          naipe?: Database["public"]["Enums"]["match_naipe"]
          nineteenth_places?: number
          ninth_places?: number
          relay_points_total?: number
          scored_events_count?: number
          season_year?: number
          second_places?: number
          seventeenth_places?: number
          seventh_places?: number
          sixteenth_places?: number
          sixth_places?: number
          sport_id?: string
          team_id?: string
          tenth_places?: number
          third_places?: number
          thirteenth_places?: number
          total_points?: number
          twelfth_places?: number
          twentieth_places?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_individual_team_standings_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_individual_team_standings_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_individual_team_standings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_season_division_movements: {
        Row: {
          championship_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          next_division: Database["public"]["Enums"]["team_division"] | null
          previous_division: Database["public"]["Enums"]["team_division"] | null
          ranking_position: number
          rule_code: string
          season_year: number
          source_division: Database["public"]["Enums"]["team_division"] | null
          team_id: string
          updated_at: string
        }
        Insert: {
          championship_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          next_division?: Database["public"]["Enums"]["team_division"] | null
          previous_division?:
            | Database["public"]["Enums"]["team_division"]
            | null
          ranking_position: number
          rule_code: string
          season_year: number
          source_division?: Database["public"]["Enums"]["team_division"] | null
          team_id: string
          updated_at?: string
        }
        Update: {
          championship_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          next_division?: Database["public"]["Enums"]["team_division"] | null
          previous_division?:
            | Database["public"]["Enums"]["team_division"]
            | null
          ranking_position?: number
          rule_code?: string
          season_year?: number
          source_division?: Database["public"]["Enums"]["team_division"] | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_season_division_movements_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_season_division_movements_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_season_settings: {
        Row: {
          access_promotion_count: number | null
          championship_id: string
          created_at: string
          division_format: Database["public"]["Enums"]["championship_season_division_format"]
          division_settlement_mode: Database["public"]["Enums"]["championship_season_division_settlement_mode"]
          id: string
          principal_relegation_count: number | null
          principal_slots_count: number | null
          season_year: number
          updated_at: string
        }
        Insert: {
          access_promotion_count?: number | null
          championship_id: string
          created_at?: string
          division_format?: Database["public"]["Enums"]["championship_season_division_format"]
          division_settlement_mode?: Database["public"]["Enums"]["championship_season_division_settlement_mode"]
          id?: string
          principal_relegation_count?: number | null
          principal_slots_count?: number | null
          season_year: number
          updated_at?: string
        }
        Update: {
          access_promotion_count?: number | null
          championship_id?: string
          created_at?: string
          division_format?: Database["public"]["Enums"]["championship_season_division_format"]
          division_settlement_mode?: Database["public"]["Enums"]["championship_season_division_settlement_mode"]
          id?: string
          principal_relegation_count?: number | null
          principal_slots_count?: number | null
          season_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_season_settings_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_sports: {
        Row: {
          awards_include_knockout_phase: boolean
          championship_id: string
          created_at: string
          default_match_duration_minutes: number
          id: string
          naipe_mode: Database["public"]["Enums"]["championship_sport_naipe_mode"]
          points_draw: number
          points_loss: number
          points_win: number
          result_rule: Database["public"]["Enums"]["championship_sport_result_rule"]
          show_estimated_start_time_on_cards: boolean
          sport_id: string
          supports_cards: boolean
          supports_individual_awards: boolean
          tie_breaker_rule: Database["public"]["Enums"]["championship_sport_tie_breaker_rule"]
          walkover_winner_points: number | null
          walkover_winner_set_count: number
        }
        Insert: {
          awards_include_knockout_phase?: boolean
          championship_id: string
          created_at?: string
          default_match_duration_minutes: number
          id?: string
          naipe_mode?: Database["public"]["Enums"]["championship_sport_naipe_mode"]
          points_draw?: number
          points_loss?: number
          points_win?: number
          result_rule?: Database["public"]["Enums"]["championship_sport_result_rule"]
          show_estimated_start_time_on_cards?: boolean
          sport_id: string
          supports_cards?: boolean
          supports_individual_awards?: boolean
          tie_breaker_rule?: Database["public"]["Enums"]["championship_sport_tie_breaker_rule"]
          walkover_winner_points?: number | null
          walkover_winner_set_count?: number
        }
        Update: {
          awards_include_knockout_phase?: boolean
          championship_id?: string
          created_at?: string
          default_match_duration_minutes?: number
          id?: string
          naipe_mode?: Database["public"]["Enums"]["championship_sport_naipe_mode"]
          points_draw?: number
          points_loss?: number
          points_win?: number
          result_rule?: Database["public"]["Enums"]["championship_sport_result_rule"]
          show_estimated_start_time_on_cards?: boolean
          sport_id?: string
          supports_cards?: boolean
          supports_individual_awards?: boolean
          tie_breaker_rule?: Database["public"]["Enums"]["championship_sport_tie_breaker_rule"]
          walkover_winner_points?: number | null
          walkover_winner_set_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "championship_sports_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_sports_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      championships: {
        Row: {
          code: Database["public"]["Enums"]["championship_code"]
          created_at: string
          current_season_year: number
          default_location: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["championship_status"]
          uses_divisions: boolean
        }
        Insert: {
          code: Database["public"]["Enums"]["championship_code"]
          created_at?: string
          current_season_year?: number
          default_location?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["championship_status"]
          uses_divisions?: boolean
        }
        Update: {
          code?: Database["public"]["Enums"]["championship_code"]
          created_at?: string
          current_season_year?: number
          default_location?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["championship_status"]
          uses_divisions?: boolean
        }
        Relationships: []
      }
      league_calendar_holidays: {
        Row: {
          created_at: string
          day_kind: Database["public"]["Enums"]["league_calendar_holiday_day_kind"]
          holiday_date: string
          id: string
          name: string
          scope: Database["public"]["Enums"]["league_calendar_holiday_scope"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_kind: Database["public"]["Enums"]["league_calendar_holiday_day_kind"]
          holiday_date: string
          id?: string
          name: string
          scope: Database["public"]["Enums"]["league_calendar_holiday_scope"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_kind?: Database["public"]["Enums"]["league_calendar_holiday_day_kind"]
          holiday_date?: string
          id?: string
          name?: string
          scope?: Database["public"]["Enums"]["league_calendar_holiday_scope"]
          updated_at?: string
        }
        Relationships: []
      }
      league_event_organizer_teams: {
        Row: {
          created_at: string
          event_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_event_organizer_teams_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "league_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_event_organizer_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      league_event_reservation_requests: {
        Row: {
          approved_league_event_id: string | null
          created_at: string
          event_date: string
          event_name: string
          event_type: Database["public"]["Enums"]["league_event_type"]
          id: string
          requester_email: string
          requester_name: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["league_event_reservation_request_status"]
          team_id: string
          updated_at: string
        }
        Insert: {
          approved_league_event_id?: string | null
          created_at?: string
          event_date: string
          event_name: string
          event_type: Database["public"]["Enums"]["league_event_type"]
          id?: string
          requester_email: string
          requester_name: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["league_event_reservation_request_status"]
          team_id: string
          updated_at?: string
        }
        Update: {
          approved_league_event_id?: string | null
          created_at?: string
          event_date?: string
          event_name?: string
          event_type?: Database["public"]["Enums"]["league_event_type"]
          id?: string
          requester_email?: string
          requester_name?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["league_event_reservation_request_status"]
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_event_reservation_requests_approved_league_event_id_fkey"
            columns: ["approved_league_event_id"]
            isOneToOne: false
            referencedRelation: "league_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_event_reservation_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      league_events: {
        Row: {
          created_at: string
          event_date: string
          event_type: Database["public"]["Enums"]["league_event_type"]
          id: string
          name: string
          organizer_team_id: string | null
          organizer_type: Database["public"]["Enums"]["league_event_organizer_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_date: string
          event_type: Database["public"]["Enums"]["league_event_type"]
          id?: string
          name: string
          organizer_team_id?: string | null
          organizer_type: Database["public"]["Enums"]["league_event_organizer_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_date?: string
          event_type?: Database["public"]["Enums"]["league_event_type"]
          id?: string
          name?: string
          organizer_team_id?: string | null
          organizer_type?: Database["public"]["Enums"]["league_event_organizer_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_events_organizer_team_id_fkey"
            columns: ["organizer_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      match_award_goal_scorers: {
        Row: {
          created_at: string
          goal_order: number
          id: string
          match_id: string
          player_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          goal_order: number
          id?: string
          match_id: string
          player_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          goal_order?: number
          id?: string
          match_id?: string
          player_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_award_goal_scorers_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_award_goal_scorers_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "championship_award_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_award_goal_scorers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      match_sets: {
        Row: {
          away_points: number
          created_at: string
          home_points: number
          id: string
          match_id: string
          set_number: number
          updated_at: string
        }
        Insert: {
          away_points?: number
          created_at?: string
          home_points?: number
          id?: string
          match_id: string
          set_number: number
          updated_at?: string
        }
        Update: {
          away_points?: number
          created_at?: string
          home_points?: number
          id?: string
          match_id?: string
          set_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_sets_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_blue_cards: number
          away_penalty_score: number | null
          away_red_cards: number
          away_score: number
          away_team_id: string
          away_two_minute_penalties: number
          away_yellow_cards: number
          championship_id: string
          court_name: string | null
          created_at: string
          current_set_away_score: number | null
          current_set_home_score: number | null
          disqualification_id: string | null
          division: Database["public"]["Enums"]["team_division"] | null
          end_time: string | null
          global_queue_order: number | null
          home_blue_cards: number
          home_penalty_score: number | null
          home_red_cards: number
          home_score: number
          home_team_id: string
          home_two_minute_penalties: number
          home_yellow_cards: number
          id: string
          is_double_walkover: boolean
          is_manual_schedule_override: boolean
          is_pending_manual_relocation: boolean
          is_score_sheet_reviewed: boolean
          is_walkover: boolean
          location: string | null
          manual_representation_mode: string
          manual_schedule_override_notes: string | null
          manual_schedule_override_reason: string | null
          pending_manual_relocation_at: string | null
          pending_manual_relocation_created_by: string | null
          pending_manual_relocation_notes: string | null
          pending_manual_relocation_previous_label: string | null
          pending_manual_relocation_previous_schedule: Json | null
          pending_manual_relocation_reason: string | null
          naipe: Database["public"]["Enums"]["match_naipe"]
          queue_position: number | null
          resolved_tie_break_winner_team_id: string | null
          resolved_tie_breaker_rule:
            | Database["public"]["Enums"]["championship_sport_tie_breaker_rule"]
            | null
          scheduled_date: string | null
          scheduled_slot: number | null
          season_year: number
          sport_id: string
          start_time: string | null
          status: Database["public"]["Enums"]["match_status"]
          supports_cards: boolean
          walkover_loser_team_id: string | null
        }
        Insert: {
          away_blue_cards?: number
          away_penalty_score?: number | null
          away_red_cards?: number
          away_score?: number
          away_team_id: string
          away_two_minute_penalties?: number
          away_yellow_cards?: number
          championship_id: string
          court_name?: string | null
          created_at?: string
          current_set_away_score?: number | null
          current_set_home_score?: number | null
          disqualification_id?: string | null
          division?: Database["public"]["Enums"]["team_division"] | null
          end_time?: string | null
          global_queue_order?: number | null
          home_blue_cards?: number
          home_penalty_score?: number | null
          home_red_cards?: number
          home_score?: number
          home_team_id: string
          home_two_minute_penalties?: number
          home_yellow_cards?: number
          id?: string
          is_double_walkover?: boolean
          is_manual_schedule_override?: boolean
          is_pending_manual_relocation?: boolean
          is_score_sheet_reviewed?: boolean
          is_walkover?: boolean
          location?: string | null
          manual_representation_mode?: string
          manual_schedule_override_notes?: string | null
          manual_schedule_override_reason?: string | null
          pending_manual_relocation_at?: string | null
          pending_manual_relocation_created_by?: string | null
          pending_manual_relocation_notes?: string | null
          pending_manual_relocation_previous_label?: string | null
          pending_manual_relocation_previous_schedule?: Json | null
          pending_manual_relocation_reason?: string | null
          naipe?: Database["public"]["Enums"]["match_naipe"]
          queue_position?: number | null
          resolved_tie_break_winner_team_id?: string | null
          resolved_tie_breaker_rule?:
            | Database["public"]["Enums"]["championship_sport_tie_breaker_rule"]
            | null
          scheduled_date?: string | null
          scheduled_slot?: number | null
          season_year?: number
          sport_id: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          supports_cards?: boolean
          walkover_loser_team_id?: string | null
        }
        Update: {
          away_blue_cards?: number
          away_penalty_score?: number | null
          away_red_cards?: number
          away_score?: number
          away_team_id?: string
          away_two_minute_penalties?: number
          away_yellow_cards?: number
          championship_id?: string
          court_name?: string | null
          created_at?: string
          current_set_away_score?: number | null
          current_set_home_score?: number | null
          disqualification_id?: string | null
          division?: Database["public"]["Enums"]["team_division"] | null
          end_time?: string | null
          global_queue_order?: number | null
          home_blue_cards?: number
          home_penalty_score?: number | null
          home_red_cards?: number
          home_score?: number
          home_team_id?: string
          home_two_minute_penalties?: number
          home_yellow_cards?: number
          id?: string
          is_double_walkover?: boolean
          is_manual_schedule_override?: boolean
          is_pending_manual_relocation?: boolean
          is_score_sheet_reviewed?: boolean
          is_walkover?: boolean
          location?: string | null
          manual_representation_mode?: string
          manual_schedule_override_notes?: string | null
          manual_schedule_override_reason?: string | null
          pending_manual_relocation_at?: string | null
          pending_manual_relocation_created_by?: string | null
          pending_manual_relocation_notes?: string | null
          pending_manual_relocation_previous_label?: string | null
          pending_manual_relocation_previous_schedule?: Json | null
          pending_manual_relocation_reason?: string | null
          naipe?: Database["public"]["Enums"]["match_naipe"]
          queue_position?: number | null
          resolved_tie_break_winner_team_id?: string | null
          resolved_tie_breaker_rule?:
            | Database["public"]["Enums"]["championship_sport_tie_breaker_rule"]
            | null
          scheduled_date?: string | null
          scheduled_slot?: number | null
          season_year?: number
          sport_id?: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          supports_cards?: boolean
          walkover_loser_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_disqualification_id_fkey"
            columns: ["disqualification_id"]
            isOneToOne: false
            referencedRelation: "championship_competition_team_disqualifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_resolved_tie_break_winner_team_id_fkey"
            columns: ["resolved_tie_break_winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_walkover_loser_team_id_fkey"
            columns: ["walkover_loser_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      public_link_item_filters: {
        Row: {
          championship_id: string
          created_at: string
          id: string
          public_link_item_id: string
          season_year: number
        }
        Insert: {
          championship_id: string
          created_at?: string
          id?: string
          public_link_item_id: string
          season_year: number
        }
        Update: {
          championship_id?: string
          created_at?: string
          id?: string
          public_link_item_id?: string
          season_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "public_link_item_filters_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_link_item_filters_public_link_item_id_fkey"
            columns: ["public_link_item_id"]
            isOneToOne: false
            referencedRelation: "public_link_items"
            referencedColumns: ["id"]
          },
        ]
      }
      public_link_items: {
        Row: {
          created_at: string
          display_name: string
          filter_mode: Database["public"]["Enums"]["public_link_filter_mode"]
          id: string
          is_active: boolean
          section_id: string
          sort_order: number
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          display_name: string
          filter_mode?: Database["public"]["Enums"]["public_link_filter_mode"]
          id?: string
          is_active?: boolean
          section_id: string
          sort_order?: number
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          display_name?: string
          filter_mode?: Database["public"]["Enums"]["public_link_filter_mode"]
          id?: string
          is_active?: boolean
          section_id?: string
          sort_order?: number
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_link_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "public_link_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      public_link_sections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      public_page_access_settings: {
        Row: {
          announcement_message: string | null
          blocked_message: string | null
          created_at: string
          id: number
          is_championships_page_blocked: boolean
          is_league_calendar_page_blocked: boolean
          is_links_page_blocked: boolean
          is_live_page_blocked: boolean
          is_public_access_blocked: boolean
          is_schedule_page_blocked: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          announcement_message?: string | null
          blocked_message?: string | null
          created_at?: string
          id?: number
          is_championships_page_blocked?: boolean
          is_league_calendar_page_blocked?: boolean
          is_links_page_blocked?: boolean
          is_live_page_blocked?: boolean
          is_public_access_blocked?: boolean
          is_schedule_page_blocked?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          announcement_message?: string | null
          blocked_message?: string | null
          created_at?: string
          id?: number
          is_championships_page_blocked?: boolean
          is_league_calendar_page_blocked?: boolean
          is_links_page_blocked?: boolean
          is_live_page_blocked?: boolean
          is_public_access_blocked?: boolean
          is_schedule_page_blocked?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sports: {
        Row: {
          code: string | null
          created_at: string
          default_match_duration_minutes: number
          id: string
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          default_match_duration_minutes: number
          id?: string
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string
          default_match_duration_minutes?: number
          id?: string
          name?: string
        }
        Relationships: []
      }
      standings: {
        Row: {
          blue_cards: number
          championship_id: string
          division: Database["public"]["Enums"]["team_division"] | null
          draws: number
          goal_diff: number
          goals_against: number
          goals_for: number
          id: string
          losses: number
          naipe: Database["public"]["Enums"]["match_naipe"]
          played: number
          points: number
          red_cards: number
          season_year: number
          sport_id: string
          team_id: string
          two_minute_penalties: number
          updated_at: string
          wins: number
          yellow_cards: number
        }
        Insert: {
          blue_cards?: number
          championship_id: string
          division?: Database["public"]["Enums"]["team_division"] | null
          draws?: number
          goal_diff?: number
          goals_against?: number
          goals_for?: number
          id?: string
          losses?: number
          naipe?: Database["public"]["Enums"]["match_naipe"]
          played?: number
          points?: number
          red_cards?: number
          season_year?: number
          sport_id: string
          team_id: string
          two_minute_penalties?: number
          updated_at?: string
          wins?: number
          yellow_cards?: number
        }
        Update: {
          blue_cards?: number
          championship_id?: string
          division?: Database["public"]["Enums"]["team_division"] | null
          draws?: number
          goal_diff?: number
          goals_against?: number
          goals_for?: number
          id?: string
          losses?: number
          naipe?: Database["public"]["Enums"]["match_naipe"]
          played?: number
          points?: number
          red_cards?: number
          season_year?: number
          sport_id?: string
          team_id?: string
          two_minute_penalties?: number
          updated_at?: string
          wins?: number
          yellow_cards?: number
        }
        Relationships: [
          {
            foreignKeyName: "standings_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          city: string
          created_at: string
          division: Database["public"]["Enums"]["team_division"] | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          city?: string
          created_at?: string
          division?: Database["public"]["Enums"]["team_division"] | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          city?: string
          created_at?: string
          division?: Database["public"]["Enums"]["team_division"] | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_users: {
        Args: { _target_user_ids: string[] }
        Returns: number
      }
      admin_reset_users_password_setup: {
        Args: { _target_user_ids: string[] }
        Returns: number
      }
      admin_set_user_access: {
        Args: {
          _profile_id?: string
          _role?: Database["public"]["Enums"]["app_role"]
          _target_user_id: string
        }
        Returns: undefined
      }
      admin_update_current_user_theme_mode_preference: {
        Args: { _theme_mode_preference: string }
        Returns: undefined
      }
      admin_update_user_login_identifier: {
        Args: { _login_identifier: string; _target_user_id: string }
        Returns: undefined
      }
      admin_update_user_name: {
        Args: { _name: string; _target_user_id: string }
        Returns: undefined
      }
      admin_update_user_password: {
        Args: { _new_password: string; _target_user_id: string }
        Returns: undefined
      }
      advance_championship_season: {
        Args: { _championship_id: string }
        Returns: Json
      }
      apply_society_2026_official_schedule: {
        Args: { _bracket_edition_id: string }
        Returns: undefined
      }
      apply_championship_bracket_reconfiguration: {
        Args: {
          _action: string
          _bracket_edition_id: string
          _expected_revision: number
          _payload: Json
        }
        Returns: undefined
      }
      apply_manual_match_relocation: {
        Args: {
          _bracket_edition_id: string
          _expected_revision: number
          _payload: Json
        }
        Returns: undefined
      }
      apply_manual_match_relocation_slot: {
        Args: {
          _bracket_edition_id: string
          _expected_revision: number
          _payload: Json
        }
        Returns: undefined
      }
      hold_matches_for_manual_relocation: {
        Args: { _bracket_edition_id: string; _payload: Json }
        Returns: undefined
      }
      assign_championship_knockout_match_planned_schedule: {
        Args: { _bracket_match_id: string; _championship_id: string }
        Returns: undefined
      }
      assign_queue_positions_for_bracket: {
        Args: {
          _bracket_edition_id: string
          _championship_id: string
          _season_year: number
        }
        Returns: undefined
      }
      build_championship_bracket_tie_break_context_key: {
        Args: {
          _competition_id: string
          _context_type: Database["public"]["Enums"]["championship_bracket_tie_break_context_type"]
          _group_id?: string
          _qualification_rank?: number
          _tied_team_signature?: string
        }
        Returns: string
      }
      cancel_championship_bracket_preview_job: {
        Args: { _job_id: string }
        Returns: Json
      }
      create_championship_bracket_from_preview_job: {
        Args: { _championship_id: string; _job_id: string; _payload: Json }
        Returns: string
      }
      preview_championship_bracket_reconfiguration: {
        Args: { _action: string; _bracket_edition_id: string; _payload: Json }
        Returns: Json
      }
      preview_manual_match_relocation: {
        Args: { _bracket_edition_id: string; _payload: Json }
        Returns: Json
      }
      preview_manual_match_relocation_slot: {
        Args: { _bracket_edition_id: string; _payload: Json }
        Returns: Json
      }
      can_access_admin_panel: { Args: never; Returns: boolean }
      coerce_division_for_index: {
        Args: { d: Database["public"]["Enums"]["team_division"] }
        Returns: string
      }
      combine_bracket_schedule_timestamp: {
        Args: { _event_date: string; _event_time: string }
        Returns: string
      }
      complete_admin_user_password_setup: {
        Args: { _login_identifier: string; _new_password: string }
        Returns: string
      }
      create_admin_user_with_access: {
        Args: {
          _login_identifier: string
          _name?: string
          _password?: string
          _profile_id?: string
          _role?: Database["public"]["Enums"]["app_role"]
        }
        Returns: string
      }
      create_championship_knockout_match_schedule:
        | { Args: { _bracket_match_id: string }; Returns: undefined }
        | {
            Args: { _bracket_match_id: string; _championship_id: string }
            Returns: string
          }
      delete_public_link_item: {
        Args: { _item_id: string }
        Returns: undefined
      }
      delete_public_link_section: {
        Args: { _section_id: string }
        Returns: undefined
      }
      disqualify_championship_team_competition: {
        Args: {
          _championship_id: string
          _division: Database["public"]["Enums"]["team_division"]
          _naipe: Database["public"]["Enums"]["match_naipe"]
          _season_year: number
          _sport_id: string
          _team_id: string
        }
        Returns: Json
      }
      ensure_active_team_reference: {
        Args: { _context: string; _team_id: string }
        Returns: undefined
      }
      ensure_championship_knockout_next_round_match: {
        Args: {
          _championship_id: string
          _competition_id: string
          _next_slot_number: number
          _source_round_number: number
        }
        Returns: string
      }
      ensure_championship_knockout_third_place_match: {
        Args: {
          _championship_id: string
          _competition_id: string
          _semifinal_round_number: number
        }
        Returns: string
      }
      ensure_league_calendar_holidays_year: {
        Args: { _year: number }
        Returns: number
      }
      finish_championship_individual_session: {
        Args: { _session_id: string }
        Returns: string
      }
      generate_championship_bracket_groups: {
        Args: { _championship_id: string; _payload: Json }
        Returns: string
      }
      generate_championship_bracket_groups_from_exact_preview: {
        Args: {
          _championship_id: string
          _payload: Json
          _expected_payload_signature: string
          _expected_generation_signature: string
        }
        Returns: string
      }
      get_championship_bracket_preview_job_day: {
        Args: { _date: string; _job_id: string }
        Returns: Json
      }
      get_championship_bracket_preview_job_status: {
        Args: { _job_id: string }
        Returns: Json
      }
      generate_championship_knockout: {
        Args: { _bracket_edition_id?: string; _championship_id: string }
        Returns: string
      }
      generate_championship_knockout_for_competition:
        | {
            Args: {
              _bracket_edition_id?: string
              _championship_id: string
              _competition_id: string
            }
            Returns: string
          }
        | {
            Args: { _competition_id: string; _third_place_enabled?: boolean }
            Returns: undefined
          }
      get_championship_award_pending_draws: {
        Args: { _championship_id: string; _season_year?: number }
        Returns: Json
      }
      get_championship_bracket_competition_group_rankings: {
        Args: { _championship_id: string; _competition_id: string }
        Returns: {
          competition_id: string
          goal_diff: number
          goals_for: number
          group_id: string
          group_number: number
          points: number
          team_id: string
          team_name: string
          team_rank: number
          wins: number
        }[]
      }
      get_championship_bracket_competition_qualification_pool_ranking: {
        Args: { _championship_id: string; _competition_id: string }
        Returns: {
          competition_id: string
          goal_diff: number
          goals_for: number
          points: number
          pool_rank: number
          qualification_rank: number
          team_id: string
          team_name: string
          wins: number
        }[]
      }
      get_championship_bracket_draft: {
        Args: { _championship_id: string; _season_year?: number }
        Returns: {
          edition_id: string
          payload_snapshot: Json
          season_year: number
          status: Database["public"]["Enums"]["bracket_edition_status"]
          updated_at: string
          updated_by: string
          updated_by_name: string
        }[]
      }
      get_championship_bracket_pending_tie_breaks: {
        Args: { _bracket_edition_id?: string; _championship_id: string }
        Returns: Json
      }
      get_championship_bracket_resolved_tie_break_orders: {
        Args: { _championship_id: string; _season_year?: number }
        Returns: Json
      }
      get_championship_bracket_tie_break_contexts: {
        Args: {
          _bracket_edition_id?: string
          _championship_id: string
          _competition_id?: string
        }
        Returns: {
          bracket_edition_id: string
          competition_id: string
          context_key: string
          context_type: Database["public"]["Enums"]["championship_bracket_tie_break_context_type"]
          description: string
          division: Database["public"]["Enums"]["team_division"]
          group_id: string
          group_number: number
          is_resolved: boolean
          naipe: Database["public"]["Enums"]["match_naipe"]
          qualification_rank: number
          sport_name: string
          team_ids: string[]
          team_names: string[]
          tied_team_signature: string
          title: string
        }[]
      }
      get_championship_bracket_view: {
        Args: { _championship_id: string; _season_year?: number }
        Returns: Json
      }
      get_championship_corrected_group_standings: {
        Args: { _championship_id: string; _season_year?: number }
        Returns: {
          blue_cards: number
          competition_id: string
          corrected_points: number
          correction_factor: number
          division: Database["public"]["Enums"]["team_division"]
          goal_diff: number
          goals_against: number
          goals_for: number
          group_id: string
          group_number: number
          group_size: number
          naipe: Database["public"]["Enums"]["match_naipe"]
          points_average: number
          points_base: number
          red_cards: number
          sport_id: string
          sport_name: string
          team_id: string
          team_name: string
          two_minute_penalties: number
          wins: number
          yellow_cards: number
        }[]
      }
      get_championship_effective_standings: {
        Args: {
          _championship_id?: string
          _division_filter?: string
          _naipe?: Database["public"]["Enums"]["match_naipe"]
          _season_year?: number
          _sport_id?: string
        }
        Returns: {
          blue_cards: number
          championship_id: string
          division: Database["public"]["Enums"]["team_division"]
          draws: number
          eighteenth_places: number
          eighth_places: number
          eleventh_places: number
          fifteenth_places: number
          fifth_places: number
          first_places: number
          fourteenth_places: number
          fourth_places: number
          goal_diff: number
          goals_against: number
          goals_for: number
          id: string
          is_individual_sport: boolean
          losses: number
          naipe: Database["public"]["Enums"]["match_naipe"]
          nineteenth_places: number
          ninth_places: number
          played: number
          points: number
          red_cards: number
          relay_points_total: number
          scored_events_count: number
          season_year: number
          second_places: number
          seventeenth_places: number
          seventh_places: number
          sixteenth_places: number
          sixth_places: number
          sport_id: string
          sport_name: string
          team_city: string
          team_id: string
          team_name: string
          tenth_places: number
          third_places: number
          thirteenth_places: number
          twelfth_places: number
          twentieth_places: number
          two_minute_penalties: number
          updated_at: string
          wins: number
          yellow_cards: number
        }[]
      }
      get_championship_knockout_final_program_schedule: {
        Args: { _bracket_edition_id: string }
        Returns: {
          bracket_court_id: string
          bracket_day_id: string
          competition_id: string
          court_group_id: string
          court_name: string
          display_order: number
          division: Database["public"]["Enums"]["team_division"]
          duration_minutes: number
          expected_final_round: number
          location_group_id: string
          location_name: string
          naipe: Database["public"]["Enums"]["match_naipe"]
          naipe_position: number
          planned_end_at: string
          planned_queue_position: number
          planned_scheduled_slot: number
          planned_start_at: string
          schedule_period: Database["public"]["Enums"]["championship_schedule_period"]
          scheduled_date: string
          sport_id: string
        }[]
      }
      get_championship_score_sheet_awards_rankings: {
        Args: { _championship_id: string; _season_year?: number }
        Returns: Json
      }
      get_championship_setup_payload_snapshot: {
        Args: { _championship_id: string; _season_year: number }
        Returns: Json
      }
      get_current_admin_account: {
        Args: never
        Returns: {
          email: string
          login_identifier: string
          name: string
          password_status: Database["public"]["Enums"]["admin_user_password_status"]
          profile_id: string
          profile_name: string
          theme_mode_preference: Database["public"]["Enums"]["theme_mode_preference"]
          user_id: string
        }[]
      }
      get_current_user_admin_context: {
        Args: never
        Returns: {
          account_permission: Database["public"]["Enums"]["admin_panel_permission_level"]
          championship_schedule_permission: Database["public"]["Enums"]["admin_panel_permission_level"]
          championship_status_permission: Database["public"]["Enums"]["admin_panel_permission_level"]
          control_permission: Database["public"]["Enums"]["admin_panel_permission_level"]
          events_permission: Database["public"]["Enums"]["admin_panel_permission_level"]
          individual_events_permission: Database["public"]["Enums"]["admin_panel_permission_level"]
          links_permission: Database["public"]["Enums"]["admin_panel_permission_level"]
          logs_permission: Database["public"]["Enums"]["admin_panel_permission_level"]
          matches_permission: Database["public"]["Enums"]["admin_panel_permission_level"]
          opening_ceremony_bonus_permission: Database["public"]["Enums"]["admin_panel_permission_level"]
          profile_id: string
          profile_name: string
          role: Database["public"]["Enums"]["app_role"]
          score_sheet_review_permission: Database["public"]["Enums"]["admin_panel_permission_level"]
          settings_permission: Database["public"]["Enums"]["admin_panel_permission_level"]
          sports_permission: Database["public"]["Enums"]["admin_panel_permission_level"]
          standings_permission: Database["public"]["Enums"]["admin_panel_permission_level"]
          teams_permission: Database["public"]["Enums"]["admin_panel_permission_level"]
          tie_breaks_permission: Database["public"]["Enums"]["admin_panel_permission_level"]
          users_permission: Database["public"]["Enums"]["admin_panel_permission_level"]
        }[]
      }
      get_current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_current_user_theme_mode_preference: {
        Args: never
        Returns: Database["public"]["Enums"]["theme_mode_preference"]
      }
      get_home_dashboard_metrics:
        | { Args: { _season_year?: number }; Returns: Json }
        | {
            Args: {
              _championship_code?: Database["public"]["Enums"]["championship_code"]
              _season_year?: number
            }
            Returns: Json
          }
      get_match_score_sheet_awards_context: {
        Args: { _match_id: string }
        Returns: Json
      }
      get_match_sets: { Args: { _match_id: string }; Returns: Json }
      get_public_access_settings: {
        Args: never
        Returns: {
          announcement_message: string
          blocked_message: string
          is_championships_page_blocked: boolean
          is_league_calendar_page_blocked: boolean
          is_links_page_blocked: boolean
          is_live_page_blocked: boolean
          is_public_access_blocked: boolean
          is_schedule_page_blocked: boolean
          updated_at: string
        }[]
      }
      has_admin_tab_access: {
        Args: {
          _requires_edit?: boolean
          _tab: Database["public"]["Enums"]["admin_panel_tab"]
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_championship_competition_team_disqualified: {
        Args: {
          _championship_id: string
          _division: Database["public"]["Enums"]["team_division"]
          _naipe: Database["public"]["Enums"]["match_naipe"]
          _season_year: number
          _sport_id: string
          _team_id: string
        }
        Returns: boolean
      }
      is_competition_period_enabled_by_payload: {
        Args: {
          _competition_key: string
          _event_date: string
          _payload: Json
          _period: Database["public"]["Enums"]["championship_schedule_period"]
        }
        Returns: boolean
      }
      is_eventos: { Args: never; Returns: boolean }
      is_mesa: { Args: never; Returns: boolean }
      is_public_access_blocked: { Args: never; Returns: boolean }
      is_schedule_period_enabled_by_payload: {
        Args: {
          _event_date: string
          _payload: Json
          _period: Database["public"]["Enums"]["championship_schedule_period"]
        }
        Returns: boolean
      }
      is_team_competition_period_enabled_by_payload: {
        Args: {
          _competition_key: string
          _event_date: string
          _payload: Json
          _period: Database["public"]["Enums"]["championship_schedule_period"]
          _team_id: string
        }
        Returns: boolean
      }
      list_admin_profiles: {
        Args: never
        Returns: {
          created_at: string
          is_system: boolean
          permissions: Json
          profile_id: string
          profile_name: string
          updated_at: string
        }[]
      }
      list_admin_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          last_sign_in_at: string
          login_identifier: string
          name: string
          password_status: Database["public"]["Enums"]["admin_user_password_status"]
          profile_id: string
          profile_name: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      list_championship_competition_team_disqualifications: {
        Args: { _championship_id: string; _season_year?: number }
        Returns: {
          championship_id: string
          created_at: string
          created_by: string | null
          division: Database["public"]["Enums"]["team_division"] | null
          id: string
          naipe: Database["public"]["Enums"]["match_naipe"]
          season_year: number
          sport_id: string
          team_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "championship_competition_team_disqualifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_editable_match_schedule_slots: {
        Args: {
          _away_team_id?: string
          _home_team_id?: string
          _match_id: string
          _naipe?: Database["public"]["Enums"]["match_naipe"]
          _sport_id?: string
          _target_court_name: string
          _target_date: string
          _target_location: string
        }
        Returns: {
          is_current_slot: boolean
          slot_number: number
          start_time: string
          start_time_label: string
        }[]
      }
      list_match_queue_swap_candidates: {
        Args: { _source_match_id: string }
        Returns: {
          away_team_name: string
          created_at: string
          home_team_name: string
          match_id: string
          queue_position: number
          scheduled_date: string
          scheduled_slot: number
          start_time: string
          uses_reduced_cross_sport_rest_gap: boolean
        }[]
      }
      normalize_admin_login_identifier: {
        Args: { _login_identifier: string }
        Returns: string
      }
      normalize_admin_user_name: {
        Args: { _fallback?: string; _name: string }
        Returns: string
      }
      normalize_award_player_name: { Args: { _name: string }; Returns: string }
      normalize_bracket_entity_name: {
        Args: { _value: string }
        Returns: string
      }
      normalize_sport_name: { Args: { sport_name: string }; Returns: string }
      preview_championship_bracket_groups: {
        Args: { _championship_id: string; _payload: Json }
        Returns: Json
      }
      process_championship_bracket_preview_queue: {
        Args: { _max_messages?: number }
        Returns: Json
      }
      preview_championship_individual_session_scoreboard: {
        Args: { _session_id: string }
        Returns: {
          confirmed_entries_count: number
          first_places: number
          relay_points_total: number
          second_places: number
          session_id: string
          team_id: string
          teams: Database["public"]["Tables"]["teams"]["Row"]
          third_places: number
          total_points: number
        }[]
      }
      propagate_championship_knockout_progress: {
        Args: { _match_id: string }
        Returns: undefined
      }
      rebuild_standings_scope:
        | {
            Args: {
              _championship_id: string
              _division: Database["public"]["Enums"]["team_division"]
              _naipe: Database["public"]["Enums"]["match_naipe"]
              _season_year: number
              _sport_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _championship_id: string
              _division: Database["public"]["Enums"]["team_division"]
              _naipe: Database["public"]["Enums"]["match_naipe"]
              _sport_id: string
            }
            Returns: undefined
          }
      recalculate_championship_individual_standings: {
        Args: { _championship_id: string; _season_year: number }
        Returns: undefined
      }
      redistribute_bracket_scheduled_matches: {
        Args: { _bracket_edition_id: string }
        Returns: undefined
      }
      refresh_championship_knockout_competition_after_disqualificatio: {
        Args: { _championship_id: string; _competition_id: string }
        Returns: string
      }
      register_admin_login_action: { Args: never; Returns: undefined }
      remove_championship_athlete: {
        Args: { _athlete_id: string }
        Returns: undefined
      }
      remove_championship_individual_event_entry: {
        Args: { _entry_id: string }
        Returns: undefined
      }
      remove_duplicate_league_events: { Args: never; Returns: number }
      reopen_championship_individual_session: {
        Args: { _session_id: string }
        Returns: string
      }
      reposition_match_queue_slot: {
        Args: { _match_id: string; _target_slot: number }
        Returns: Json
      }
      reprocess_match_queue_positions: {
        Args: {
          _championship_id: string
          _scheduled_date: string
          _season_year: number
        }
        Returns: undefined
      }
      resolve_admin_login_state: {
        Args: { _login_identifier: string }
        Returns: {
          auth_email: string
          login_identifier: string
          password_status: Database["public"]["Enums"]["admin_user_password_status"]
        }[]
      }
      resolve_admin_user_auth_email: {
        Args: { _login_identifier: string }
        Returns: string
      }
      resolve_bracket_court_next_available_start: {
        Args: {
          _bracket_court_id: string
          _bracket_day_id: string
          _candidate_start: string
          _duration_minutes: number
        }
        Returns: string
      }
      resolve_bracket_day_max_slots: {
        Args: {
          _allow_unbounded?: boolean
          _bracket_day_id: string
          _championship_id: string
        }
        Returns: number
      }
      resolve_bracket_knockout_division_scope: {
        Args: { _division: Database["public"]["Enums"]["team_division"] }
        Returns: Database["public"]["Enums"]["bracket_knockout_division_scope"]
      }
      resolve_bracket_knockout_match_phase: {
        Args: {
          _competition_total_rounds: number
          _is_third_place: boolean
          _round_number: number
        }
        Returns: Database["public"]["Enums"]["bracket_knockout_priority_phase"]
      }
      resolve_bracket_knockout_priority_court_group_id: {
        Args: {
          _bracket_edition_id: string
          _division_scope: Database["public"]["Enums"]["bracket_knockout_division_scope"]
          _phase: Database["public"]["Enums"]["bracket_knockout_priority_phase"]
          _sport_id: string
        }
        Returns: string
      }
      resolve_championship_bracket_match_loser_team_id: {
        Args: { _bracket_match_id: string }
        Returns: string
      }
      resolve_championship_competition_expected_knockout_rounds: {
        Args: { _competition_id: string }
        Returns: number
      }
      resolve_championship_individual_competition_key: {
        Args: {
          _division: Database["public"]["Enums"]["team_division"]
          _naipe: Database["public"]["Enums"]["match_naipe"]
          _sport_id: string
        }
        Returns: string
      }
      resolve_championship_knockout_pairing_mode: {
        Args: { _value: string }
        Returns: string
      }
      resolve_championship_sport_duration_minutes: {
        Args: { _championship_id: string; _sport_id: string }
        Returns: number
      }
      resolve_championship_sport_result_rule: {
        Args: { _championship_id: string; _sport_id: string }
        Returns: Database["public"]["Enums"]["championship_sport_result_rule"]
      }
      resolve_championship_sport_supports_cards: {
        Args: { sport_name: string }
        Returns: boolean
      }
      resolve_championship_sport_tie_breaker_rule: {
        Args: { sport_name: string }
        Returns: Database["public"]["Enums"]["championship_sport_tie_breaker_rule"]
      }
      resolve_current_user_tab_permission_level: {
        Args: { _tab: Database["public"]["Enums"]["admin_panel_tab"] }
        Returns: Database["public"]["Enums"]["admin_panel_permission_level"]
      }
      resolve_easter_date: { Args: { _year: number }; Returns: string }
      resolve_highest_admin_permission_level: {
        Args: {
          _first_level: Database["public"]["Enums"]["admin_panel_permission_level"]
          _second_level: Database["public"]["Enums"]["admin_panel_permission_level"]
        }
        Returns: Database["public"]["Enums"]["admin_panel_permission_level"]
      }
      resolve_individual_event_position_points: {
        Args: { _final_position: number }
        Returns: number
      }
      resolve_individual_event_position_points_by_payload: {
        Args: { _final_position: number; _payload: Json; _sport_id: string }
        Returns: number
      }
      resolve_match_queue_swap_conflict: {
        Args: { _source_match_id: string; _target_match_id: string }
        Returns: string
      }
      resolve_normalized_sport_name: {
        Args: { _sport_name: string }
        Returns: string
      }
      resolve_or_create_championship_award_player: {
        Args: {
          _championship_id: string
          _division: Database["public"]["Enums"]["team_division"]
          _naipe: Database["public"]["Enums"]["match_naipe"]
          _payload: Json
          _season_year: number
          _sport_id: string
          _team_id: string
        }
        Returns: string
      }
      resolve_role_tab_permission_level: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _tab: Database["public"]["Enums"]["admin_panel_tab"]
        }
        Returns: Database["public"]["Enums"]["admin_panel_permission_level"]
      }
      resolve_scheduled_match_court_sequence_conflict: {
        Args: {
          _away_team_id: string
          _championship_id: string
          _court_name: string
          _created_at: string
          _home_team_id: string
          _location: string
          _match_id: string
          _queue_position: number
          _scheduled_date: string
          _scheduled_slot: number
          _season_year: number
          _start_time: string
        }
        Returns: string
      }
      resolve_scheduled_match_rest_gap_conflict: {
        Args: {
          _away_team_id: string
          _championship_id: string
          _court_name: string
          _created_at: string
          _duration_minutes?: number
          _home_team_id: string
          _location: string
          _match_id: string
          _naipe: Database["public"]["Enums"]["match_naipe"]
          _queue_position: number
          _scheduled_date: string
          _scheduled_slot: number
          _season_year: number
          _sport_id: string
          _start_time: string
        }
        Returns: string
      }
      resolve_system_role_by_profile_id: {
        Args: { _profile_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      review_league_event_reservation_request: {
        Args: {
          _decision: Database["public"]["Enums"]["league_event_reservation_request_status"]
          _request_id: string
          _review_notes?: string
        }
        Returns: Json
      }
      save_championship_athlete: {
        Args: {
          _athlete_id?: string
          _championship_id: string
          _division: Database["public"]["Enums"]["team_division"]
          _naipe: Database["public"]["Enums"]["match_naipe"]
          _name: string
          _season_year: number
          _sport_id: string
          _team_id: string
        }
        Returns: string
      }
      save_championship_award_draw_result: {
        Args: {
          _award_type: Database["public"]["Enums"]["championship_award_type"]
          _championship_id: string
          _division: Database["public"]["Enums"]["team_division"]
          _naipe: Database["public"]["Enums"]["match_naipe"]
          _season_year: number
          _sport_id: string
          _tied_player_ids_signature?: string
          _winner_player_id?: string
          _winner_team_id?: string
        }
        Returns: Json
      }
      save_championship_bracket_draft: {
        Args: { _championship_id: string; _payload: Json }
        Returns: {
          edition_id: string
          payload_snapshot: Json
          season_year: number
          status: Database["public"]["Enums"]["bracket_edition_status"]
          updated_at: string
          updated_by: string
          updated_by_name: string
        }[]
      }
      save_championship_bracket_location_template: {
        Args: { _payload: Json }
        Returns: string
      }
      save_championship_bracket_tie_break_resolution: {
        Args: { _payload: Json }
        Returns: string
      }
      save_championship_individual_event: {
        Args: {
          _event_id: string
          _location: string
          _period: Database["public"]["Enums"]["championship_schedule_period"]
          _scheduled_date: string
          _status: Database["public"]["Enums"]["championship_individual_event_status"]
        }
        Returns: string
      }
      save_championship_individual_event_entry: {
        Args: {
          _athlete_id?: string
          _event_id: string
          _member_athlete_ids?: string[]
          _starter_athlete_ids?: string[]
          _team_id: string
        }
        Returns: string
      }
      save_championship_individual_event_results: {
        Args: { _event_id: string; _results: Json }
        Returns: undefined
      }
      save_championship_individual_session: {
        Args: {
          _court_key: string
          _court_name: string
          _exclusive_lock_enabled?: boolean
          _location_key: string
          _location_name: string
          _period: Database["public"]["Enums"]["championship_schedule_period"]
          _scheduled_date: string
          _session_id: string
          _status: Database["public"]["Enums"]["championship_individual_session_status"]
        }
        Returns: string
      }
      save_interlaje_opening_ceremony_bonus: {
        Args: {
          _championship_id: string
          _eligible: boolean
          _justification?: string
          _season_year: number
          _team_id: string
        }
        Returns: undefined
      }
      save_interlaje_opening_ceremony_bonus_points: {
        Args: { _championship_id: string; _points: number; _season_year: number }
        Returns: undefined
      }
      save_match_score_sheet_awards: {
        Args: {
          _away_goal_scorers?: Json
          _away_goalkeepers?: Json
          _home_goal_scorers?: Json
          _home_goalkeepers?: Json
          _match_id: string
        }
        Returns: Json
      }
      save_match_sets: {
        Args: { _match_id: string; _sets: Json }
        Returns: undefined
      }
      set_public_access_settings: {
        Args: {
          _announcement_message?: string
          _blocked_message?: string
          _is_championships_page_blocked?: boolean
          _is_league_calendar_page_blocked?: boolean
          _is_links_page_blocked?: boolean
          _is_live_page_blocked?: boolean
          _is_public_access_blocked: boolean
          _is_schedule_page_blocked?: boolean
        }
        Returns: undefined
      }
      start_championship_individual_session: {
        Args: { _session_id: string }
        Returns: string
      }
      start_championship_bracket_preview_job: {
        Args: { _championship_id: string; _payload: Json }
        Returns: Json
      }
      swap_championship_knockout_bracket_teams: {
        Args: {
          _competition_id: string
          _team_a_id: string
          _team_b_id: string
        }
        Returns: undefined
      }
      swap_match_queue_slots: {
        Args: { _source_match_id: string; _target_match_id: string }
        Returns: Json
      }
      sync_bracket_global_court_preferences: {
        Args: {
          _bracket_edition_id: string
          _location_group_id: string
          _priority_mode: Database["public"]["Enums"]["bracket_court_priority_mode"]
          _sport_id: string
        }
        Returns: undefined
      }
      sync_championship_bracket_court_sport_preferences: {
        Args: { _bracket_edition_id: string; _payload: Json }
        Returns: undefined
      }
      sync_championship_bracket_edition_status: {
        Args: { _bracket_edition_id: string }
        Returns: undefined
      }
      sync_championship_bracket_match_participants: {
        Args: { _bracket_match_id: string }
        Returns: string
      }
      sync_championship_individual_events_from_setup: {
        Args: { _championship_id: string; _season_year: number }
        Returns: number
      }
      sync_championship_individual_sessions_from_setup: {
        Args: { _championship_id: string; _season_year: number }
        Returns: number
      }
      sync_championship_season_rollover: { Args: never; Returns: undefined }
      update_bracket_competition_qualification: {
        Args: {
          _competition_id: string
          _qualifiers_per_group: number
          _should_complete_knockout_with_best_second_placed_teams: boolean
        }
        Returns: undefined
      }
      update_bracket_competition_settings: {
        Args: {
          _competition_id: string
          _knockout_pairing_mode: string
          _qualifiers_per_group: number
          _should_complete_knockout_with_best_second_placed_teams: boolean
        }
        Returns: undefined
      }
      update_bracket_court_priorities: {
        Args: { _bracket_edition_id: string; _court_priorities: Json }
        Returns: undefined
      }
      update_bracket_day_schedule: {
        Args: { _bracket_edition_id: string; _schedule_updates: Json }
        Returns: undefined
      }
      update_bracket_generated_location_group: {
        Args: { _bracket_edition_id: string; _payload: Json }
        Returns: undefined
      }
      update_bracket_knockout_court_priorities: {
        Args: { _bracket_edition_id: string; _priority_updates: Json }
        Returns: undefined
      }
      update_bracket_location_sport_priorities: {
        Args: { _bracket_edition_id: string; _priority_updates: Json }
        Returns: undefined
      }
      update_scheduled_match_logistics: {
        Args: {
          _away_team_id?: string
          _court_name: string
          _home_team_id?: string
          _location: string
          _match_id: string
          _naipe?: Database["public"]["Enums"]["match_naipe"]
          _representation_mode?: string
          _scheduled_date: string
          _slot_start_time: string
          _sport_id?: string
        }
        Returns: undefined
      }
      upsert_admin_profile: {
        Args: {
          _permissions?: Json
          _profile_id?: string
          _profile_name?: string
        }
        Returns: string
      }
      upsert_public_link_item: {
        Args: {
          _display_name?: string
          _filter_mode?: Database["public"]["Enums"]["public_link_filter_mode"]
          _filters?: Json
          _is_active?: boolean
          _item_id?: string
          _section_id?: string
          _sort_order?: number
          _url?: string
        }
        Returns: string
      }
      upsert_public_link_section: {
        Args: {
          _description?: string
          _is_active?: boolean
          _name?: string
          _section_id?: string
          _sort_order?: number
        }
        Returns: string
      }
      validate_championship_knockout_final_program_schedule: {
        Args: { _bracket_edition_id: string }
        Returns: undefined
      }
      write_admin_action_log: {
        Args: {
          _action_type: Database["public"]["Enums"]["admin_action_type"]
          _description?: string
          _metadata?: Json
          _new_data?: Json
          _old_data?: Json
          _record_id?: string
          _resource_table: string
        }
        Returns: undefined
      }
      write_championship_bracket_workflow_log: {
        Args: {
          _action_type: Database["public"]["Enums"]["admin_action_type"]
          _description?: string
          _metadata?: Json
          _step: string
        }
        Returns: undefined
      }
    }
    Enums: {
      admin_action_type:
        | "INSERT"
        | "UPDATE"
        | "DELETE"
        | "PASSWORD_CHANGED"
        | "LOGIN"
      admin_panel_permission_level: "NONE" | "VIEW" | "EDIT"
      admin_panel_tab:
        | "matches"
        | "control"
        | "teams"
        | "sports"
        | "events"
        | "links"
        | "logs"
        | "users"
        | "settings"
        | "account"
        | "championship_status"
        | "score_sheet_review"
        | "tie_breaks"
        | "standings"
        | "championship_schedule"
        | "individual_events"
        | "opening_ceremony_bonus"
      admin_user_password_status: "PENDING" | "ACTIVE"
      app_role: "admin" | "mesa" | "eventos"
      bracket_court_priority_mode: "NONE" | "NAIPE" | "DIVISION"
      bracket_court_sequence_mode: "FLEXIBLE" | "GROUP_NAIPE" | "GROUP_DIVISION"
      bracket_day_break_scope_type: "ALL_COURTS" | "COURT"
      bracket_edition_status:
        | "DRAFT"
        | "GROUPS_GENERATED"
        | "KNOCKOUT_GENERATED"
      bracket_knockout_division_scope:
        | "DIVISAO_PRINCIPAL"
        | "DIVISAO_ACESSO"
        | "ALL"
      bracket_knockout_priority_phase: "SEMIFINAL" | "FINAL"
      bracket_phase: "GROUP_STAGE" | "KNOCKOUT"
      bracket_third_place_mode: "NONE" | "MATCH" | "CHAMPION_SEMIFINAL_LOSER"
      championship_award_type: "TOP_SCORER" | "BEST_GOALKEEPER"
      championship_bracket_tie_break_context_type:
        | "GROUP"
        | "QUALIFICATION_POOL"
      championship_code: "CLV" | "SOCIETY" | "INTERLAJE"
      championship_individual_entry_status:
        | "PENDING"
        | "CONFIRMED"
        | "DNS"
        | "DSQ"
        | "CANCELLED"
        | "DSQ_OVER_LIMIT"
      championship_individual_event_kind: "INDIVIDUAL" | "RELAY"
      championship_individual_event_status:
        | "DRAFT"
        | "SCHEDULED"
        | "FINISHED"
        | "CANCELLED"
      championship_individual_session_status:
        | "DRAFT"
        | "SCHEDULED"
        | "LIVE"
        | "FINISHED"
        | "CANCELLED"
      championship_schedule_period: "MATUTINO" | "VESPERTINO"
      championship_season_division_format: "SEPARATED" | "UNIFIED"
      championship_season_division_settlement_mode:
        | "NONE"
        | "PROMOTION_RELEGATION"
        | "TOP_N_TO_PRINCIPAL"
      championship_sport_naipe_mode: "MISTO" | "MASCULINO_FEMININO"
      championship_sport_result_rule: "POINTS" | "SETS"
      championship_sport_tie_breaker_rule:
        | "STANDARD"
        | "POINTS_AVERAGE"
        | "BEACH_SOCCER"
        | "BEACH_TENNIS"
        | "FUTEBOL_SOCIETY"
        | "HANDEBOL"
      championship_status: "PLANNING" | "UPCOMING" | "REVIEW" | "IN_PROGRESS" | "FINISHED"
      league_calendar_holiday_day_kind: "HOLIDAY" | "OPTIONAL"
      league_calendar_holiday_scope: "NATIONAL" | "JOINVILLE"
      league_event_organizer_type: "ATHLETIC" | "LAJE"
      league_event_reservation_request_status:
        | "PENDING"
        | "APPROVED"
        | "REJECTED"
      league_event_type: "HH" | "OPEN_BAR" | "CHAMPIONSHIP" | "LAJE_EVENT"
      match_naipe: "FEMININO" | "MASCULINO" | "MISTO"
      match_status: "SCHEDULED" | "LIVE" | "FINISHED"
      public_link_filter_mode: "GLOBAL" | "BY_CHAMPIONSHIP_YEAR"
      team_division: "DIVISAO_PRINCIPAL" | "DIVISAO_ACESSO"
      theme_mode_preference: "auto" | "light" | "dark"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      admin_action_type: [
        "INSERT",
        "UPDATE",
        "DELETE",
        "PASSWORD_CHANGED",
        "LOGIN",
      ],
      admin_panel_permission_level: ["NONE", "VIEW", "EDIT"],
      admin_panel_tab: [
        "matches",
        "control",
        "teams",
        "sports",
        "events",
        "links",
        "logs",
        "users",
        "settings",
        "account",
        "championship_status",
        "score_sheet_review",
        "tie_breaks",
        "standings",
        "championship_schedule",
        "individual_events",
        "opening_ceremony_bonus",
      ],
      admin_user_password_status: ["PENDING", "ACTIVE"],
      app_role: ["admin", "mesa", "eventos"],
      bracket_court_priority_mode: ["NONE", "NAIPE", "DIVISION"],
      bracket_court_sequence_mode: [
        "FLEXIBLE",
        "GROUP_NAIPE",
        "GROUP_DIVISION",
      ],
      bracket_day_break_scope_type: ["ALL_COURTS", "COURT"],
      bracket_edition_status: [
        "DRAFT",
        "GROUPS_GENERATED",
        "KNOCKOUT_GENERATED",
      ],
      bracket_knockout_division_scope: [
        "DIVISAO_PRINCIPAL",
        "DIVISAO_ACESSO",
        "ALL",
      ],
      bracket_knockout_priority_phase: ["SEMIFINAL", "FINAL"],
      bracket_phase: ["GROUP_STAGE", "KNOCKOUT"],
      bracket_third_place_mode: ["NONE", "MATCH", "CHAMPION_SEMIFINAL_LOSER"],
      championship_award_type: ["TOP_SCORER", "BEST_GOALKEEPER"],
      championship_bracket_tie_break_context_type: [
        "GROUP",
        "QUALIFICATION_POOL",
      ],
      championship_code: ["CLV", "SOCIETY", "INTERLAJE"],
      championship_individual_entry_status: [
        "PENDING",
        "CONFIRMED",
        "DNS",
        "DSQ",
        "CANCELLED",
        "DSQ_OVER_LIMIT",
      ],
      championship_individual_event_kind: ["INDIVIDUAL", "RELAY"],
      championship_individual_event_status: [
        "DRAFT",
        "SCHEDULED",
        "FINISHED",
        "CANCELLED",
      ],
      championship_individual_session_status: [
        "DRAFT",
        "SCHEDULED",
        "LIVE",
        "FINISHED",
        "CANCELLED",
      ],
      championship_schedule_period: ["MATUTINO", "VESPERTINO"],
      championship_season_division_format: ["SEPARATED", "UNIFIED"],
      championship_season_division_settlement_mode: [
        "NONE",
        "PROMOTION_RELEGATION",
        "TOP_N_TO_PRINCIPAL",
      ],
      championship_sport_naipe_mode: ["MISTO", "MASCULINO_FEMININO"],
      championship_sport_result_rule: ["POINTS", "SETS"],
      championship_sport_tie_breaker_rule: [
        "STANDARD",
        "POINTS_AVERAGE",
        "BEACH_SOCCER",
        "BEACH_TENNIS",
        "FUTEBOL_SOCIETY",
        "HANDEBOL",
      ],
      championship_status: ["PLANNING", "UPCOMING", "REVIEW", "IN_PROGRESS", "FINISHED"],
      league_calendar_holiday_day_kind: ["HOLIDAY", "OPTIONAL"],
      league_calendar_holiday_scope: ["NATIONAL", "JOINVILLE"],
      league_event_organizer_type: ["ATHLETIC", "LAJE"],
      league_event_reservation_request_status: [
        "PENDING",
        "APPROVED",
        "REJECTED",
      ],
      league_event_type: ["HH", "OPEN_BAR", "CHAMPIONSHIP", "LAJE_EVENT"],
      match_naipe: ["FEMININO", "MASCULINO", "MISTO"],
      match_status: ["SCHEDULED", "LIVE", "FINISHED"],
      public_link_filter_mode: ["GLOBAL", "BY_CHAMPIONSHIP_YEAR"],
      team_division: ["DIVISAO_PRINCIPAL", "DIVISAO_ACESSO"],
      theme_mode_preference: ["auto", "light", "dark"],
    },
  },
} as const
