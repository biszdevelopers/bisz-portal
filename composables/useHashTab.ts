export function useHashTab(defaultTab: string, validTabs: readonly string[]) {
  const route = useRoute();
  const router = useRouter();
  const activeTab = ref(defaultTab);
  const isValidTab = (value: string) => validTabs.includes(value);

  onMounted(() => {
    const tab = route.hash.slice(1);
    if (isValidTab(tab)) {
      activeTab.value = tab;
      return;
    }
    void router.replace({ hash: `#${defaultTab}` });
  });

  watch(activeTab, (tab) => {
    if (!isValidTab(tab)) return;
    const hash = `#${tab}`;
    if (route.hash !== hash) void router.replace({ hash });
  });

  watch(
    () => route.hash,
    (hash) => {
      const tab = hash.slice(1);
      if (isValidTab(tab) && tab !== activeTab.value) activeTab.value = tab;
    },
  );

  return activeTab;
}
