export function useHashTab(
  defaultTab: string,
  validTabs: readonly string[],
  resolveAnchorTab?: (anchor: string) => string | undefined,
) {
  const route = useRoute();
  const router = useRouter();
  const activeTab = ref(defaultTab);
  const isValidTab = (value: string) => validTabs.includes(value);
  const tabForHash = (hash: string) => {
    const anchor = hash.slice(1);
    return isValidTab(anchor) ? anchor : resolveAnchorTab?.(anchor);
  };

  onMounted(() => {
    const tab = tabForHash(route.hash);
    if (tab) {
      activeTab.value = tab;
      return;
    }
    void router.replace({ hash: `#${defaultTab}` });
  });

  watch(activeTab, (tab) => {
    if (!isValidTab(tab)) return;
    if (tabForHash(route.hash) !== tab) void router.replace({ hash: `#${tab}` });
  });

  watch(
    () => route.hash,
    (hash) => {
      const tab = tabForHash(hash);
      if (tab && tab !== activeTab.value) activeTab.value = tab;
    },
  );

  return activeTab;
}
