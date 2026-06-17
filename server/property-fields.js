export const HEATING_TYPE_OPTIONS = [
  "Electric baseboard",
  "Mini-split heat pump",
  "Oil-fired hot water",
  "Oil-fired forced air",
  "Natural gas",
  "Wood / pellet",
  "Other",
];

export const PARKING_TYPE_VALUES = ["ON_STREET", "OFF_STREET", "GARAGE"];

export const PARKING_TYPE_LABELS = {
  ON_STREET: "On-street",
  OFF_STREET: "Off-street",
  GARAGE: "Garage",
};

export function normalizeHeatingTypes(value) {
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  const s = String(value ?? "").trim();
  if (!s) return [];
  if (s.includes(";")) {
    return s.split(";").map((part) => part.trim()).filter(Boolean);
  }
  return [s];
}

export function heatingTypesFromRow(row) {
  const fromJson = row?.heating_types;
  if (Array.isArray(fromJson) && fromJson.length) {
    return fromJson.map(String).filter(Boolean);
  }
  if (row?.heating_type) return [String(row.heating_type)];
  return [];
}

export function heatingTypesLabel(types) {
  const list = normalizeHeatingTypes(types);
  return list.length ? list.join(" · ") : "";
}

export function normalizeParkingType(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (raw === "ON_STREET" || raw === "ONSTREET") return "ON_STREET";
  if (raw === "OFF_STREET" || raw === "OFFSTREET") return "OFF_STREET";
  if (raw === "GARAGE" || raw === "GARAGE_PARKING") return "GARAGE";
  if (PARKING_TYPE_VALUES.includes(raw)) return raw;
  return "OFF_STREET";
}

export function mentionsOil(heatingTypes, waterHeater) {
  const blob = [...normalizeHeatingTypes(heatingTypes), String(waterHeater || "")]
    .join(" ")
    .toLowerCase();
  return blob.includes("oil");
}

export function parkingDetailLabel(parkingType, count) {
  const typeLabel =
    PARKING_TYPE_LABELS[normalizeParkingType(parkingType)] || "Off-street";
  const n = Number(count) || 0;
  if (n > 0) return `${typeLabel} · ${n} space${n > 1 ? "s" : ""}`;
  return typeLabel;
}

export function unitSpecs({ beds = 0, offices = 0, baths = 0, sqft = 0 }) {
  const parts = [];
  if (beds) parts.push(`${beds} bed`);
  if (offices) parts.push(`${offices} office${offices > 1 ? "s" : ""}`);
  parts.push(`${baths} bath`, `${sqft} sq ft`);
  return parts.join(" · ");
}

export function applyHeatingFields(payload, heatingTypes) {
  const normalized = normalizeHeatingTypes(heatingTypes);
  payload.heating_types = normalized;
  payload.heating_type = normalized[0] || null;
  return payload;
}

export function extendedPropertyFields(body) {
  const heatingTypes =
    body.heatingTypes !== undefined
      ? normalizeHeatingTypes(body.heatingTypes)
      : body.heatingType !== undefined
        ? normalizeHeatingTypes(body.heatingType)
        : undefined;

  const fields = {
    offices: body.offices !== undefined ? Number(body.offices) || 0 : undefined,
    electric_company:
      body.electricCompany !== undefined
        ? String(body.electricCompany || "NL Power").trim() || "NL Power"
        : undefined,
    parking_type:
      body.parkingType !== undefined
        ? normalizeParkingType(body.parkingType)
        : undefined,
  };

  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) out[key] = value;
  }
  if (heatingTypes !== undefined) applyHeatingFields(out, heatingTypes);
  return out;
}
