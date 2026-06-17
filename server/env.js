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

export function supabaseServiceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ""
  );
}

export function isServiceRoleConfigured() {
  const { url } = supabaseEnv();
  return !!(url && supabaseServiceRoleKey());
}

export function googleMapsApiKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
}

export function isGoogleMapsConfigured() {
  return !!googleMapsApiKey();
}
