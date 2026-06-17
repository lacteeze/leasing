import {
  mapLeaseSummary,
  normalizeBulkRow,
  parseFlexibleDate,
  resolveOwnedPropertyRef,
} from "./properties.js";

const RENEWAL_STATUSES = new Set(["UNKNOWN", "RENEWING", "NOT_RENEWING"]);
const LEASE_STATUSES = new Set(["ACTIVE", "ENDED"]);

export const BULK_LEASE_CSV_HEADERS = [
  "property_id",
  "tenant_name",
  "tenant_email",
  "tenant_phone",
  "monthly_rate",
  "start_date",
  "end_date",
  "status",
  "renewal_status",
];

export function bulkLeaseTemplateCsv() {
  const header = BULK_LEASE_CSV_HEADERS.join(",");
  const example =
    "GOWER-002,Jane Tenant,jane@example.com,7095550100,1800,2023-01-01,2023-12-31,ENDED,UNKNOWN";
  const guide =
    "# property_id: must match a Property ID from Properties (same as properties CSV)\n" +
    "# status: ENDED for historical leases, ACTIVE for current (only one active lease per property)\n" +
    "# renewal_status: UNKNOWN | RENEWING | NOT_RENEWING (optional, defaults to UNKNOWN)\n";
  return guide + header + "\n" + example + "\n";
}

export function parseBulkLeaseRow(rawRow) {
  const row = normalizeBulkRow(rawRow);
  const get = (key) => {
    const v = row[key];
    return v == null ? "" : String(v).trim();
  };

  const propertyRef = get("property_id") || get("property_code");
  if (!propertyRef) throw new Error("property_id is required");

  const tenantName = get("tenant_name");
  if (!tenantName) throw new Error("tenant_name is required");

  const monthlyRate = parseNum(get("monthly_rate"));
  if (monthlyRate === null || monthlyRate <= 0) {
    throw new Error("monthly_rate must be a positive number");
  }

  const startDate = parseFlexibleDate(get("start_date"));
  if (!startDate) throw new Error("start_date must be a valid date (YYYY-MM-DD)");

  const endDate = parseFlexibleDate(get("end_date"));
  if (!endDate) throw new Error("end_date must be a valid date (YYYY-MM-DD)");
  if (endDate < startDate) throw new Error("end_date must be on or after start_date");

  const statusRaw = get("status").toUpperCase() || "ENDED";
  const status = statusRaw === "ACTIVE" ? "ACTIVE" : "ENDED";

  const renewalRaw = get("renewal_status").toUpperCase() || "UNKNOWN";
  const renewalStatus = RENEWAL_STATUSES.has(renewalRaw) ? renewalRaw : "UNKNOWN";

  return {
    propertyRef,
    tenantName,
    tenantEmail: get("tenant_email") || null,
    tenantPhone: get("tenant_phone") || null,
    monthlyRate,
    startDate,
    endDate,
    status,
    renewalStatus,
  };
}

