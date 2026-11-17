const INJECTION_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value: unknown) {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : String(value);
  const safe = INJECTION_PREFIX.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csvRow(values: unknown[]) {
  return `${values.map(csvCell).join(",")}\r\n`;
}

export function csvHeader(values: string[]) {
  return csvRow(values);
}
