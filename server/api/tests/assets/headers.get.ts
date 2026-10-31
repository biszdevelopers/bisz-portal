const testAssets = {
  "180p": "https://assets.bisz.dev/a6426b84c6fa1b1874709695ff2fd8fdd320cfc9a8bb7ee1bdb19dd0906a6c72",
  "360p": "https://assets.bisz.dev/992ae190669a6ec3c1898480604638f825444156960e3afdc99a53093fbb1653",
  "720p": "https://assets.bisz.dev/23595e64e13368a375ea801c6fdd1acc3b6dd8cf8014a9e3b4a10c2587b2cec2",
  "1080p": "https://assets.bisz.dev/04943c9afecfa3c8c87729c9a5bbda6456b2011013d1fccb37d696893c434289",
} as const;

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "Cache-Control", "no-store, max-age=0");
  const query = getQuery(event);
  const quality = String(query.quality ?? "");
  if (!Object.prototype.hasOwnProperty.call(testAssets, quality)) {
    throw createError({ statusCode: 400, statusMessage: "Unknown test asset quality" });
  }

  const target = new URL(testAssets[quality as keyof typeof testAssets]);
  const startedAt = performance.now();
  const response = await fetch(target, {
    method: "GET",
    headers: {
      Accept: "video/*",
    },
  });
  await response.body?.cancel();

  return {
    status: response.status,
    durationMs: performance.now() - startedAt,
    headers: Object.fromEntries(response.headers.entries()),
  };
});
