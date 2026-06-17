import "./env.js";
import express from "express";
import path from "node:path";
import multer from "multer";
import { fileURLToPath } from "node:url";
import { isSupabaseConfigured, isGoogleMapsConfigured, googleMapsApiKey } from "./env.js";
import { createClient } from "../utils/supabase/server.js";
import { refreshSession } from "../utils/supabase/middleware.js";
import {
  fetchActiveListings,
  fetchManagerListings,
  fetchPropertyListings,
  getOwnedListing,
  listingInsertPayload,
  listingUpdatePayload,
  mapListingRow,
  requireUser,
  updateListingPhotos,
  uploadListingPhoto,
} from "./listings.js";
import {
  bulkInsertProperties,
  bulkTemplateCsv,
  decodeCsvBuffer,
  deleteAllOwnedProperties,
  fetchManagerProperties,
  fetchPropertyWithDetails,
  getOwnedProperty,
  mapPropertyRow,
  parseCsvText,
  previewBulkProperties,
  propertyInsertPayload,
  propertyUpdatePayload,
  normalizePropertyImages,
  setPropertyManagementStatus,
  setPropertyOccupancyStatus,
  updatePropertyPhotos,
  uploadPropertyPhoto,
} from "./properties.js";
import {
  archiveActiveListingForProperty,
  buildQuickLeaseBody,
  bulkInsertLeases,
  bulkLeaseTemplateCsv,
  fetchManagerLeases,
  fetchPropertyLeases,
  getOwnedLease,
  leaseInsertPayload,
  leaseUpdatePayload,
  mapLeaseRow,
  validateLeaseBody,
} from "./leases.js";
import {
  getPublishPrefill,
  publishListingFromProperty,
} from "./publish.js";
import {
  fetchInquiries,
  inquiryInsertPayload,
  mapInquiryRow,
} from "./inquiries.js";
import { isEmailConfigured, sendViewingConfirmationEmail } from "./email.js";
import {
  clearAuditLog,
  formatImportError,
  logAudit,
  readAuditLog,
} from "./audit.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith("image/"));
  },
});

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const staticDir = path.join(rootDir, "real-estate-platform-prototype", "project");
const port = Number(process.env.PORT) || 4173;
const baseUrl =
  process.env.AUTH_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${port}`);
const appPage = "/Canary%20Leasing.dc.html";

if (!isSupabaseConfigured()) {
  console.warn(
    "[auth] Supabase is not configured. Copy .env.example to .env.local and add your project keys."
  );
}

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "10mb" }));

app.use((req, res, next) => {
  if (!isSupabaseConfigured()) return next();
  return refreshSession(req, res, next);
});

function sessionUser(user) {
  if (!user) return null;
  return {
    user: {
      name:
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email,
      email: user.email,
      image:
        user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
    },
  };
}

app.get("/api/config", (_req, res) => {
  res.json({
    googleMapsApiKey: googleMapsApiKey() || null,
  });
});

app.get("/api/auth/session", async (req, res) => {
  if (!isSupabaseConfigured()) return res.json(null);

  try {
    const supabase = createClient(req, res);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    res.json(sessionUser(user));
  } catch (err) {
    console.error("[auth] session error:", err.message);
    res.json(null);
  }
});

app.get("/api/auth/providers", (_req, res) => {
  res.json({
    google: isSupabaseConfigured(),
    microsoft: false,
    email: isSupabaseConfigured(),
  });
});

app.post("/api/auth/signin", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }

  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const supabase = createClient(req, res);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email).trim(),
    password: String(password),
  });

  if (error || !data.user) {
    console.error("[auth] email signin error:", error?.message);
    return res.status(401).json({ error: "Invalid email or password." });
  }

  res.json(sessionUser(data.user));
});

app.get("/auth/google", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.redirect(`${appPage}?manager=signin&error=auth`);
  }

  const supabase = createClient(req, res);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${baseUrl}/auth/callback`,
    },
  });

  if (error || !data.url) {
    console.error("[auth] google oauth error:", error?.message);
    return res.redirect(`${appPage}?manager=signin&error=auth`);
  }

  res.redirect(data.url);
});

app.get("/auth/callback", async (req, res) => {
  const code = req.query.code;
  if (!code || !isSupabaseConfigured()) {
    return res.redirect(`${appPage}?manager=signin&error=auth`);
  }

  const supabase = createClient(req, res);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth] callback error:", error.message);
    return res.redirect(`${appPage}?manager=signin&error=auth`);
  }

  res.redirect(`${appPage}?manager=1`);
});

