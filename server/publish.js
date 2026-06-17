import {
  getOwnedProperty,
  mapPropertyRow,
} from "./properties.js";
import { getActiveLease, archiveActiveListingForProperty } from "./leases.js";
import { slugFromTitle, mapListingRow, updateListingPhotos } from "./listings.js";

export function listingPrefillFromProperty(property, activeLease, overrides = {}) {
  const isShort = property.type === "SHORT_TERM";
  let rate = overrides.rate != null ? Number(overrides.rate) : null;
  let cleaning =
    overrides.cleaning != null ? Number(overrides.cleaning) : null;
  let availableDate = overrides.availableDate || null;

  if (isShort) {
    rate = rate ?? (Number(property.suggested_rate) || 0);
    cleaning = cleaning ?? (Number(property.suggested_cleaning) || 0);
  } else {
    if (!rate) {
      if (activeLease?.monthly_rate) rate = Number(activeLease.monthly_rate);
      else if (property.suggested_rate != null) {
        rate = Number(property.suggested_rate);
      } else rate = 0;
    }
    if (!availableDate && activeLease?.renewal_status === "NOT_RENEWING") {
      availableDate = activeLease.end_date;
    }
  }

  return { rate, cleaning: cleaning ?? 0, availableDate };
}

export function propertyToListingBody(property, prefill, overrides = {}) {
  const slug = overrides.slug || slugFromTitle(property.title);

  return {
    slug,
    title: overrides.title || property.title,
    type: property.type,
    area: property.area,
    address: property.address,
    city: property.city,
    province: property.province,
    postal: property.postal,
    latitude: property.latitude,
    longitude: property.longitude,
    rate: prefill.rate,
    cleaning: property.type === "SHORT_TERM" ? prefill.cleaning : 0,
    beds: property.beds,
    baths: property.baths,
    sqft: property.sqft,
    availableDate: prefill.availableDate,
    status: "ACTIVE",
    features: property.features || [],
    description: property.description,
    parking: property.parking,
    petFriendly: property.pet_friendly,
    dogs: property.dogs,
    cats: property.cats,
    utilitiesIncluded: property.utilities_included,
    utilityTypes: property.utility_types || [],
    utilityCap: property.utility_cap,
    yearBuilt: property.year_built,
    storeys: property.storeys,
    heatingType: property.heating_type,
    waterHeater: property.water_heater,
    firewall: property.firewall,
    powerMeter: property.power_meter,
    oilCompany: property.oil_company,
    internalNotes: property.internal_notes,
    propertyId: property.id,
    sourceListingId: overrides.sourceListingId || null,
  };
}

export async function copyPropertyPhotosToListing(
  supabase,
  propertyId,
  listingId
) {
  const { data: photos, error } = await supabase
    .from("property_photos")
    .select("*")
    .eq("property_id", propertyId)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  await updateListingPhotos(
    supabase,
    listingId,
    (photos || []).map((p) => ({ url: p.public_url, path: p.storage_path }))
  );
}

export async function publishListingFromProperty(
  supabase,
  userId,
  propertyId,
  overrides = {}
) {
  const property = await getOwnedProperty(supabase, userId, propertyId);
  const activeLease = await getActiveLease(supabase, propertyId);

  if (activeLease?.renewal_status === "RENEWING") {
    throw new Error(
      "Cannot publish: tenant is renewing. The unit should stay off the public storefront."
    );
  }

  const prefill = listingPrefillFromProperty(property, activeLease, overrides);
  const body = propertyToListingBody(property, prefill, overrides);

  if (!body.rate || body.rate <= 0) {
    throw new Error(
      "A listing rate is required. Set lease rent or suggested rate."
    );
  }

  await archiveActiveListingForProperty(supabase, propertyId);

  const { data: listing, error } = await supabase
    .from("listings")
    .insert({
      slug: body.slug,
      title: body.title,
      type: body.type,
      area: body.area,
      address: body.address,
      city: body.city,
      province: body.province,
      postal: body.postal,
      latitude: body.latitude,
      longitude: body.longitude,
      rate: body.rate,
      cleaning: body.cleaning,
      beds: body.beds,
      baths: body.baths,
      sqft: body.sqft,
      available_date: body.availableDate || null,
      status: "ACTIVE",
      features: body.features,
      description: body.description,
      parking: body.parking,
      pet_friendly: body.petFriendly,
      dogs: body.dogs,
      cats: body.cats,
      utilities_included: body.utilitiesIncluded,
      utility_types: body.utilityTypes,
      utility_cap: body.utilityCap,
      year_built: body.yearBuilt,
      storeys: body.storeys,
      heating_type: body.heatingType,
      water_heater: body.waterHeater,
      firewall: body.firewall,
      power_meter: body.powerMeter,
      oil_company: body.oilCompany,
      internal_notes: body.internalNotes,
      property_id: propertyId,
      source_listing_id: body.sourceListingId,
      created_by: userId,
    })
    .select("*")
    .single();

  if (error) {
    if (/available_date/i.test(error.message || "")) {
      throw new Error(
        "Run supabase/listings-available-date.sql in Supabase SQL Editor"
      );
    }
    throw error;
  }

  await copyPropertyPhotosToListing(supabase, propertyId, listing.id);

  const { data: photos } = await supabase
    .from("listing_photos")
    .select("*")
    .eq("listing_id", listing.id)
    .order("sort_order", { ascending: true });

  return mapListingRow(listing, photos || []);
}

export async function getPublishPrefill(supabase, userId, propertyId) {
  const property = await getOwnedProperty(supabase, userId, propertyId);
  const activeLease = await getActiveLease(supabase, propertyId);
  const prefill = listingPrefillFromProperty(property, activeLease);
  const propertyMapped = mapPropertyRow(property);

  return {
    property: propertyMapped,
    activeLease: activeLease
      ? {
          id: activeLease.id,
          tenantName: activeLease.tenant_name,
          monthlyRate: Number(activeLease.monthly_rate),
          startDate: activeLease.start_date,
          endDate: activeLease.end_date,
          renewalStatus: activeLease.renewal_status,
        }
      : null,
    prefill: {
      rate: prefill.rate,
      cleaning: prefill.cleaning,
      availableDate: prefill.availableDate,
    },
    canPublish: activeLease?.renewal_status !== "RENEWING",
  };
}
