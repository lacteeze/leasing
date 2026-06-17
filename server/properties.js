import { decodeCsvBuffer, parseCsvText } from "./csv.js";
import { formatImportError } from "./audit.js";
import {
  extendedPropertyFields,
  heatingTypesFromRow,
  heatingTypesLabel,
  normalizeHeatingTypes,
  normalizeParkingType,
  parkingDetailLabel,
} from "./property-fields.js";

const PHOTO_BUCKET = "listing-photos";

const BULK_TYPES = new Set(["SINGLE", "MULTI", "SHORT_TERM"]);

const HEADER_ALIASES = {
  "monthly rent": "suggested_rate",
  rent: "suggested_rate",
  rate: "suggested_rate",
  "available date": "available_date",
  "available for move-in": "available_date",
  "available for move in": "available_date",
  "move-in date": "available_date",
  "move in date": "available_date",
  "pet friendly": "pet_friendly",
  "utilities included": "utilities_included",
  "utility types": "utility_types",
  "utility cap": "utility_cap",
  "year built": "year_built",
  "heating type": "heating_types",
  "heating types": "heating_types",
  "electric company": "electric_company",
  "parking type": "parking_type",
  "water heater": "water_heater",
  "power meter": "power_meter",
  "oil company": "oil_company",
  "internal notes": "internal_notes",
  "image urls": "image_urls",
  "image url": "image_urls",
  "nightly rate": "suggested_rate",
  "cleaning fee": "suggested_cleaning",
  "property status": "status",
  "occupancy status": "status",
  "occupancy": "status",
  "lease end": "lease_end",
  "lease end date": "lease_end",
  "end date": "lease_end",
  "tenant": "tenant_name",
  "tenant name": "tenant_name",
  "property id": "property_id",
  "property_id": "property_id",
  "property code": "property_id",
  "property_code": "property_id",
};

const BUILTIN_BULK_STATUSES = new Set([
  "vacant",
  "leased",
  "renewing",
  "not_renewing",
  "short_term",
  "archived",
]);

export function slugifyBulkStatus(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48) || "custom_status";
}

/** @returns {{ kind: string, slug?: string }} */
export function parseBulkPortfolioStatus(raw, propertyType) {
  const label = String(raw ?? "").trim();
  if (!label) {
    if (propertyType === "SHORT_TERM") return { kind: "short_term" };
    return { kind: "vacant" };
  }

  const slug = slugifyBulkStatus(label);
  if (BUILTIN_BULK_STATUSES.has(slug)) return { kind: slug };

  const lower = label.toLowerCase();
  if (lower.includes("not") && lower.includes("renew")) return { kind: "not_renewing" };
  if (lower === "renewing" || (lower.includes("renew") && !lower.includes("not"))) {
    return { kind: "renewing" };
  }
  const compact = slug.replace(/_/g, "");
  if (compact === "shortterm" || slug === "airbnb") return { kind: "short_term" };
  if (compact === "owneroccupied") return { kind: "custom", slug: "owner_occupied" };
  if (slug === "available" || slug === "empty") return { kind: "vacant" };
  if (slug === "occupied") return { kind: "leased" };

  if (!/^[a-z0-9_]+$/i.test(slug)) {
    throw new Error(`status "${label}" is not valid — use vacant, leased, renewing, not renewing, short term, archived, or a name like Owner occupied`);
  }
  return { kind: "custom", slug };
}

export const BULK_CSV_HEADERS = [
  "property_id",
  "title",
  "type",
  "status",
  "lease_end",
  "tenant_name",
  "address",
  "city",
  "province",
  "postal",
  "beds",
  "baths",
  "offices",
  "sqft",
  "description",
  "features",
  "parking",
  "parking_type",
  "pet_friendly",
  "dogs",
  "cats",
  "utilities_included",
  "utility_types",
  "utility_cap",
  "year_built",
  "storeys",
  "heating_types",
  "water_heater",
  "firewall",
  "power_meter",
  "electric_company",
  "oil_company",
  "internal_notes",
  "suggested_rate",
  "suggested_cleaning",
  "image_urls",
];

export function normalizePropertyCode(raw) {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return s.slice(0, 32);
}