app.get("/auth/signout", async (req, res) => {
  if (isSupabaseConfigured()) {
    const supabase = createClient(req, res);
    await supabase.auth.signOut();
  }

  const callback = req.query.callbackUrl || "/";
  res.redirect(typeof callback === "string" ? callback : "/");
});

app.get("/api/listings", async (req, res) => {
  if (!isSupabaseConfigured()) return res.json([]);

  try {
    const supabase = createClient(req, res);
    const listings = await fetchActiveListings(supabase);
    res.json(listings);
  } catch (err) {
    if (err.code === "PGRST205" || /listings/.test(err.message)) {
      return res.json([]);
    }
    console.error("[listings] fetch error:", err.message);
    res.status(500).json({ error: "Could not load listings." });
  }
});

app.post("/api/listings/photos", upload.single("photo"), async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Storage is not configured." });
  }
  if (!req.file) {
    return res.status(400).json({ error: "Photo file is required." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const { path: storagePath, url } = await uploadListingPhoto(
      supabase,
      user.id,
      req.file
    );
    res.json({ url, path: storagePath });
  } catch (err) {
    console.error("[listings] upload error:", err.message);
    res.status(500).json({ error: "Photo upload failed." });
  }
});

app.get("/api/listings/mine", async (req, res) => {
  if (!isSupabaseConfigured()) return res.json([]);

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const listings = await fetchManagerListings(supabase, user.id);
    res.json(listings);
  } catch (err) {
    if (err.code === "PGRST205" || /listings/.test(err.message)) {
      return res.json([]);
    }
    console.error("[listings] manager fetch error:", err.message);
    res.status(500).json({ error: "Could not load your listings." });
  }
});

app.get("/api/listings/bulk/template.csv", (_req, res) => {
  res.redirect("/api/properties/bulk/template.csv");
});

app.get("/api/properties/mine", async (req, res) => {
  if (!isSupabaseConfigured()) return res.json([]);

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const properties = await fetchManagerProperties(supabase, user.id);
    res.json(properties);
  } catch (err) {
    if (err.code === "PGRST205" || /properties|leases/.test(err.message)) {
      return res.json([]);
    }
    console.error("[properties] manager fetch error:", err.message);
    res.status(500).json({ error: "Could not load your properties." });
  }
});

app.get("/api/properties/:id", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const property = await fetchPropertyWithDetails(
      supabase,
      user.id,
      req.params.id
    );
    res.json(property);
  } catch (err) {
    console.error("[properties] fetch error:", err.message);
    res.status(404).json({ error: "Property not found." });
  }
});

app.post("/api/properties", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const body = req.body ?? {};
    if (!body.title?.trim()) {
      return res.status(400).json({ error: "Title is required." });
    }

    const payload = propertyInsertPayload(body, user.id);
    const { data: property, error } = await supabase
      .from("properties")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    const images = normalizePropertyImages(body.images);
    if (images.length) {
      await updatePropertyPhotos(supabase, property.id, images);
    }

    const saved = await fetchPropertyWithDetails(
      supabase,
      user.id,
      property.id
    );
    res.status(201).json(saved);
  } catch (err) {
    console.error("[properties] create error:", err.message);
    res.status(500).json({ error: "Could not create property." });
  }
});

