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
  getOwnedListing,
  listingInsertPayload,
  listingUpdatePayload,
  mapListingRow,
  requireUser,
  updateListingPhotos,
  uploadListingPhoto,
} from "./listings.js";
import {
  fetchInquiries,
  inquiryInsertPayload,
  mapInquiryRow,
} from "./inquiries.js";
import { isEmailConfigured, sendViewingConfirmationEmail } from "./email.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith("image/"));
  },
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
app.use(express.json());

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
      return res.status(400).json({ error: "Only archived listings can be deleted." });
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
