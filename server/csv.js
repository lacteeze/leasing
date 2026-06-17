export function normalizeCsvText(text) {
  return String(text ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function firstNonEmptyLine(text) {
  return text.split("\n").find((line) => line.trim()) ?? "";
}

function detectCsvDelimiter(text) {
  const line = firstNonEmptyLine(text).trim();
  const sepMatch = line.match(/^sep=(.)$/i);
  if (sepMatch) return sepMatch[1];
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestScore = -1;
  for (const delimiter of candidates) {
    const score = line.split(delimiter).length - 1;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

function skipSepLine(text) {
  const lines = text.split("\n");
  if (lines.length && /^sep=/i.test(lines[0].trim())) {
    return lines.slice(1).join("\n");
  }
  return text;
}

function parseCsvRows(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

export function decodeCsvBuffer(buffer) {
  if (!buffer || buffer.length === 0) return "";

  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return null;
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString("utf16le").replace(/^\uFEFF/, "");
  }

  const utf8 = buffer.toString("utf-8").replace(/^\uFEFF/, "");
  if (utf8.includes("\0")) {
    return buffer.toString("utf16le").replace(/^\uFEFF/, "");
  }
  return utf8;
}

export function parseCsvText(text) {
  let normalized = skipSepLine(normalizeCsvText(text));
  if (!normalized.trim()) return [];

  let delimiter = detectCsvDelimiter(normalized);
  let rows = parseCsvRows(normalized, delimiter);

  if (rows.length && rows[0].length === 1 && delimiter === ",") {
    const hinted = rows[0][0];
    if (hinted.includes(";")) {
      delimiter = ";";
      rows = parseCsvRows(normalized, delimiter);
    }
  }

  if (!rows.length) return [];

  let headerRowIndex = 0;
  for (let i = 0; i < rows.length; i++) {
    const firstCell = String(rows[i][0] ?? "").trim();
    if (firstCell.startsWith("#")) continue;
    headerRowIndex = i;
    break;
  }

  const headers = rows[headerRowIndex].map((h) =>
    h.trim().replace(/^\uFEFF/, "").toLowerCase()
  );
  const out = [];

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const firstCell = String(rows[i][0] ?? "").trim();
    if (firstCell.startsWith("#")) continue;
    const obj = {};
    headers.forEach((h, j) => {
      obj[h] = rows[i][j] ?? "";
    });
    out.push(obj);
  }

  return out;
}