app.patch("/api/properties/:id", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const propertyId = req.params.id;
    await getOwnedProperty(supabase, user.id, propertyId);

    const body = req.body ?? {};
    const payload = propertyUpdatePayload(body);
    if (Object.keys(payload).length <= 1) {
      return res.status(400).json({ error: "No updates provided." });
    }

    const { error } = await supabase
      .from("properties")
      .update(payload)
      .eq("id", propertyId)
      .eq("created_by", user.id);

    if (error) throw error;

    if (Array.isArray(body.images)) {
      await updatePropertyPhotos(
        supabase,
        propertyId,
        normalizePropertyImages(body.images)
      );
    }

    const saved = await fetchPropertyWithDetails(
      supabase,
      user.id,
      propertyId
    );
    res.json(saved);
  } catch (err) {
    console.error("[properties] update error:", err.message);
    const msg = err.message || "Could not update property.";
    if (/management_status/i.test(msg)) {
      return res.status(400).json({
        error:
          "Run supabase/properties-management-status.sql in the Supabase SQL Editor, then try again.",
      });
    }
    if (/occupancy_status/i.test(msg)) {
      return res.status(400).json({
        error:
          "Run supabase/properties-occupancy-status.sql in the Supabase SQL Editor, then run properties-occupancy-status-free-text.sql for custom statuses.",
      });
    }
    if (/property_id/i.test(msg) && /listings/i.test(msg)) {
      return res.status(400).json({
        error:
          "Run supabase/listings-property-link.sql in the Supabase SQL Editor, then try again.",
      });
    }
    if (/baths|integer/i.test(msg)) {
      return res.status(400).json({
        error:
          "Run supabase/properties-beds-baths-numeric.sql in the Supabase SQL Editor to allow half-bath values (e.g. 1.5).",
      });
    }
    if (/property_photos/i.test(msg)) {
      return res.status(400).json({
        error:
          "Run supabase/properties.sql in the Supabase SQL Editor to create the property_photos table.",
      });
    }
    res.status(400).json({ error: msg });
  }
});

app.post("/api/properties/:id/archive", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const saved = await setPropertyManagementStatus(
      supabase,
      user.id,
      req.params.id,
      "ARCHIVED"
    );
    res.json(saved);
  } catch (err) {
    console.error("[properties] archive error:", err.message);
    const msg = err.message?.includes("management_status")
      ? "Run supabase/properties-management-status.sql in the Supabase SQL Editor, then try again."
      : "Could not archive property.";
    res.status(500).json({ error: msg });
  }
});

app.post("/api/properties/:id/restore", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const saved = await setPropertyManagementStatus(
      supabase,
      user.id,
      req.params.id,
      "ACTIVE"
    );
    res.json(saved);
  } catch (err) {
    console.error("[properties] restore error:", err.message);
    const msg = err.message?.includes("management_status")
      ? "Run supabase/properties-management-status.sql in the Supabase SQL Editor, then try again."
      : "Could not restore property.";
    res.status(500).json({ error: msg });
  }
});

app.post("/api/properties/:id/set-occupancy-status", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const status = String(req.body?.status || "").trim();
    if (!status || status.length > 64 || !/^[a-z0-9_]+$/i.test(status)) {
      return res.status(400).json({ error: "Invalid occupancy status." });
    }

    const saved = await setPropertyOccupancyStatus(
      supabase,
      user.id,
      req.params.id,
      status
    );
    res.json(saved);
  } catch (err) {
    console.error("[properties] set-occupancy-status error:", err.message);
    const msg = err.message?.includes("occupancy_status")
      ? "Run supabase/properties-occupancy-status.sql in the Supabase SQL Editor, then run properties-occupancy-status-free-text.sql for custom statuses."
      : "Could not update occupancy status.";
    res.status(500).json({ error: msg });
  }
});

app.post("/api/properties/:id/mark-short-term", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const saved = await setPropertyOccupancyStatus(
      supabase,
      user.id,
      req.params.id,
      "short_term"
    );
    res.json(saved);
  } catch (err) {
    console.error("[properties] mark-short-term error:", err.message);
    const msg = err.message?.includes("occupancy_status")
      ? "Run supabase/properties-occupancy-status.sql in the Supabase SQL Editor, then try again."
      : "Could not mark property as short term.";
    res.status(500).json({ error: msg });
  }
});

app.post("/api/properties/:id/mark-standard-occupancy", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const saved = await setPropertyOccupancyStatus(
      supabase,
      user.id,
      req.params.id,
      "standard"
    );
    res.json(saved);
  } catch (err) {
    console.error("[properties] mark-standard-occupancy error:", err.message);
    const msg = err.message?.includes("occupancy_status")
      ? "Run supabase/properties-occupancy-status.sql in the Supabase SQL Editor, then try again."
      : "Could not update occupancy mode.";
    res.status(500).json({ error: msg });
  }
});

app.delete("/api/properties/mine/all", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const result = await deleteAllOwnedProperties(supabase, user.id);
    res.json(result);
  } catch (err) {
    console.error("[properties] delete-all error:", err.message);
    res.status(500).json({ error: "Could not delete properties." });
  }
});

