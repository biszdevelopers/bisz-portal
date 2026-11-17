export function useCommandPalette() {
  const visible = useState("command-palette-visible", () => false);
  return {
    visible,
    open: () => {
      visible.value = true;
    },
    close: () => {
      visible.value = false;
    },
    toggle: () => {
      visible.value = !visible.value;
    },
  };
}
