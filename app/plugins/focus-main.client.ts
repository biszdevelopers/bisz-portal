export default defineNuxtPlugin((nuxtApp) => {
  let mounted = false;
  nuxtApp.hook("app:mounted", () => {
    mounted = true;
  });

  nuxtApp.$router.afterEach((to, from, failure) => {
    if (!mounted || failure || to.path === from.path) return;
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>("#main-content")
        ?.focus({ preventScroll: true });
    });
  });
});