app.delete("/api/properties/:id", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const propertyId = req.params.id;
    await getOwnedProperty(supabase, user.id, propertyId);

    const { error } = await supabase
      .from("properties")
      .delete()
      .eq("id", propertyId)
      .eq("created_by", user.id);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("[properties] delete error:", err.message);
    res.status(500).json({ error: "Could not delete property." });
  }
});

app.post("/api/properties/photos", upload.single("photo"), async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Storage is not configured." });
  }
  if (!req.file) {
    return res.status(400).json({ error: "Photo file is required." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const { path: storagePath, url } = await uploadPropertyPhoto(
      supabase,
      user.id,
      req.file
    );
    res.json({ url, path: storagePath });
  } catch (err) {
    console.error("[properties] upload error:", err.message);
    res.status(500).json({ error: "Photo upload failed." });
  }
});

app.get("/api/properties/bulk/template.csv", (_req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=properties-bulk-template.csv"
  );
  res.send(bulkTemplateCsv());
});

app.get("/api/audit/mine", async (req, res) => {
  if (!isSupabaseConfigured()) return res.json([]);

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const limit = Math.min(Number(req.query.limit) || 100, 200);
    res.json(readAuditLog(user.id, { limit }));
  } catch (err) {
    console.error("[audit] read error:", err.message);
    res.status(500).json({ error: "Could not load audit log." });
  }
});

app.delete("/api/audit/mine", async (req, res) => {
  if (!isSupabaseConfigured()) return res.json({ cleared: true });

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    clearAuditLog(user.id);
    res.json({ cleared: true });
  } catch (err) {
    console.error("[audit] clear error:", err.message);
    res.status(500).json({ error: "Could not clear audit log." });
  }
});

app.post("/api/audit/mine", async (req, res) => {
  if (!isSupabaseConfigured()) return res.status(503).json({ error: "Database is not configured." });

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const { level = "info", action = "app", source = "client", message, details = null } =
      req.body || {};
    if (!message) return res.status(400).json({ error: "message is required." });

    const entry = logAudit({
      userId: user.id,
      level,
      action,
      source,
      message: String(message),
      details,
    });
    res.status(201).json(entry);
  } catch (err) {
    console.error("[audit] write error:", err.message);
    res.status(500).json({ error: "Could not write audit log." });
  }
});

app.post("/api/properties/bulk/preview", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const csv = typeof req.body?.csv === "string" ? req.body.csv : "";
    if (!csv.trim()) {
      return res.status(400).json({ error: "CSV text is required." });
    }

    const preview = previewBulkProperties(csv);
    if (!preview.total) {
      return res.status(400).json({
        error:
          "No data rows found in upload. Keep the header row plus one row per property.",
        ...preview,
      });
    }

    res.json(preview);
  } catch (err) {
    console.error("[properties] bulk preview error:", err.message);
    res.status(500).json({ error: "Could not preview CSV." });
  }
});

app.post("/api/properties/bulk", csvUpload.single("file"), async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    let rawRows = [];
    if (typeof req.body?.csv === "string" && req.body.csv.trim()) {
      rawRows = parseCsvText(req.body.csv);
    } else if (req.file?.buffer) {
      const decoded = decodeCsvBuffer(req.file.buffer);
      if (decoded === null) {
        return res.status(400).json({
          error:
            "This file looks like an Excel workbook (.xlsx). In Excel use File → Save As → CSV UTF-8, then upload that file.",
        });
      }
      rawRows = parseCsvText(decoded);
    } else if (Array.isArray(req.body?.rows)) {
      rawRows = req.body.rows;
    } else {
      return res.status(400).json({ error: "CSV file or JSON rows are required." });
    }

    if (!rawRows.length) {
      const bytes = req.file?.size ?? req.body?.csv?.length ?? 0;
      return res.status(400).json({
        error:
          bytes > 0
            ? `No data rows found (${bytes} bytes received). Save as CSV UTF-8 from Excel — not .xlsx — and keep the header row plus one row per property.`
            : "No data rows found in upload.",
      });
    }

    const result = await bulkInsertProperties(supabase, user.id, rawRows);
    const isBatchPart = !!req.body?.batchImport;

    if (!isBatchPart) {
      for (const errRow of result.errors || []) {
        logAudit({
          userId: user.id,
          level: "error",
          action: "bulk_property_import",
          source: "properties/bulk",
          message: `Row ${errRow.row}: ${errRow.message}`,
          details: errRow,
        });
      }
      if (result.imported?.length) {
        logAudit({
          userId: user.id,
          level: "info",
          action: "bulk_property_import",
          source: "properties/bulk",
          message: `Imported ${result.imported.length} of ${result.total ?? rawRows.length} properties`,
          details: {
            imported: result.imported.length,
            failed: result.errors?.length || 0,
            total: result.total ?? rawRows.length,
          },
        });
      } else if (result.errors?.length) {
        logAudit({
          userId: user.id,
          level: "error",
          action: "bulk_property_import",
          source: "properties/bulk",
          message: `Bulk import failed — ${result.errors.length} row(s) had errors`,
          details: { errors: result.errors.slice(0, 10) },
        });
      }
    }

    res.status(result.errors.length && !result.imported.length ? 400 : 201).json(
      result
    );
  } catch (err) {
    const message = formatImportError(err);
    console.error("[properties] bulk import error:", message);
    try {
      const supabase = createClient(req, res);
      const user = await requireUser(supabase);
      if (user) {
        logAudit({
          userId: user.id,
          level: "error",
          action: "bulk_property_import",
          source: "properties/bulk",
          message,
          details: { stack: err?.stack },
        });
      }
    } catch (_) {}
    res.status(500).json({ error: message || "Bulk import failed." });
  }
});