export function suggestPropertyCode(title) {
  const base = normalizePropertyCode(title) || "PROP";
  return base.slice(0, 28);
}

export function parsePropertyCodeInput(raw, { required = false, label = "property_id" } = {}) {
  const code = normalizePropertyCode(raw);
  if (!code) {
    if (required) throw new Error(`${label} is required`);
    return "";
  }
  if (code.length < 2) {
    throw new Error(`${label} must be at least 2 characters (letters, numbers, _, -)`);
  }
  return code;
}

export async function resolveOwnedPropertyRef(supabase, userId, ref) {
  const token = String(ref ?? "").trim();
  if (!token) throw new Error("property_id is required");

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return getOwnedProperty(supabase, userId, token);
  }

  const property_code = parsePropertyCodeInput(token, { required: true });
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("created_by", userId)
    .eq("property_code", property_code)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error(`No property found with property_id "${property_code}"`);
  }
  return data;
}

function parseBool(val) {
  if (val === true || val === false) return val;
  const s = String(val ?? "").trim().toLowerCase();
  if (!s) return false;
  if (["yes", "y", "true", "1"].includes(s)) return true;
  if (["no", "n", "false", "0"].includes(s)) return false;
  return null;
}

function parseList(val) {
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  const s = String(val ?? "").trim();
  if (!s) return [];
  return s.split(/[;|]/).map((x) => x.trim()).filter(Boolean);
}

