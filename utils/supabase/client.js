import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "../../server/env.js";

export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key);
}