app.get("/api/leases/mine", async (req, res) => {
  if (!isSupabaseConfigured()) return res.json([]);

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const leases = await fetchManagerLeases(supabase, user.id);
    res.json(leases);
  } catch (err) {
    console.error("[leases] list mine error:", err.message);
    res.status(500).json({ error: "Could not load leases." });
  }
});

app.get("/api/leases/bulk/template.csv", (_req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=leases-bulk-template.csv"
  );
  res.send(bulkLeaseTemplateCsv());
});

app.post("/api/leases/bulk", csvUpload.single("file"), async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    let rawRows = [];
    if (typeof req.body?.csv === "string" && req.body.csv.trim()) {
      rawRows = parseCsvText(req.body.csv);
    } else if (req.file?.buffer) {
      const decoded = decodeCsvBuffer(req.file.buffer);
      if (decoded === null) {
        return res.status(400).json({
          error:
            "This file looks like an Excel workbook (.xlsx). Save as CSV UTF-8 and upload again.",
        });
      }
      rawRows = parseCsvText(decoded);
    } else if (Array.isArray(req.body?.rows)) {
      rawRows = req.body.rows;
    } else {
      return res.status(400).json({ error: "CSV file or JSON rows are required." });
    }

    if (!rawRows.length) {
      return res.status(400).json({ error: "No data rows found in upload." });
    }

    const result = await bulkInsertLeases(supabase, user.id, rawRows);
    res.status(result.errors.length && !result.imported.length ? 400 : 201).json(
      result
    );
  } catch (err) {
    console.error("[leases] bulk import error:", err.message);
    res.status(500).json({ error: "Bulk import failed." });
  }
});

app.get("/api/properties/:id/leases", async (req, res) => {
  if (!isSupabaseConfigured()) return res.json([]);

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    await getOwnedProperty(supabase, user.id, req.params.id);
    const leases = await fetchPropertyLeases(supabase, req.params.id);
    res.json(leases);
  } catch (err) {
    console.error("[leases] list error:", err.message);
    res.status(500).json({ error: "Could not load leases." });
  }
});

app.post("/api/properties/:id/leases/quick", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const propertyId = req.params.id;
    const property = await getOwnedProperty(supabase, user.id, propertyId);

    const { data: existing } = await supabase
      .from("leases")
      .select("id")
      .eq("property_id", propertyId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (existing) {
      return res.status(400).json({
        error: "This property already has an active lease. End it before adding another.",
      });
    }

    const renewalStatus =
      req.body?.renewalStatus === "RENEWING"
        ? "RENEWING"
        : req.body?.renewalStatus === "NOT_RENEWING"
          ? "NOT_RENEWING"
          : "UNKNOWN";
    const body = buildQuickLeaseBody(property, { renewalStatus });
    validateLeaseBody(body, { requireTenant: false });

    const payload = leaseInsertPayload(body, user.id, propertyId);
    const { data: lease, error } = await supabase
      .from("leases")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    if (renewalStatus === "RENEWING") {
      await archiveActiveListingForProperty(supabase, propertyId);
    }

    res.status(201).json(mapLeaseRow(lease));
  } catch (err) {
    console.error("[leases] quick create error:", err.message);
    res.status(400).json({ error: err.message || "Could not create lease." });
  }
});

