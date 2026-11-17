const mainSelector = "#main-content";

function scrollMainTo(top: number) {
  const main = document.querySelector<HTMLElement>(mainSelector);
  if (!main) return;
  main.scrollTo({ top, behavior: "auto" });
}

function hashId(hash: string) {
  if (!hash) return "";
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return hash.slice(1);
  }
}

export default {
  scrollBehavior(
    to: { path: string; hash: string },
    from: { path: string },
    savedPosition: { top?: number } | null,
  ) {
    if (!import.meta.client) return false;

    const samePath = to.path === from.path;
    if (samePath) {
      const id = hashId(to.hash);
      const target = id ? document.getElementById(id) : null;
      target?.scrollIntoView({ block: "start" });
      return false;
    }

    const top = savedPosition?.top ?? 0;
    requestAnimationFrame(() => {
      const id = hashId(to.hash);
      const target = id ? document.getElementById(id) : null;
      if (target) {
        target.scrollIntoView({ block: "start" });
        return;
      }
      scrollMainTo(top);
    });

    return false;
  },
};
