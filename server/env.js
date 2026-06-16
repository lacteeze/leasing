import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

export function supabaseEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function isSupabaseConfigured() {
  const { url, key } = supabaseEnv();
  return !!(url && key);
}
