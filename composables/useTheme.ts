export type ThemePreference = "system" | "light" | "dark"

const STORAGE_KEY = "bisz-portal-theme"
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)"

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark"
}

export function useTheme() {
  const preference = useState<ThemePreference>("theme-preference", () => "system")
  const systemDark = useState<boolean>("system-theme-dark", () => false)
  const initialized = useState<boolean>("theme-initialized", () => false)

  const resolvedTheme = computed<"light" | "dark">(() => (
    preference.value === "system"
      ? (systemDark.value ? "dark" : "light")
      : preference.value
  ))

  function applyTheme() {
    if (!import.meta.client) return

    const isDark = resolvedTheme.value === "dark"
    document.documentElement.classList.toggle("dark", isDark)
    document.documentElement.style.colorScheme = resolvedTheme.value
  }

  function setTheme(nextPreference: ThemePreference) {
    preference.value = nextPreference

    if (import.meta.client) {
      try {
        localStorage.setItem(STORAGE_KEY, nextPreference)
      } catch {
        // Theme switching still works when storage is blocked.
      }
      applyTheme()
    }
  }

  function initializeTheme() {
    if (!import.meta.client || initialized.value) return

    const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY)
    let storedPreference: string | null = null

    try {
      storedPreference = localStorage.getItem(STORAGE_KEY)
    } catch {
      // Fall back to the system preference when storage is unavailable.
    }

    preference.value = isThemePreference(storedPreference) ? storedPreference : "system"
    systemDark.value = mediaQuery.matches
    initialized.value = true
    applyTheme()

    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      systemDark.value = event.matches
      if (preference.value === "system") applyTheme()
    }

    mediaQuery.addEventListener("change", handleSystemThemeChange)
    onScopeDispose(() => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange)
      initialized.value = false
    })
  }

  return {
    preference: readonly(preference),
    resolvedTheme,
    initializeTheme,
    setTheme,
  }
}