function parseNum(val, fallback = null) {
  if (val === "" || val == null) return fallback;
  const n = Number(String(val).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseFlexibleDate(val) {
  const s = String(val ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const isoMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (isoMatch) {
    const a = Number(isoMatch[1]);
    const b = Number(isoMatch[2]);
    const y = isoMatch[3];
    const month = a <= 12 ? a : b;
    const day = a <= 12 ? b : a;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const serial = Number(s);
  if (Number.isFinite(serial) && serial > 20000 && serial < 100000) {
    const ms = (serial - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function normalizeHeaderKey(key) {
  const norm = String(key ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, " ");
  if (HEADER_ALIASES[norm]) return HEADER_ALIASES[norm];
  return norm.replace(/\s+/g, "_");
}

export function normalizeBulkRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[normalizeHeaderKey(key)] = value;
  }
  return out;
}

export function mapLeaseSummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    propertyId: row.property_id,
    tenantName: row.tenant_name,
    tenantEmail: row.tenant_email || "",
    tenantPhone: row.tenant_phone || "",
    monthlyRate: Number(row.monthly_rate) || 0,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    renewalStatus: row.renewal_status,
  };
}

export function mapPropertyRow(row, photos = [], activeLease = null, listingSummary = null) {
  const images = photos
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => p.public_url);

  const heatingTypes = heatingTypesFromRow(row);

  return {
    id: row.id,
    propertyCode: row.property_code || null,
    title: row.title,
    type: row.type,
    area: row.city || row.area || "",
    address: row.address || "",
    city: row.city || "",
    province: row.province || "NL",
    postal: row.postal || "",
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    suggestedRate:
      row.suggested_rate != null ? Number(row.suggested_rate) : null,
    suggestedCleaning: Number(row.suggested_cleaning) || 0,
    beds: row.beds || 0,
    baths: row.baths || 0,
    offices: row.offices || 0,
    sqft: row.sqft || 0,
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
    managementStatus: row.management_status || "ACTIVE",
    occupancyStatus: row.occupancy_status || null,
    activeLease: mapLeaseSummary(activeLease),
    liveListingId: listingSummary?.id || null,
    liveListingStatus: listingSummary?.status || null,
    fromDb: true,
    isProperty: true,
  };
}

export function bulkTemplateCsv() {
  const header = BULK_CSV_HEADERS.join(",");
  const example =
    "GOWER-002,142 Gower Street #2,SINGLE,leased,2026-12-31,Jane Tenant,142 Gower Street,St. John's,NL,A1C 1J3,2,1,0,760,Bright downtown apartment with gas heat.,Gas heat;In-unit laundry,1,OFF_STREET,yes,no,no,yes,Electric;Internet,200,1920,2,Electric baseboard,Electric tank,no,12345,NL Power,Local Oil Co.,Owner prefers long-term tenants.,1800,0,https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800";
  const guide =
    "# property_id: your stable Property ID — use the same value in lease and listing imports\n" +
    "# status: vacant | leased | renewing | not renewing | short term | archived | Owner occupied (or any custom label)\n" +
    "# lease_end: required for leased/renewing/not renewing (YYYY-MM-DD). tenant_name optional.\n";
  return guide + header + "\n" + example + "\n";
}

export function parseBulkPropertyRow(rawRow, rowIndex) {
  const row = normalizeBulkRow(rawRow);
  const get = (key) => {
    const v = row[key];
    return v == null ? "" : String(v).trim();
  };

  const title = get("title");
  if (!title) throw new Error("title is required");

  const propertyCode = parsePropertyCodeInput(
    get("property_id") || get("property_code") || suggestPropertyCode(title),
    { required: true }
  );

  const type = get("type").toUpperCase() || "SINGLE";
  if (!BULK_TYPES.has(type)) {
    throw new Error(`type must be SINGLE, MULTI, or SHORT_TERM (got "${get("type")}")`);
  }

  const beds = parseNum(get("beds"), 0);
  if (beds === null) throw new Error("beds must be a number");

  const baths = parseNum(get("baths"), 0);
  if (baths === null) throw new Error("baths must be a number");

  const offices = parseNum(get("offices"), 0);
  if (offices === null) throw new Error("offices must be a number");

  const sqft = parseNum(get("sqft"), 0);
  if (sqft === null) throw new Error("sqft must be a number");

  const parking = parseNum(get("parking"), 0);
  if (parking === null) throw new Error("parking must be a number");

  const parkingType = normalizeParkingType(get("parking_type") || "OFF_STREET");

  const utilityCap = parseNum(get("utility_cap"), 0);
  if (utilityCap === null) throw new Error("utility_cap must be a number");

  const yearBuiltRaw = get("year_built");
  const yearBuilt = yearBuiltRaw ? parseNum(yearBuiltRaw, 0) : 0;
  if (yearBuiltRaw && yearBuilt === null) throw new Error("year_built must be a number");

  const storeysRaw = get("storeys");
  const storeys = storeysRaw ? parseNum(storeysRaw, 0) : 0;
  if (storeysRaw && storeys === null) throw new Error("storeys must be a number");

  const petFriendly = parseBool(get("pet_friendly"));
  if (petFriendly === null) throw new Error("pet_friendly must be yes/no");

  const dogs = parseBool(get("dogs"));
  if (dogs === null) throw new Error("dogs must be yes/no");

  const cats = parseBool(get("cats"));
  if (cats === null) throw new Error("cats must be yes/no");

  const utilitiesIncluded = parseBool(get("utilities_included"));
  if (utilitiesIncluded === null) throw new Error("utilities_included must be yes/no");

  const firewall = parseBool(get("firewall"));
  if (firewall === null) throw new Error("firewall must be yes/no");

  const suggestedRateRaw = get("suggested_rate");
  const suggestedRate = suggestedRateRaw ? parseNum(suggestedRateRaw, null) : null;
  if (suggestedRateRaw && suggestedRate === null) {
    throw new Error("suggested_rate must be a number");
  }

  const suggestedCleaningRaw = get("suggested_cleaning");
  const suggestedCleaning = suggestedCleaningRaw
    ? parseNum(suggestedCleaningRaw, 0)
    : 0;
  if (suggestedCleaningRaw && suggestedCleaning === null) {
    throw new Error("suggested_cleaning must be a number");
  }

  const city = get("city") || "St. John's";
  const imageUrls = parseList(row.image_urls);
  const portfolioStatus = parseBulkPortfolioStatus(get("status"), type);

  const leaseEndRaw = get("lease_end") || get("available_date");
  const leaseEnd = leaseEndRaw ? parseFlexibleDate(leaseEndRaw) : null;
  if (leaseEndRaw && !leaseEnd) {
    throw new Error("lease_end must be a valid date (YYYY-MM-DD)");
  }
  if (
    ["leased", "renewing", "not_renewing"].includes(portfolioStatus.kind) &&
    !leaseEnd
  ) {
    throw new Error(
      `lease_end is required when status is ${portfolioStatus.kind.replace(/_/g, " ")}`
    );
  }
  if (
    ["leased", "renewing", "not_renewing"].includes(portfolioStatus.kind) &&
    !suggestedRate
  ) {
    throw new Error("suggested_rate is required when status is leased, renewing, or not renewing");
  }

  return {
    title,
    propertyCode,
    type,
    portfolioStatus,
    leaseEnd,
    tenantName: get("tenant_name") || "Imported tenant",
    address: get("address"),
    city,
    province: get("province") || "NL",
    postal: get("postal"),
    suggestedRate,
    suggestedCleaning: type === "SHORT_TERM" ? suggestedCleaning : 0,
    beds,
    baths,
    offices,
    sqft,
    features: parseList(row.features),
    description: get("description"),
    parking,
    parkingType,
    petFriendly,
    dogs,
    cats,
    utilitiesIncluded,
    utilityTypes: parseList(row.utility_types),
    utilityCap,
    yearBuilt,
    storeys,
    heatingTypes: normalizeHeatingTypes(
      row.heating_types || get("heating_type") || "Electric baseboard"
    ),
    waterHeater: get("water_heater") || "Electric tank",
    firewall,
    powerMeter: get("power_meter"),
    electricCompany: get("electric_company") || "NL Power",
    oilCompany: get("oil_company"),
    internalNotes: get("internal_notes"),
    images: imageUrls.map((url) => ({ url, path: null })),
  };
}

export function propertyInsertPayload(body, userId) {
  const status = body.portfolioStatus || { kind: "vacant" };
  let management_status = "ACTIVE";
  let occupancy_status = null;

  if (status.kind === "archived") {
    management_status = "ARCHIVED";
  } else if (status.kind === "short_term") {
    occupancy_status = "short_term";
  } else if (status.kind === "custom") {
    occupancy_status = status.slug;
  } else if (["leased", "renewing", "not_renewing"].includes(status.kind)) {
    occupancy_status = "standard";
  } else if (body.type === "SHORT_TERM" && status.kind === "vacant") {
    occupancy_status = "short_term";
  }

  return {
    title: body.title,
    type: body.type,
    property_code:
      parsePropertyCodeInput(body.propertyCode || body.property_id, { required: false }) ||
      suggestPropertyCode(body.title),
    area: body.city || "",
    address: body.address,
    city: body.city,
    province: body.province,
    postal: body.postal,
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    suggested_rate: body.suggestedRate ?? null,
    suggested_cleaning: body.suggestedCleaning ?? 0,
    beds: body.beds,
    baths: body.baths,
    sqft: body.sqft,
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
    management_status,
    occupancy_status,
    created_by: userId,
    ...extendedPropertyFields({ ...body, offices: body.offices ?? 0 }),
  };
}

const UPDATE_FIELD_MAP = {
  title: "title",
  type: "type",
  propertyCode: "property_code",
  area: "area",
  address: "address",
  city: "city",
  province: "province",
  postal: "postal",
  latitude: "latitude",
  longitude: "longitude",
  suggestedRate: "suggested_rate",
  suggestedCleaning: "suggested_cleaning",
  beds: "beds",
  baths: "baths",
  offices: "offices",
  sqft: "sqft",
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
  managementStatus: "management_status",
  occupancyStatus: "occupancy_status",
};

export function propertyUpdatePayload(body) {
  const payload = { updated_at: new Date().toISOString() };
  const input = { ...(body || {}) };
  if (input.management_status !== undefined && input.managementStatus === undefined) {
    input.managementStatus = input.management_status;
  }
  if (input.occupancy_status !== undefined && input.occupancyStatus === undefined) {
    input.occupancyStatus = input.occupancy_status;
  }
  for (const [camel, snake] of Object.entries(UPDATE_FIELD_MAP)) {
    if (input[camel] !== undefined) payload[snake] = input[camel];
  }
  if (input.city !== undefined && input.area === undefined) {
    payload.area = input.city;
  }
  if (payload.baths !== undefined) payload.baths = Number(payload.baths) || 0;
  if (payload.offices !== undefined) payload.offices = Number(payload.offices) || 0;
  if (payload.year_built === 0) payload.year_built = null;
  if (payload.storeys === 0) payload.storeys = null;
  if (input.heatingTypes !== undefined || input.heatingType !== undefined) {
    Object.assign(
      payload,
      extendedPropertyFields({
        heatingTypes: input.heatingTypes,
        heatingType: input.heatingType,
      })
    );
  }
  return payload;
}

export function normalizePropertyImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .map((img) => {
      if (typeof img === "string") return { url: img.trim(), path: null };
      const url = String(img?.url || "").trim();
      const path = img?.path ? String(img.path).trim() : null;
      return url ? { url, path } : null;
    })
    .filter(Boolean);
}

export async function setPropertyManagementStatus(
  supabase,
  userId,
  propertyId,
  status
) {
  await getOwnedProperty(supabase, userId, propertyId);
  const { error } = await supabase
    .from("properties")
    .update({
      management_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", propertyId)
    .eq("created_by", userId);

  if (error) throw error;
  return fetchPropertyWithDetails(supabase, userId, propertyId);
}

export async function setPropertyOccupancyStatus(
  supabase,
  userId,
  propertyId,
  occupancyStatus
) {
  await getOwnedProperty(supabase, userId, propertyId);
  const { error } = await supabase
    .from("properties")
    .update({
      occupancy_status: occupancyStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", propertyId)
    .eq("created_by", userId);

  if (error) {
    const msg = String(error.message || "");
    if (
      error.code === "23514" ||
      msg.includes("check constraint") ||
      msg.includes("occupancy_status")
    ) {
      throw new Error(
        "Custom statuses require supabase/properties-occupancy-status-free-text.sql in the Supabase SQL Editor."
      );
    }
    throw error;
  }
  return fetchPropertyWithDetails(supabase, userId, propertyId);
}

export async function getOwnedProperty(supabase, userId, propertyId) {
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .eq("created_by", userId)
    .single();

  if (error) throw error;
  return data;
}

async function fetchPropertiesWithPhotos(supabase, properties) {
  if (!properties?.length) return [];

  const ids = properties.map((p) => p.id);
  const { data: photos, error: photoError } = await supabase
    .from("property_photos")
    .select("*")
    .in("property_id", ids)
    .order("sort_order", { ascending: true });

  if (photoError) throw photoError;

  const photosByProperty = {};
  for (const photo of photos || []) {
    if (!photosByProperty[photo.property_id]) {
      photosByProperty[photo.property_id] = [];
    }
    photosByProperty[photo.property_id].push(photo);
  }

  return properties.map((row) =>
    mapPropertyRow(row, photosByProperty[row.id] || [])
  );
}

export async function fetchManagerProperties(supabase, userId) {
  const { data: properties, error } = await supabase
    .from("properties")
    .select("*")
    .eq("created_by", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!properties?.length) return [];

  const propertyIds = properties.map((p) => p.id);

  const { data: leases, error: leaseError } = await supabase
    .from("leases")
    .select("*")
    .in("property_id", propertyIds)
    .eq("status", "ACTIVE");

  if (leaseError) throw leaseError;

  const { data: liveListings, error: listingError } = await supabase
    .from("listings")
    .select("id, property_id, status")
    .in("property_id", propertyIds)
    .eq("status", "ACTIVE");

  if (listingError) throw listingError;

  const { data: photos, error: photoError } = await supabase
    .from("property_photos")
    .select("*")
    .in("property_id", propertyIds)
    .order("sort_order", { ascending: true });

  if (photoError) throw photoError;

  const leaseByProperty = {};
  for (const lease of leases || []) {
    leaseByProperty[lease.property_id] = lease;
  }

  const listingByProperty = {};
  for (const listing of liveListings || []) {
    listingByProperty[listing.property_id] = listing;
  }

  const photosByProperty = {};
  for (const photo of photos || []) {
    if (!photosByProperty[photo.property_id]) {
      photosByProperty[photo.property_id] = [];
    }
    photosByProperty[photo.property_id].push(photo);
  }

  return properties.map((row) =>
    mapPropertyRow(
      row,
      photosByProperty[row.id] || [],
      leaseByProperty[row.id],
      listingByProperty[row.id]
    )
  );
}

async function fetchPropertyPhotos(supabase, propertyId) {
  const { data, error } = await supabase
    .from("property_photos")
    .select("*")
    .eq("property_id", propertyId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchPropertyWithDetails(supabase, userId, propertyId) {
  const property = await getOwnedProperty(supabase, userId, propertyId);
  const photos = await fetchPropertyPhotos(supabase, propertyId);

  const { data: activeLease } = await supabase
    .from("leases")
    .select("*")
    .eq("property_id", propertyId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  const { data: liveListing } = await supabase
    .from("listings")
    .select("id, status")
    .eq("property_id", propertyId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  return mapPropertyRow(property, photos, activeLease, liveListing);
}

export async function updatePropertyPhotos(supabase, propertyId, images) {
  const normalized = normalizePropertyImages(images);
  if (!Array.isArray(images)) return;

  const { error: deleteError } = await supabase
    .from("property_photos")
    .delete()
    .eq("property_id", propertyId);

  if (deleteError) throw deleteError;

  if (!normalized.length) return;

  const photoRows = normalized.map((img, i) => ({
    property_id: propertyId,
    storage_path: img.path || img.url,
    public_url: img.url,
    sort_order: i,
  }));

  const { error: insertError } = await supabase
    .from("property_photos")
    .insert(photoRows);

  if (insertError) {
    throw new Error(`Could not save property photos: ${insertError.message}`);
  }
}

export async function uploadPropertyPhoto(supabase, userId, file) {
  const ext = (file.originalname.split(".").pop() || "jpg").toLowerCase();
  const safeExt = ext.replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `properties/${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${safeExt}`;

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

export async function bulkInsertProperties(supabase, userId, rawRows, { onRowComplete } = {}) {
  const imported = [];
  const errors = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2;
    try {
      const body = parseBulkPropertyRow(rawRows[i], i);
      const payload = propertyInsertPayload(body, userId);

      const { data: property, error } = await supabase
        .from("properties")
        .insert(payload)
        .select("*")
        .single();

      if (error) throw error;

      if (body.images?.length) {
        await updatePropertyPhotos(supabase, property.id, body.images);
      }

      const status = body.portfolioStatus;
      if (["leased", "renewing", "not_renewing"].includes(status.kind)) {
        const startDate = new Date().toISOString().slice(0, 10);
        const renewal_status =
          status.kind === "renewing"
            ? "RENEWING"
            : status.kind === "not_renewing"
              ? "NOT_RENEWING"
              : "UNKNOWN";
        const { error: leaseError } = await supabase.from("leases").insert({
          property_id: property.id,
          tenant_name: body.tenantName,
          monthly_rate: body.suggestedRate,
          start_date: startDate,
          end_date: body.leaseEnd,
          status: "ACTIVE",
          renewal_status,
          created_by: userId,
        });
        if (leaseError) throw leaseError;
      }

      const saved = await fetchPropertyWithDetails(supabase, userId, property.id);
      imported.push(saved);
    } catch (err) {
      errors.push({
        row: rowNum,
        message: formatImportError(err),
        code: err?.code || null,
      });
    }
    if (onRowComplete) onRowComplete(i + 1, rawRows.length);
  }

  return { imported, errors, total: rawRows.length };
}

export function previewBulkProperties(csvText) {
  const rawRows = parseCsvText(csvText);
  const parseErrors = [];
  const rows = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2;
    try {
      parseBulkPropertyRow(rawRows[i], i);
      rows.push(rawRows[i]);
    } catch (err) {
      parseErrors.push({
        row: rowNum,
        message: formatImportError(err),
      });
    }
  }

  return {
    total: rawRows.length,
    valid: rows.length,
    rows,
    parseErrors,
  };
}

export async function deleteAllOwnedProperties(supabase, userId) {
  const { data: properties, error: listError } = await supabase
    .from("properties")
    .select("id")
    .eq("created_by", userId);

  if (listError) throw listError;
  if (!properties?.length) return { deleted: 0 };

  const { error } = await supabase
    .from("properties")
    .delete()
    .eq("created_by", userId);

  if (error) throw error;
  return { deleted: properties.length };
}

export { parseCsvText, decodeCsvBuffer };
