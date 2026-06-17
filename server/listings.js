const PHOTO_BUCKET = "listing-photos";

import {
  extendedPropertyFields,
  heatingTypesFromRow,
  heatingTypesLabel,
} from "./property-fields.js";

export function mapListingRow(row, photos = []) {
  const images = photos
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => p.public_url);

  const heatingTypes = heatingTypesFromRow(row);

  return {
    id: row.id,
    slug: row.slug,
    propertyId: row.property_id || null,
    sourceListingId: row.source_listing_id || null,
    title: row.title,
    type: row.type,
    area: row.area || row.city || "",
    address: row.address || "",
    city: row.city || "",
    province: row.province || "NL",
    postal: row.postal || "",
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    rate: Number(row.rate) || 0,
    cleaning: Number(row.cleaning) || 0,
    beds: row.beds || 0,
    baths: row.baths || 0,
    offices: row.offices || 0,
    sqft: row.sqft || 0,
    availableDate: row.available_date || null,
    status: row.status,
    features: row.features || [],
    images,
    description: row.description || "",
    parking: row.parking || 0,
    parkingType: row.parking_type || "OFF_STREET",
    petFriendly: !!row.pet_friendly,
    dogs: !!row.dogs,
    cats: !!row.cats,
    utilitiesIncluded: !!row.utilities_included,
    utilityTypes: row.utility_types || [],
    utilityCap: row.utility_cap || 0,
    yearBuilt: row.year_built || 0,
    storeys: row.storeys || 0,
    heatingTypes,
    heatingType: heatingTypesLabel(heatingTypes),
    waterHeater: row.water_heater || "",
    firewall: !!row.firewall,
    powerMeter: row.power_meter || "",
    electricCompany: row.electric_company || "NL Power",
    oilCompany: row.oil_company || "",
    internalNotes: row.internal_notes || "",
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null,
    fromDb: true,
    isListing: true,
  };
}

export function slugFromTitle(title) {
  const base =
    (title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
      "listing") +
    "-" +
    Date.now().toString(36) +
    "-" +
    crypto.randomUUID().slice(0, 4);
  return base;
}

export function listingInsertPayload(body, userId) {
  return {
    slug: body.slug,
    title: body.title,
    type: body.type,
    area: body.area,
    address: body.address,
    city: body.city,
    province: body.province,
    postal: body.postal,
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    rate: body.rate,
    cleaning: body.cleaning,
    beds: body.beds,
    baths: body.baths,
    sqft: body.sqft,
    available_date: body.availableDate || null,
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
    water_heater: body.waterHeater,
    firewall: body.firewall,
    power_meter: body.powerMeter,
    oil_company: body.oilCompany,
    internal_notes: body.internalNotes,
    property_id: body.propertyId || null,
    source_listing_id: body.sourceListingId || null,
    created_by: userId,
    ...extendedPropertyFields({ ...body, offices: body.offices ?? 0 }),
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

async function fetchListingsWithPhotos(supabase, listings) {
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

export async function fetchActiveListings(supabase) {
  const { data: listings, error } = await supabase
    .from("listings")
    .select("*")
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return fetchListingsWithPhotos(supabase, listings);
}

export async function fetchManagerListings(supabase, userId) {
  const { data: listings, error } = await supabase
    .from("listings")
    .select("*")
    .eq("created_by", userId)
    .in("status", ["ACTIVE", "ARCHIVED", "DRAFT"])
    .order("created_at", { ascending: false });

  if (error) throw error;
  return fetchListingsWithPhotos(supabase, listings);
}

export async function fetchPropertyListings(supabase, userId, propertyId) {
  const { getOwnedProperty } = await import("./properties.js");
  await getOwnedProperty(supabase, userId, propertyId);

  const { data: listings, error } = await supabase
    .from("listings")
    .select("*")
    .eq("property_id", propertyId)
    .eq("created_by", userId)
    .in("status", ["ACTIVE", "ARCHIVED", "DRAFT"])
    .order("created_at", { ascending: false });

  if (error) throw error;
  return fetchListingsWithPhotos(supabase, listings || []);
}

const UPDATE_FIELD_MAP = {
  title: "title",
  type: "type",
  area: "area",
  address: "address",
  city: "city",
  province: "province",
  postal: "postal",
  latitude: "latitude",
  longitude: "longitude",
  rate: "rate",
  cleaning: "cleaning",
  beds: "beds",
  baths: "baths",
  offices: "offices",
  sqft: "sqft",
  availableDate: "available_date",
  status: "status",
  features: "features",
  description: "description",
  parking: "parking",
  parkingType: "parking_type",
  petFriendly: "pet_friendly",
  dogs: "dogs",
  cats: "cats",
  utilitiesIncluded: "utilities_included",
  utilityTypes: "utility_types",
  utilityCap: "utility_cap",
  yearBuilt: "year_built",
  storeys: "storeys",
  waterHeater: "water_heater",
  firewall: "firewall",
  powerMeter: "power_meter",
  electricCompany: "electric_company",
  oilCompany: "oil_company",
  internalNotes: "internal_notes",
};

export function listingUpdatePayload(body) {
  const payload = { updated_at: new Date().toISOString() };
  for (const [camel, snake] of Object.entries(UPDATE_FIELD_MAP)) {
    if (body[camel] !== undefined) payload[snake] = body[camel];
  }
  if (body.heatingTypes !== undefined || body.heatingType !== undefined) {
    Object.assign(
      payload,
      extendedPropertyFields({
        heatingTypes: body.heatingTypes,
        heatingType: body.heatingType,
      })
    );
  }
  return payload;
}

export async function getOwnedListing(supabase, userId, listingId) {
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("id", listingId)
    .eq("created_by", userId)
    .single();

  if (error) throw error;
  return data;
}

export async function updateListingPhotos(supabase, listingId, images) {
  if (!Array.isArray(images)) return;

  const { error: deleteError } = await supabase
    .from("listing_photos")
    .delete()
    .eq("listing_id", listingId);

  if (deleteError) throw deleteError;

  if (!images.length) return;

  const photoRows = images.map((img, i) => ({
    listing_id: listingId,
    storage_path: img.path || img.url,
    public_url: img.url,
    sort_order: i,
  }));

  const { error: insertError } = await supabase
    .from("listing_photos")
    .insert(photoRows);

  if (insertError) throw insertError;
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
