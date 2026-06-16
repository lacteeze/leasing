import { createClient } from "./server.js";

/** Refresh the Supabase session on each request (Express equivalent of Next middleware). */
export async function refreshSession(req, res, next) {
  const supabase = createClient(req, res);
  await supabase.auth.getUser();
  next();
}
