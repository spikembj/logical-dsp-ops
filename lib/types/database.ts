/**
 * Database types — hand-written for now to match supabase/migrations/0001_init.sql.
 *
 * Once the migration has been run against the cloud project, regenerate this
 * file with the Supabase CLI for full type safety on every query:
 *
 *   npx supabase gen types typescript \
 *     --project-id oaufkjqtjecffpkcwewp \
 *     --schema public > lib/types/database.ts
 *
 * Until then, this minimal shape is enough for middleware + auth helpers.
 */

export type UserRole =
  | "owner"
  | "hr"
  | "ops_manager"
  | "dispatcher"
  // Legacy values kept in the Postgres enum for compat. New rows should
  // never use these — the management-roles migration migrated all existing
  // 'admin' -> 'owner' and 'manager' -> 'ops_manager'.
  | "admin"
  | "manager";

/**
 * Roles that have management-tier write access (everything except dispatcher).
 * Owner, HR, and Ops Manager are functionally identical permission-wise — the
 * label is for org clarity. Legacy admin/manager values are included for
 * defense in depth in case any old row slipped past the migration.
 */
export const MANAGEMENT_ROLES: UserRole[] = [
  "owner",
  "hr",
  "ops_manager",
  "admin",
  "manager",
];

export function isManagement(role: UserRole | null | undefined): boolean {
  return !!role && (MANAGEMENT_ROLES as string[]).includes(role);
}
export type DriverStatus = "active" | "loa" | "terminated" | "inactive";
export type VehicleType = "cdv" | "edv" | "standard_parcel";
export type DriverPosition = "driver" | "helper";
export type Tier =
  | "fantastic_plus"
  | "fantastic"
  | "great"
  | "fair"
  | "poor"
  | "platinum"
  | "gold"
  | "silver"
  | "bronze";
export type Severity = "impacting" | "non_impacting";
export type ImportType = "scorecard" | "netradyne";
export type CoachingSessionType =
  | "discussion"
  | "verbal_warning"
  | "write_up"
  | "final_warning"
  | "termination";

export interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  active: boolean;
  created_at: string;
  /** Optional FK to drivers — for dispatchers who also drive routes. */
  driver_id: string | null;
}

export interface DriverRow {
  id: string;
  /**
   * Amazon's short transporter ID (A-prefixed). Nullable: a driver may exist
   * before they ever appear in a scorecard import that gives us the ID.
   */
  transporter_id: string | null;
  full_name: string;
  hire_date: string | null;
  status: DriverStatus;
  /** "driver" (default) or "helper" — helpers ride along but don't drive. */
  position: DriverPosition;
  approved_vehicle_types: VehicleType[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: Omit<UserRow, "created_at"> & { created_at?: string };
        Update: Partial<Omit<UserRow, "id">>;
      };
      drivers: {
        Row: DriverRow;
        Insert: Omit<DriverRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<DriverRow, "id">>;
      };
    };
    Enums: {
      user_role: UserRole;
      driver_status: DriverStatus;
      vehicle_type: VehicleType;
      driver_position: DriverPosition;
      tier: Tier;
      severity: Severity;
      import_type: ImportType;
      coaching_session_type: CoachingSessionType;
    };
  };
}
