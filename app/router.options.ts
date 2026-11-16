const mainSelector = "#main-content";

function scrollMainTo(top: number) {
  const main = document.querySelector<HTMLElement>(mainSelector);
  if (!main) return;
  main.scrollTo({ top, behavior: "auto" });
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
      const id = to.hash ? decodeURIComponent(to.hash.slice(1)) : "";
      const target = id ? document.getElementById(id) : null;
      target?.scrollIntoView({ block: "start" });
      return false;
    }

    const top = savedPosition?.top ?? 0;
    requestAnimationFrame(() => {
      const id = to.hash ? decodeURIComponent(to.hash.slice(1)) : "";
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
