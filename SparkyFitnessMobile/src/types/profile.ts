export interface UserProfile {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  date_of_birth: string | null;
  bio: string | null;
  avatar_url: string | null;
  gender: 'male' | 'female' | null;
  /** A NUMERIC(5,2) column, so node-postgres serializes it as a numeric string. */
  target_weight: string | number | null;
  /** YYYY-MM-DD day to reach the goal weight; absent from older servers. */
  target_weight_date?: string | null;
  /**
   * Body fat goal in percent, a NUMERIC(4,1) column (so a string). Optional:
   * a server from before the body fat goal does not send it.
   */
  target_body_fat_percentage?: string | number | null;
}
