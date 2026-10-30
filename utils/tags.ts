import type { TagColor } from "~/shared/contracts";

export const tagColorOptions: Array<{
  value: TagColor;
  label: string;
  color: string;
}> = [
  { value: "blue", label: "Blue", color: "var(--el-color-primary)" },
  { value: "green", label: "Green", color: "var(--el-color-success)" },
  { value: "amber", label: "Amber", color: "var(--el-color-warning)" },
  { value: "red", label: "Red", color: "var(--el-color-danger)" },
  { value: "gray", label: "Gray", color: "var(--el-color-info)" },
  { value: "purple", label: "Purple", color: "#8b5cf6" },
];

export function tagColorValue(color: TagColor) {
  return tagColorOptions.find((option) => option.value === color)?.color ??
    "var(--el-color-info)";
}
