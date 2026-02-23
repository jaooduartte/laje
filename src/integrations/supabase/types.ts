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
      championships: {
        Row: {
          code: Database["public"]["Enums"]["championship_code"]
          created_at: string
          default_location: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["championship_status"]
          uses_divisions: boolean
        }
        Insert: {
          code: Database["public"]["Enums"]["championship_code"]
          created_at?: string
          default_location?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["championship_status"]
          uses_divisions?: boolean
        }
        Update: {
          code?: Database["public"]["Enums"]["championship_code"]
          created_at?: string
          default_location?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["championship_status"]
          uses_divisions?: boolean
        }
        Relationships: []
      }
      championship_sports: {
        Row: {
          championship_id: string
          created_at: string
          id: string
          naipe_mode: Database["public"]["Enums"]["championship_sport_naipe_mode"]
          supports_cards: boolean
          tie_breaker_rule: Database["public"]["Enums"]["championship_sport_tie_breaker_rule"]
          points_draw: number
          points_loss: number
          points_win: number
          sport_id: string
        }
        Insert: {
          championship_id: string
          created_at?: string
          id?: string
          naipe_mode?: Database["public"]["Enums"]["championship_sport_naipe_mode"]
          supports_cards?: boolean
          tie_breaker_rule?: Database["public"]["Enums"]["championship_sport_tie_breaker_rule"]
          points_draw?: number
          points_loss?: number
          points_win?: number
          sport_id: string
        }
        Update: {
          championship_id?: string
          created_at?: string
          id?: string
          naipe_mode?: Database["public"]["Enums"]["championship_sport_naipe_mode"]
          supports_cards?: boolean
          tie_breaker_rule?: Database["public"]["Enums"]["championship_sport_tie_breaker_rule"]
          points_draw?: number
          points_loss?: number
          points_win?: number
          sport_id?: string
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
      matches: {
        Row: {
          away_red_cards: number
          away_score: number
          away_yellow_cards: number
          away_team_id: string
          championship_id: string
          created_at: string
          division: Database["public"]["Enums"]["team_division"] | null
          end_time: string
          home_red_cards: number
          home_score: number
          home_yellow_cards: number
          home_team_id: string
          id: string
          location: string
          naipe: Database["public"]["Enums"]["match_naipe"]
          sport_id: string
          start_time: string
          status: Database["public"]["Enums"]["match_status"]
          supports_cards: boolean
        }
        Insert: {
          away_red_cards?: number
          away_score?: number
          away_yellow_cards?: number
          away_team_id: string
          championship_id: string
          created_at?: string
          division?: Database["public"]["Enums"]["team_division"] | null
          end_time: string
          home_red_cards?: number
          home_score?: number
          home_yellow_cards?: number
          home_team_id: string
          id?: string
          location: string
          naipe?: Database["public"]["Enums"]["match_naipe"]
          sport_id: string
          start_time: string
          status?: Database["public"]["Enums"]["match_status"]
          supports_cards?: boolean
        }
        Update: {
          away_red_cards?: number
          away_score?: number
          away_yellow_cards?: number
          away_team_id?: string
          championship_id?: string
          created_at?: string
          division?: Database["public"]["Enums"]["team_division"] | null
          end_time?: string
          home_red_cards?: number
          home_score?: number
          home_yellow_cards?: number
          home_team_id?: string
          id?: string
          location?: string
          naipe?: Database["public"]["Enums"]["match_naipe"]
          sport_id?: string
          start_time?: string
          status?: Database["public"]["Enums"]["match_status"]
          supports_cards?: boolean
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
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
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
        ]
      }
      sports: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      standings: {
        Row: {
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
          sport_id: string
          team_id: string
          updated_at: string
          wins: number
          yellow_cards: number
        }
        Insert: {
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
          sport_id: string
          team_id: string
          updated_at?: string
          wins?: number
          yellow_cards?: number
        }
        Update: {
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
          sport_id?: string
          team_id?: string
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
          division: Database["public"]["Enums"]["team_division"]
          id: string
          name: string
        }
        Insert: {
          city?: string
          created_at?: string
          division?: Database["public"]["Enums"]["team_division"]
          id?: string
          name: string
        }
        Update: {
          city?: string
          created_at?: string
          division?: Database["public"]["Enums"]["team_division"]
          id?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin"
      championship_code: "CLV" | "SOCIETY" | "INTERLAJE"
      championship_sport_naipe_mode: "MISTO" | "MASCULINO_FEMININO"
      championship_sport_tie_breaker_rule: "STANDARD" | "POINTS_AVERAGE" | "BEACH_SOCCER" | "BEACH_TENNIS"
      championship_status: "PLANNING" | "UPCOMING" | "IN_PROGRESS" | "FINISHED"
      match_naipe: "MASCULINO" | "FEMININO" | "MISTO"
      match_status: "SCHEDULED" | "LIVE" | "FINISHED"
      team_division: "DIVISAO_PRINCIPAL" | "DIVISAO_ACESSO"
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
      app_role: ["admin"],
      championship_code: ["CLV", "SOCIETY", "INTERLAJE"],
      championship_sport_naipe_mode: ["MISTO", "MASCULINO_FEMININO"],
      championship_sport_tie_breaker_rule: ["STANDARD", "POINTS_AVERAGE", "BEACH_SOCCER", "BEACH_TENNIS"],
      championship_status: ["PLANNING", "UPCOMING", "IN_PROGRESS", "FINISHED"],
      match_naipe: ["MASCULINO", "FEMININO", "MISTO"],
      match_status: ["SCHEDULED", "LIVE", "FINISHED"],
      team_division: ["DIVISAO_PRINCIPAL", "DIVISAO_ACESSO"],
    },
  },
} as const
