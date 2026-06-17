import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, "..", "data");
const LOG_FILE = path.join(LOG_DIR, "audit-log.jsonl");
const MAX_READ_BYTES = 512 * 1024;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

export function formatImportError(err) {
  const msg = String(err?.message || err || "Import failed");
  const code = err?.code || "";
  const details = err?.details || err?.hint || "";

  if (
    (msg.includes("property_code") && msg.includes("does not exist")) ||
    code === "42703"
  ) {
    return "Missing property_code column — run supabase/properties-property-code.sql in Supabase.";
  }
  if (
    (msg.includes("properties") && msg.includes("does not exist")) ||
    code === "42P01"
  ) {
    return "Properties table missing — run supabase/properties.sql in Supabase.";
  }
  if (
    (msg.includes("occupancy_status") &&
      (msg.includes("check constraint") || msg.includes("violates check"))) ||
    (code === "23514" && msg.includes("occupancy_status"))
  ) {
    return "Custom status blocked — run supabase/properties-occupancy-status-free-text.sql in Supabase.";
  }
  if (
    msg.includes("properties_owner_property_code_idx") ||
    (code === "23505" && msg.includes("property_code"))
  ) {
    return "Duplicate property_id — this Property ID already exists in your portfolio.";
  }
  if (code === "23505") {
    return "Duplicate record — a row with these values already exists.";
  }
  if (
    code === "22P02" &&
    (msg.includes("integer") || msg.includes("numeric")) &&
    /\d+\.\d+/.test(msg)
  ) {
    return "Half-bath values like 1.5 require a DB update — run supabase/properties-beds-baths-numeric.sql in Supabase.";
  }
  if (msg.includes("leases") && msg.includes("does not exist")) {
    return "Leases table missing — run supabase/leases.sql in Supabase.";
  }
  if (msg.includes("JWT") || msg.includes("sign in")) {
    return "Sign in required — refresh the page and try again.";
  }
  if (details && !msg.includes(details)) {
    return `${msg} (${details})`;
  }
  return msg;
}

export function logAudit({
  userId = null,
  level = "info",
  action,
  source = "app",
  message,
  details = null,
}) {
  ensureLogDir();
  const entry = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    userId,
    level,
    action,
    source,
    message: String(message || ""),
    details,
  };
  fs.appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

export function readAuditLog(userId, { limit = 100 } = {}) {
  ensureLogDir();
  if (!fs.existsSync(LOG_FILE)) return [];

  const raw = fs.readFileSync(LOG_FILE, "utf8");
  const tail =
    raw.length > MAX_READ_BYTES ? raw.slice(raw.length - MAX_READ_BYTES) : raw;
  const lines = tail.split("\n").filter(Boolean);
  const entries = [];

  for (let i = lines.length - 1; i >= 0 && entries.length < limit * 3; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      if (userId && entry.userId && entry.userId !== userId) continue;
      entries.push(entry);
    } catch {
      // skip corrupt lines
    }
  }

  return entries.slice(0, limit);
}

export function clearAuditLog(userId) {
  ensureLogDir();
  if (!fs.existsSync(LOG_FILE)) return { cleared: 0 };

  const raw = fs.readFileSync(LOG_FILE, "utf8");
  const kept = raw
    .split("\n")
    .filter(Boolean)
    .filter((line) => {
      try {
        const entry = JSON.parse(line);
        return entry.userId && entry.userId !== userId;
      } catch {
        return true;
      }
    });

  fs.writeFileSync(
    LOG_FILE,
    kept.length ? `${kept.join("\n")}\n` : "",
    "utf8"
  );
  return { cleared: true };
}