function parseNum(val) {
  if (val === "" || val == null) return null;
  const n = Number(String(val).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function mapLeaseRow(row, propertyMeta = null) {
  const base = mapLeaseSummary(row);
  if (!base) return null;
  return {
    ...base,
    propertyCode: propertyMeta?.property_code || propertyMeta?.propertyCode || null,
    propertyTitle: propertyMeta?.title || null,
  };
}

export async function getActiveLease(supabase, propertyId) {
  const { data, error } = await supabase
    .from("leases")
    .select("*")
    .eq("property_id", propertyId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function fetchPropertyLeases(supabase, propertyId) {
  const { data, error } = await supabase
    .from("leases")
    .select("*")
    .eq("property_id", propertyId)
    .order("start_date", { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => mapLeaseRow(row));
}

export async function fetchManagerLeases(supabase, userId) {
  const { data: properties, error: propError } = await supabase
    .from("properties")
    .select("id, title, property_code, city")
    .eq("created_by", userId);

  if (propError) throw propError;
  if (!properties?.length) return [];

  const byId = new Map(properties.map((p) => [p.id, p]));
  const ids = properties.map((p) => p.id);

  const { data: leases, error: leaseError } = await supabase
    .from("leases")
    .select("*")
    .in("property_id", ids)
    .order("start_date", { ascending: false });

  if (leaseError) throw leaseError;

  return (leases || []).map((row) => mapLeaseRow(row, byId.get(row.property_id)));
}

export function leaseInsertPayload(body, userId, propertyId) {
  return {
    property_id: propertyId,
    tenant_name: body.tenantName,
    tenant_email: body.tenantEmail || null,
    tenant_phone: body.tenantPhone || null,
    monthly_rate: body.monthlyRate,
    start_date: body.startDate,
    end_date: body.endDate,
    status: body.status || "ACTIVE",
    renewal_status: body.renewalStatus || "UNKNOWN",
    created_by: userId,
  };
}

const UPDATE_FIELD_MAP = {
  tenantName: "tenant_name",
  tenantEmail: "tenant_email",
  tenantPhone: "tenant_phone",
  monthlyRate: "monthly_rate",
  startDate: "start_date",
  endDate: "end_date",
  status: "status",
  renewalStatus: "renewal_status",
};

export function leaseUpdatePayload(body) {
  const payload = { updated_at: new Date().toISOString() };
  for (const [camel, snake] of Object.entries(UPDATE_FIELD_MAP)) {
    if (body[camel] !== undefined) payload[snake] = body[camel];
  }
  return payload;
}

export function validateLeaseBody(body, { requireTenant = true } = {}) {
  if (requireTenant && !body.tenantName?.trim()) {
    throw new Error("tenantName is required");
  }
  const rate = Number(body.monthlyRate);
  if (!rate || rate <= 0) throw new Error("monthlyRate must be a positive number");
  if (!body.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate)) {
    throw new Error("startDate must be YYYY-MM-DD");
  }
  if (!body.endDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate)) {
    throw new Error("endDate must be YYYY-MM-DD");
  }
  if (body.endDate < body.startDate) {
    throw new Error("endDate must be on or after startDate");
  }
  if (body.renewalStatus && !RENEWAL_STATUSES.has(body.renewalStatus)) {
    throw new Error("renewalStatus must be UNKNOWN, RENEWING, or NOT_RENEWING");
  }
  if (body.status && !LEASE_STATUSES.has(body.status)) {
    throw new Error("status must be ACTIVE or ENDED");
  }
}

export function buildQuickLeaseBody(property, { renewalStatus = "UNKNOWN" } = {}) {
  const today = new Date();
  const startDate = today.toISOString().slice(0, 10);
  const end = new Date(today);
  end.setFullYear(end.getFullYear() + 1);
  const endDate = end.toISOString().slice(0, 10);
  const rate = Number(property.suggested_rate);
  return {
    tenantName: "Unassigned",
    tenantEmail: null,
    tenantPhone: null,
    monthlyRate: rate > 0 ? rate : 1,
    startDate,
    endDate,
    renewalStatus,
  };
}

export async function getOwnedLease(supabase, userId, leaseId) {
  const { data, error } = await supabase
    .from("leases")
    .select("*, properties!inner(created_by)")
    .eq("id", leaseId)
    .single();

  if (error) throw error;
  if (data.properties?.created_by !== userId) {
    const err = new Error("Lease not found");
    err.code = "NOT_FOUND";
    throw err;
  }
  return data;
}

export async function archiveActiveListingForProperty(supabase, propertyId) {
  const { error } = await supabase
    .from("listings")
    .update({ status: "ARCHIVED", updated_at: new Date().toISOString() })
    .eq("property_id", propertyId)
    .eq("status", "ACTIVE");

  if (error) throw error;
}

export async function bulkInsertLeases(supabase, userId, rawRows) {
  const imported = [];
  const errors = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2;
    try {
      const body = parseBulkLeaseRow(rawRows[i]);
      const property = await resolveOwnedPropertyRef(
        supabase,
        userId,
        body.propertyRef
      );

      if (body.status === "ACTIVE") {
        const existing = await getActiveLease(supabase, property.id);
        if (existing) {
          throw new Error(
            "Property already has an active lease — set status to ENDED for historical rows"
          );
        }
      }

      const payload = leaseInsertPayload(body, userId, property.id);
      const { data: lease, error } = await supabase
        .from("leases")
        .insert(payload)
        .select("*")
        .single();

      if (error) throw error;

      if (body.status === "ACTIVE") {
        await archiveActiveListingForProperty(supabase, property.id);
      }

      imported.push(
        mapLeaseRow(lease, {
          title: property.title,
          property_code: property.property_code,
        })
      );
    } catch (err) {
      errors.push({
        row: rowNum,
        message: err.message || "Import failed",
      });
    }
  }

  return { imported, errors };
}
