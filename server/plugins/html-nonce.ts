function addNonce(html: string, nonce: string) {
  return html.replace(
    /<script(?![^>]*\bnonce=)([^>]*)>/gi,
    `<script nonce="${nonce}"$1>`,
  );
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("render:html", (html, { event }) => {
    const nonce = (event.context as Record<string, unknown>).cspNonce;
    if (typeof nonce !== "string" || !nonce) return;
    for (const key of ["head", "bodyPrepend", "body", "bodyAppend"] as const) {
      const value = html[key];
      if (Array.isArray(value)) {
        html[key] = value.map((chunk) =>
          typeof chunk === "string" ? addNonce(chunk, nonce) : chunk,
        );
      }
    }
  });

  nitroApp.hooks.hook("render:html:chunk", (context, { event }) => {
    const nonce = (event.context as Record<string, unknown>).cspNonce;
    if (typeof nonce !== "string" || !nonce) return;
    context.chunk = addNonce(context.chunk, nonce);
  });
});
