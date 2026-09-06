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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      audit_answers: {
        Row: {
          audit_id: string
          comment: string | null
          id: string
          is_na: boolean
          question_id: string
          score: number | null
          updated_at: string
        }
        Insert: {
          audit_id: string
          comment?: string | null
          id?: string
          is_na?: boolean
          question_id: string
          score?: number | null
          updated_at?: string
        }
        Update: {
          audit_id?: string
          comment?: string | null
          id?: string
          is_na?: boolean
          question_id?: string
          score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_answers_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_edit_logs: {
        Row: {
          action: string
          audit_id: string
          created_at: string
          detail: string
          id: string
          user_id: string
        }
        Insert: {
          action?: string
          audit_id: string
          created_at?: string
          detail?: string
          id?: string
          user_id?: string
        }
        Update: {
          action?: string
          audit_id?: string
          created_at?: string
          detail?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_edit_logs_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_general_deductions: {
        Row: {
          audit_id: string
          created_at: string
          id: string
          percentage: number
          reason_text: string
        }
        Insert: {
          audit_id: string
          created_at?: string
          id?: string
          percentage?: number
          reason_text?: string
        }
        Update: {
          audit_id?: string
          created_at?: string
          id?: string
          percentage?: number
          reason_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_general_deductions_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_section_deductions: {
        Row: {
          audit_id: string
          created_at: string
          id: string
          percentage: number
          reason_text: string
          section_id: string
        }
        Insert: {
          audit_id: string
          created_at?: string
          id?: string
          percentage?: number
          reason_text?: string
          section_id: string
        }
        Update: {
          audit_id?: string
          created_at?: string
          id?: string
          percentage?: number
          reason_text?: string
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_section_deductions_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_section_deductions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_section_status: {
        Row: {
          audit_id: string
          id: string
          is_na: boolean
          section_id: string
        }
        Insert: {
          audit_id: string
          id?: string
          is_na?: boolean
          section_id: string
        }
        Update: {
          audit_id?: string
          id?: string
          is_na?: boolean
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_section_status_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_section_status_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string
          id: string
          name_ar: string
          name_en: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string
          id?: string
          name_ar: string
          name_en: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string
          id?: string
          name_ar?: string
          name_en?: string
        }
        Relationships: []
      }
      audits: {
        Row: {
          audit_date: string
          audit_type_id: string
          auditor_id: string
          branch_id: string
          branch_manager: string | null
          created_at: string
          created_by: string
          edited_at: string | null
          id: string
          status: string
          submitted_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          audit_date?: string
          audit_type_id: string
          auditor_id: string
          branch_id: string
          branch_manager?: string | null
          created_at?: string
          created_by?: string
          edited_at?: string | null
          id?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          audit_date?: string
          audit_type_id?: string
          auditor_id?: string
          branch_id?: string
          branch_manager?: string | null
          created_at?: string
          created_by?: string
          edited_at?: string | null
          id?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "audits_audit_type_id_fkey"
            columns: ["audit_type_id"]
            isOneToOne: false
            referencedRelation: "audit_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audits_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name_ar: string
          name_en: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name_ar: string
          name_en?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string | null
        }
        Relationships: []
      }
      headers: {
        Row: {
          created_at: string
          id: string
          label_ar: string
          label_en: string | null
          order_index: number
          section_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label_ar: string
          label_en?: string | null
          order_index?: number
          section_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label_ar?: string
          label_en?: string | null
          order_index?: number
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "headers_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          audit_id: string
          created_at: string
          id: string
          question_id: string
          storage_path: string
        }
        Insert: {
          audit_id: string
          created_at?: string
          id?: string
          question_id: string
          storage_path: string
        }
        Update: {
          audit_id?: string
          created_at?: string
          id?: string
          question_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          full_name: string
          id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string
          id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          active: boolean
          audit_type_id: string
          created_at: string
          header_id: string | null
          id: string
          item_id: string
          item_order: number
          max_score: number
          requires_photo_if_below_max: boolean
          section_id: string
          text_ar: string
          text_en: string | null
        }
        Insert: {
          active?: boolean
          audit_type_id: string
          created_at?: string
          header_id?: string | null
          id?: string
          item_id: string
          item_order?: number
          max_score?: number
          requires_photo_if_below_max?: boolean
          section_id: string
          text_ar: string
          text_en?: string | null
        }
        Update: {
          active?: boolean
          audit_type_id?: string
          created_at?: string
          header_id?: string | null
          id?: string
          item_id?: string
          item_order?: number
          max_score?: number
          requires_photo_if_below_max?: boolean
          section_id?: string
          text_ar?: string
          text_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_audit_type_id_fkey"
            columns: ["audit_type_id"]
            isOneToOne: false
            referencedRelation: "audit_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_header_id_fkey"
            columns: ["header_id"]
            isOneToOne: false
            referencedRelation: "headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          audit_id: string
          docx_path: string | null
          generated_at: string
          id: string
          pdf_path: string | null
        }
        Insert: {
          audit_id: string
          docx_path?: string | null
          generated_at?: string
          id?: string
          pdf_path?: string | null
        }
        Update: {
          audit_id?: string
          docx_path?: string | null
          generated_at?: string
          id?: string
          pdf_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          active: boolean
          audit_type_id: string
          created_at: string
          id: string
          is_delivery: boolean
          name_ar: string
          name_en: string | null
          order_index: number
        }
        Insert: {
          active?: boolean
          audit_type_id: string
          created_at?: string
          id?: string
          is_delivery?: boolean
          name_ar: string
          name_en?: string | null
          order_index?: number
        }
        Update: {
          active?: boolean
          audit_type_id?: string
          created_at?: string
          id?: string
          is_delivery?: boolean
          name_ar?: string
          name_en?: string | null
          order_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "sections_audit_type_id_fkey"
            columns: ["audit_type_id"]
            isOneToOne: false
            referencedRelation: "audit_types"
            referencedColumns: ["id"]
          },
        ]
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
      can_edit_audit: { Args: { _audit_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "auditor"
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
      app_role: ["admin", "auditor"],
    },
  },
} as const
