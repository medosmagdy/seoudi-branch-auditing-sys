import type { Database } from "./types";

// Frontend contracts for existing features absent from the older generated file.
// Types only: this neither creates tables nor changes database enum values/RLS.
export type AppRole = "admin" | "manager" | "auditor";
export type TrackingStatus = "not_started" | "in_progress" | "completed";
export type TrackingRecord = {
  id: string;
  branch_id: string;
  branch_name: string;
  tracking_month: string;
  fs_status: TrackingStatus;
  ghp_status: TrackingStatus;
  fsms_status: TrackingStatus;
  fs_updated_at?: string | null;
  ghp_updated_at?: string | null;
  fsms_updated_at?: string | null;
  updated_at: string;
};
export type ExpiryRecordRow = {
  id: string;
  expiry_date: string;
  branch_id: string;
  section: string;
  product_name: string;
  expiry_state: string;
  deduction_percentage: number;
  deduction_scope: string;
  deduction_reason: string | null;
  quantity: number | null;
  notes: string | null;
  created_by: string;
  review_status: "pending" | "reviewed";
  created_at: string;
};
type ClientTable<Row, Required extends keyof Row = never> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>;
  Update: Partial<Row>;
  Relationships: [];
};
type UserRoleTable = Database["public"]["Tables"]["user_roles"];
type RoleColumn<T> = Omit<T, "role"> & { role: AppRole };
export type AppDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Enums" | "Functions"> & {
    Tables: Omit<Database["public"]["Tables"], "user_roles"> & {
      user_roles: Omit<UserRoleTable, "Row" | "Insert" | "Update"> & {
        Row: RoleColumn<UserRoleTable["Row"]>;
        Insert: RoleColumn<UserRoleTable["Insert"]>;
        Update: Omit<UserRoleTable["Update"], "role"> & { role?: AppRole };
      };
      monthly_branch_tracking: ClientTable<
        TrackingRecord,
        "branch_id" | "branch_name" | "tracking_month"
      >;
      expiry_records: ClientTable<
        ExpiryRecordRow,
        "expiry_date" | "branch_id" | "section" | "product_name" | "expiry_state" | "created_by"
      >;
      expiry_record_images: ClientTable<
        { id: string; expiry_record_id: string; storage_path: string; created_at: string },
        "expiry_record_id" | "storage_path"
      >;
    };
    Enums: Omit<Database["public"]["Enums"], "app_role"> & { app_role: AppRole };
    Functions: Database["public"]["Functions"] & {
      delete_user_completely: { Args: { target_user_id: string }; Returns: undefined };
    };
  };
};