app.post("/api/properties/:id/leases", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const propertyId = req.params.id;
    await getOwnedProperty(supabase, user.id, propertyId);

    const body = req.body ?? {};
    validateLeaseBody(body);

    const { data: existing } = await supabase
      .from("leases")
      .select("id")
      .eq("property_id", propertyId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (existing) {
      return res.status(400).json({
        error: "This property already has an active lease. End it before adding another.",
      });
    }

    const payload = leaseInsertPayload(body, user.id, propertyId);
    const { data: lease, error } = await supabase
      .from("leases")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    if (body.renewalStatus === "RENEWING") {
      await archiveActiveListingForProperty(supabase, propertyId);
    }

    res.status(201).json(mapLeaseRow(lease));
  } catch (err) {
    console.error("[leases] create error:", err.message);
    res.status(400).json({ error: err.message || "Could not create lease." });
  }
});

app.patch("/api/leases/:id", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const lease = await getOwnedLease(supabase, user.id, req.params.id);
    const body = req.body ?? {};

    if (body.monthlyRate || body.startDate || body.endDate || body.tenantName) {
      validateLeaseBody({
        tenantName: body.tenantName || lease.tenant_name,
        monthlyRate: body.monthlyRate ?? lease.monthly_rate,
        startDate: body.startDate || lease.start_date,
        endDate: body.endDate || lease.end_date,
        renewalStatus: body.renewalStatus,
        status: body.status,
      });
    }

    const payload = leaseUpdatePayload(body);
    if (Object.keys(payload).length <= 1) {
      return res.status(400).json({ error: "No updates provided." });
    }

    const { data: updated, error } = await supabase
      .from("leases")
      .update(payload)
      .eq("id", req.params.id)
      .select("*")
      .single();

    if (error) throw error;

    if (updated.renewal_status === "RENEWING" && updated.status === "ACTIVE") {
      await archiveActiveListingForProperty(supabase, updated.property_id);
    }

    res.json(mapLeaseRow(updated));
  } catch (err) {
    console.error("[leases] update error:", err.message);
    res.status(400).json({ error: err.message || "Could not update lease." });
  }
});

app.get("/api/properties/:id/publish-prefill", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const data = await getPublishPrefill(supabase, user.id, req.params.id);
    res.json(data);
  } catch (err) {
    console.error("[publish] prefill error:", err.message);
    res.status(400).json({ error: err.message || "Could not load prefill." });
  }
});

app.get("/api/properties/:id/listings", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const listings = await fetchPropertyListings(
      supabase,
      user.id,
      req.params.id
    );
    res.json(listings);
  } catch (err) {
    console.error("[listings] property fetch error:", err.message);
    res.status(400).json({ error: err.message || "Could not load listings." });
  }
});

app.post("/api/listings/publish", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const { propertyId, ...overrides } = req.body ?? {};
    if (!propertyId) {
      return res.status(400).json({ error: "propertyId is required." });
    }

    const listing = await publishListingFromProperty(
      supabase,
      user.id,
      propertyId,
      overrides
    );
    res.status(201).json(listing);
  } catch (err) {
    console.error("[publish] error:", err.message);
    res.status(400).json({ error: err.message || "Could not publish listing." });
  }
});

app.patch("/api/listings/:id", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const listingId = req.params.id;
    await getOwnedListing(supabase, user.id, listingId);

    const body = req.body ?? {};
    const payload = listingUpdatePayload(body);
    if (Object.keys(payload).length <= 1) {
      return res.status(400).json({ error: "No updates provided." });
    }

    const { data: listing, error } = await supabase
      .from("listings")
      .update(payload)
      .eq("id", listingId)
      .eq("created_by", user.id)
      .select("*")
      .single();

    if (error) throw error;

    if (Array.isArray(body.images)) {
      await updateListingPhotos(supabase, listingId, body.images);
    }

    const { data: photos } = await supabase
      .from("listing_photos")
      .select("*")
      .eq("listing_id", listingId)
      .order("sort_order", { ascending: true });

    res.json(mapListingRow(listing, photos || []));
  } catch (err) {
    console.error("[listings] update error:", err.message);
    res.status(500).json({ error: "Could not update listing." });
  }
});

