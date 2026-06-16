import { createServerClient } from "@supabase/ssr";
import { parse, serialize } from "cookie";
import { supabaseEnv } from "../../server/env.js";

export function createClient(req, res) {
  const { url, key } = supabaseEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        const parsed = parse(req.headers.cookie ?? "");
        return Object.entries(parsed).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        const existing = res.getHeader("Set-Cookie");
        const serialized = cookiesToSet.map(({ name, value, options }) =>
          serialize(name, value, options)
        );

        if (existing) {
          const prior = Array.isArray(existing) ? existing : [existing];
          res.setHeader("Set-Cookie", [...prior, ...serialized]);
        } else {
          res.setHeader("Set-Cookie", serialized);
        }
      },
    },
  });
}
