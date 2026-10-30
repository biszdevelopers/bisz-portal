export function formatTaskDueDate(value: string | null) {
  if (!value) return "No due date";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "Invalid due date";

  const [, year, month, day] = match;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(Number(year), Number(month) - 1, Number(day)),
  );
}

export function taskStatusLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function markdownExcerpt(value: string, maximum = 240) {
  const plainText = value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-+*>]\s+/gm, "")
    .replace(/[~*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!plainText) return "No description provided.";
  return plainText.length > maximum
    ? `${plainText.slice(0, maximum - 1).trimEnd()}…`
    : plainText;
}
