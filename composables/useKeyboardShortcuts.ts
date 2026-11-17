import { useCommandPalette } from "~/composables/useCommandPalette";

const routes: Record<string, string> = {
  o: "/",
  t: "/tasks",
  p: "/projects",
  i: "/incidents",
  c: "/calendar",
  a: "/assets",
  u: "/users",
  s: "/settings",
};

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

export function useKeyboardShortcuts() {
  const { toggle } = useCommandPalette();
  const helpVisible = useState("shortcut-help-visible", () => false);
  let prefix = "";
  let prefixTimer: ReturnType<typeof setTimeout> | undefined;

  function onKeydown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === "/") {
      event.preventDefault();
      toggle();
      return;
    }
    if (event.key === "?") {
      event.preventDefault();
      helpVisible.value = true;
      return;
    }
    if (prefix === "g") {
      const route = routes[key];
      prefix = "";
      if (prefixTimer) clearTimeout(prefixTimer);
      if (route) {
        event.preventDefault();
        void navigateTo(route);
      }
      return;
    }
    if (key === "g") {
      prefix = "g";
      if (prefixTimer) clearTimeout(prefixTimer);
      prefixTimer = setTimeout(() => {
        prefix = "";
      }, 1200);
    }
  }

  if (import.meta.client) {
    window.addEventListener("keydown", onKeydown);
  }
  onBeforeUnmount(() => {
    if (import.meta.client) window.removeEventListener("keydown", onKeydown);
    if (prefixTimer) clearTimeout(prefixTimer);
  });

  return { helpVisible };
}
