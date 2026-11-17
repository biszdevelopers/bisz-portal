const mobileQuery = "(max-width: 767px)";
const tabletQuery = "(min-width: 768px) and (max-width: 1023px)";

const isMobile = ref(false);
const isTablet = ref(false);
const isDesktop = ref(true);
let listening = false;

function updateViewport() {
  if (!import.meta.client) return;
  isMobile.value = window.matchMedia(mobileQuery).matches;
  isTablet.value = window.matchMedia(tabletQuery).matches;
  isDesktop.value = !isMobile.value && !isTablet.value;
}

export function useViewport() {
  if (import.meta.client && !listening) {
    listening = true;
    updateViewport();
    window.addEventListener("resize", updateViewport, { passive: true });
    window.addEventListener("orientationchange", updateViewport, {
      passive: true,
    });
  }

  return { isMobile, isTablet, isDesktop };
}
