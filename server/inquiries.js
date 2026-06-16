function formatDesired(row) {
  const parts = [];
  if (row.preferred_viewing_date) {
    parts.push(`viewing ${row.preferred_viewing_date}`);
  }
  if (row.move_in_date) {
    parts.push(`move-in ${row.move_in_date}`);
  }
  if (row.lease_type) {
    parts.push(row.lease_type);
  }
  if (row.max_price) {
    parts.push(`up to $${Number(row.max_price).toLocaleString("en-CA")}/mo`);
  }
  return parts.length ? parts.join(" · ") : "a viewing";
}

export function mapInquiryRow(row) {
  return {
    id: row.id,
    first: row.first_name,
    last: row.last_name,
    email: row.email,
    phone: row.phone,
    propId: row.property_ref || row.listing_id,
    listingId: row.listing_id,
    propertyTitle: row.property_title,
    type: row.inquiry_type,
    status: row.status,
    desired: formatDesired(row),
    minBedrooms: row.min_bedrooms,
    minBathrooms: row.min_bathrooms,
    minParking: row.min_parking,
    pets: row.pets,
    moveInDate: row.move_in_date,
    otherDetails: row.other_details,
    leaseType: row.lease_type,
    maxPrice: row.max_price,
    preferredViewingDate: row.preferred_viewing_date,
    notes: row.notes || [],
    fromDb: true,
  };
}

export function inquiryInsertPayload(body) {
  return {
    listing_id: body.listingId || null,
    property_ref: body.propertyRef || null,
    property_title: body.propertyTitle || null,
    inquiry_type: body.inquiryType || "VIEWING_REQUEST",
    status: "NEW",
    first_name: String(body.firstName || "").trim(),
    last_name: String(body.lastName || "").trim(),
    email: String(body.email || "").trim(),
    phone: String(body.phone || "").trim(),
    min_bedrooms: body.minBedrooms ?? null,
    min_bathrooms: body.minBathrooms ?? null,
    min_parking: body.minParking ?? null,
    pets: body.pets || null,
    move_in_date: body.moveInDate || null,
    other_details: body.otherDetails || null,
    lease_type: body.leaseType || null,
    max_price: body.maxPrice ?? null,
    preferred_viewing_date: body.preferredViewingDate || null,
    notes: [{ text: "Viewing requested via website.", time: "just now" }],
  };
}

export async function fetchInquiries(supabase) {
  const { data, error } = await supabase
    .from("inquiries")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []).map(mapInquiryRow);
}

export function criteriaLabel(q) {
  const parts = [];
  if (q.minBedrooms != null) parts.push(`${q.minBedrooms}+ bed`);
  if (q.minBathrooms != null) parts.push(`${q.minBathrooms}+ bath`);
  if (q.minParking != null) parts.push(`${q.minParking}+ parking`);
  if (q.pets) parts.push(q.pets);
  if (q.leaseType) parts.push(q.leaseType);
  if (q.maxPrice) parts.push(`≤ $${Number(q.maxPrice).toLocaleString("en-CA")}`);
  return parts.join(" · ") || "No search criteria";
}
