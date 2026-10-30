export function escapeTagLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}
