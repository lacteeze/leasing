import { createClient } from "@supabase/supabase-js";
import { supabaseEnv, supabaseServiceRoleKey } from "../../server/env.js";

/** Server-only Supabase client that bypasses RLS (use only after requireUser). */
export function createAdminClient() {
  const { url } = supabaseEnv();
  const key = supabaseServiceRoleKey();
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
