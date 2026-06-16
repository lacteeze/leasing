const PHOTO_BUCKET = "listing-photos";

export function mapListingRow(row, photos = []) {
  const images = photos
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => p.public_url);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    type: row.type,
    area: row.area || row.city || "",
    city: row.city || "",
    province: row.province || "NL",
    postal: row.postal || "",
    rate: Number(row.rate) || 0,
    cleaning: Number(row.cleaning) || 0,
    beds: row.beds || 0,
    baths: row.baths || 0,
    sqft: row.sqft || 0,
    status: row.status,
    features: row.features || [],
    images,
    description: row.description || "",
    parking: row.parking || 0,
    petFriendly: !!row.pet_friendly,
    dogs: !!row.dogs,
    cats: !!row.cats,
    utilitiesIncluded: !!row.utilities_included,
    utilityTypes: row.utility_types || [],
    utilityCap: row.utility_cap || 0,
    yearBuilt: row.year_built || 0,
    storeys: row.storeys || 0,
    heatingType: row.heating_type || "",
    waterHeater: row.water_heater || "",
    firewall: !!row.firewall,
    powerMeter: row.power_meter || "",
    oilCompany: row.oil_company || "",
    internalNotes: row.internal_notes || "",
    fromDb: true,
  };
}

export function listingInsertPayload(body, userId) {
  return {
    slug: body.slug,
    title: body.title,
    type: body.type,
    area: body.area,
    city: body.city,
    province: body.province,
    postal: body.postal,
    rate: body.rate,
    cleaning: body.cleaning,
    beds: body.beds,
    baths: body.baths,
    sqft: body.sqft,
    status: body.status || "ACTIVE",
    features: body.features || [],
    description: body.description,
    parking: body.parking,
    pet_friendly: body.petFriendly,
    dogs: body.dogs,
    cats: body.cats,
    utilities_included: body.utilitiesIncluded,
    utility_types: body.utilityTypes || [],
    utility_cap: body.utilityCap,
    year_built: body.yearBuilt || null,
    storeys: body.storeys || null,
    heating_type: body.heatingType,
    water_heater: body.waterHeater,
    firewall: body.firewall,
    power_meter: body.powerMeter,
    oil_company: body.oilCompany,
    internal_notes: body.internalNotes,
    created_by: userId,
  };
}

export async function requireUser(supabase) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function fetchActiveListings(supabase) {
  const { data: listings, error } = await supabase
    .from("listings")
    .select("*")
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!listings?.length) return [];

  const ids = listings.map((l) => l.id);
  const { data: photos, error: photoError } = await supabase
    .from("listing_photos")
    .select("*")
    .in("listing_id", ids)
    .order("sort_order", { ascending: true });

  if (photoError) throw photoError;

  const photosByListing = {};
  for (const photo of photos || []) {
    if (!photosByListing[photo.listing_id]) photosByListing[photo.listing_id] = [];
    photosByListing[photo.listing_id].push(photo);
  }

  return listings.map((row) => mapListingRow(row, photosByListing[row.id] || []));
}

export async function uploadListingPhoto(supabase, userId, file) {
  const ext = (file.originalname.split(".").pop() || "jpg").toLowerCase();
  const safeExt = ext.replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${safeExt}`;

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export { PHOTO_BUCKET };