app.delete("/api/listings/:id", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const listingId = req.params.id;
    const owned = await getOwnedListing(supabase, user.id, listingId);

    if (owned.status !== "ARCHIVED") {
      return res.status(400).json({
        error: "Only archived listings can be deleted.",
      });
    }

    const { error } = await supabase
      .from("listings")
      .delete()
      .eq("id", listingId)
      .eq("created_by", user.id);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("[listings] delete error:", err.message);
    res.status(500).json({ error: "Could not delete listing." });
  }
});

app.post("/api/listings", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const body = req.body ?? {};
    if (!body.title?.trim()) {
      return res.status(400).json({ error: "Title is required." });
    }

    const payload = listingInsertPayload(body, user.id);
    const { data: listing, error } = await supabase
      .from("listings")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    const images = Array.isArray(body.images) ? body.images : [];
    if (images.length) {
      const photoRows = images.map((img, i) => ({
        listing_id: listing.id,
        storage_path: img.path || img.url,
        public_url: img.url,
        sort_order: i,
      }));
      const { error: photoError } = await supabase
        .from("listing_photos")
        .insert(photoRows);
      if (photoError) throw photoError;
    }

    const { data: photos } = await supabase
      .from("listing_photos")
      .select("*")
      .eq("listing_id", listing.id)
      .order("sort_order", { ascending: true });

    res.status(201).json(mapListingRow(listing, photos || []));
  } catch (err) {
    console.error("[listings] create error:", err.message);
    res.status(500).json({ error: "Could not publish listing." });
  }
});

app.post("/api/inquiries", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  const body = req.body ?? {};
  if (!body.firstName?.trim() || !body.lastName?.trim()) {
    return res.status(400).json({ error: "First and last name are required." });
  }
  if (!body.email?.trim() || !body.phone?.trim()) {
    return res.status(400).json({ error: "Email and phone are required." });
  }

  try {
    const supabase = createClient(req, res);
    const payload = inquiryInsertPayload(body);
    const { data, error } = await supabase
      .from("inquiries")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    const inquiry = mapInquiryRow(data);
    try {
      await sendViewingConfirmationEmail(data);
    } catch (emailErr) {
      console.error("[email] confirmation failed:", emailErr.message);
    }

    res.status(201).json(inquiry);
  } catch (err) {
    console.error("[inquiries] create error:", err.message);
    res.status(500).json({ error: "Could not submit inquiry." });
  }
});

app.get("/api/inquiries", async (req, res) => {
  if (!isSupabaseConfigured()) return res.json([]);

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const inquiries = await fetchInquiries(supabase);
    res.json(inquiries);
  } catch (err) {
    if (err.code === "PGRST205" || /inquiries/.test(err.message)) {
      return res.json([]);
    }
    console.error("[inquiries] fetch error:", err.message);
    res.status(500).json({ error: "Could not load inquiries." });
  }
});

app.patch("/api/inquiries/:id", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  try {
    const supabase = createClient(req, res);
    const user = await requireUser(supabase);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const updates = {};
    if (req.body?.status) updates.status = req.body.status;
    if (req.body?.notes) updates.notes = req.body.notes;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("inquiries")
      .update(updates)
      .eq("id", req.params.id)
      .select("*")
      .single();

    if (error) throw error;
    res.json(mapInquiryRow(data));
  } catch (err) {
    console.error("[inquiries] update error:", err.message);
    res.status(500).json({ error: "Could not update inquiry." });
  }
});

app.get("/", (_req, res) => {
  res.redirect(appPage);
});

app.use("/Open_Sans", express.static(path.join(rootDir, "Open_Sans")));
app.use(express.static(staticDir));

export default app;

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Canary preview: http://localhost:${port}${appPage}`);
    console.log(
      isSupabaseConfigured()
        ? "Auth: Supabase (Google OAuth via Supabase dashboard)"
        : "Auth: not configured (see .env.local)"
    );
    console.log(
      isEmailConfigured()
        ? "Email: Pingram confirmation emails enabled"
        : "Email: not configured (see .env.example)"
    );
    console.log(
      isGoogleMapsConfigured()
        ? "Maps: Google Places autocomplete enabled"
        : "Maps: not configured (set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)"
    );
  });
}
