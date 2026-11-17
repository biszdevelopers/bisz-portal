export function isSameOriginRequest(input: {
  origin: string | undefined;
  fetchSite: string | undefined;
  portalOrigin: string;
}) {
  return (
    (!input.origin || input.origin === input.portalOrigin) &&
    input.fetchSite !== "cross-site"
  );
}

export function isCsrfExemptPath(path: string) {
  return path.startsWith("/api/auth/callback/");
}
