const API_BASE = "https://public.api.hospitable.com/v2";

export function hospitableApiToken() {
  return process.env.HOSPITABLE_API_TOKEN || "";
}

export function hospitableDirectSiteUrl() {
  const raw = process.env.HOSPITABLE_DIRECT_SITE_URL || "";
  return raw.replace(/\/$/, "");
}

export function isHospitableConfigured() {
  return !!hospitableApiToken();
}

async function hospitableFetch(path, params = {}) {
  const token = hospitableApiToken();
  if (!token) {
    throw new Error("Hospitable API is not configured.");
  }

  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      body?.message ||
      body?.error ||
      body?.errors?.[0]?.message ||
      `Hospitable API error (${res.status})`;
    throw new Error(msg);
  }
  return body;
}

function bookUrl(propertyId, { startDate, endDate, adults } = {}) {
  const base = hospitableDirectSiteUrl();
  if (!base) return null;
  const url = new URL(`${base}/properties/${propertyId}`);
  if (startDate) url.searchParams.set("check_in", startDate);
  if (endDate) url.searchParams.set("check_out", endDate);
  if (adults) url.searchParams.set("adults", String(adults));
  return url.toString();
}

export function mapHospitableProperty(row, { startDate, endDate, adults } = {}) {
  const property = row?.property || row || {};
  const pricing = row?.pricing || {};
  const availability = row?.availability || {};
  const address = property.address || {};
  const capacity = property.capacity || {};
  const total =
    pricing.total?.formatted_string ||
    pricing.total_without_taxes?.formatted_string ||
    null;

  const nightly = Array.isArray(pricing.daily) ? pricing.daily[0] : null;
  const nightlyLabel =
    nightly?.price?.formatted_string ||
    (nightly?.price?.amount != null ? `$${nightly.price.amount}` : null);

  const available =
    availability.available === true ||
    (availability.available !== false && !startDate);

  const reason =
    availability.details?.notAvailableReason ||
    availability.details?.[0]?.notAvailableReason ||
    null;

  return {
    id: property.id,
    title: property.public_name || property.name || "Short-term rental",
    city: address.city || "",
    address: address.display || "",
    picture: property.picture || null,
    bedrooms: capacity.bedrooms || 0,
    beds: capacity.beds || 0,
    baths: capacity.bathrooms || 0,
    maxGuests: capacity.max || 0,
    summary: property.summary || "",
    available,
    unavailableReason: reason,
    priceLabel: total || nightlyLabel,
    nightlyLabel,
    bookUrl: bookUrl(property.id, { startDate, endDate, adults }),
  };
}

export async function fetchHospitableProperties() {
  const siteUrl = hospitableDirectSiteUrl();
  const params = { per_page: 50 };
  if (siteUrl) params.site_url = siteUrl;

  const body = await hospitableFetch("/properties", params);
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows
    .map((row) => mapHospitableProperty(row))
    .filter((p) => p.id && p.title);
}

export async function searchHospitableProperties({
  startDate,
  endDate,
  adults = 2,
  children = 0,
  infants = 0,
  pets = 0,
}) {
  if (!startDate || !endDate) {
    throw new Error("Check-in and check-out dates are required.");
  }

  const params = {
    start_date: startDate,
    end_date: endDate,
    adults: Math.max(1, Number(adults) || 1),
    children: Math.max(0, Number(children) || 0),
    infants: Math.max(0, Number(infants) || 0),
    pets: Math.max(0, Number(pets) || 0),
    include: "details",
  };

  const siteUrl = hospitableDirectSiteUrl();
  if (siteUrl) params.site_url = siteUrl;

  const body = await hospitableFetch("/properties/search", params);
  const rows = Array.isArray(body?.data) ? body.data : [];
  const mapped = rows.map((row) =>
    mapHospitableProperty(row, {
      startDate,
      endDate,
      adults: params.adults,
    })
  );

  const available = mapped.filter((p) => p.available);
  const unavailable = mapped.filter((p) => !p.available);
  return { available, unavailable, all: mapped };
}
