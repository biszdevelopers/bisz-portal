import { portalLocale } from "~/shared/locale";

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(portalLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "";
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    date = new Date(year!, month! - 1, day!);
  } else {
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(portalLocale, { dateStyle: "medium" }).format(
    date,
  );
}

export function timeAgo(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(portalLocale, {
    numeric: "auto",
  });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
    ["second", 1],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size || unit === "second") {
      return formatter.format(Math.round(seconds / size), unit);
    }
  }
  return "";
}

export function initials(value: string | null | undefined) {
  const source = (value ?? "").trim();
  if (!source) return "?";
  const words = source.split(/\s+/).filter(Boolean);
  return (
    words.length > 1
      ? `${words[0]?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}`
      : source.slice(0, 2)
  ).toUpperCase();
}

export function safeInternalUrl(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
