import type { ConfigProviderThemeVars } from "@wot-ui/ui";
import { ref } from "vue";

export function useTheme(defaultVars?: ConfigProviderThemeVars) {
  const theme = ref<"light" | "dark">("light");
  const themeVars = ref<ConfigProviderThemeVars | undefined>(defaultVars);

  function toggleTheme(mode?: "light" | "dark") {
    theme.value = mode ?? (theme.value === "light" ? "dark" : "light");
  }

  function setThemeVars(vars: ConfigProviderThemeVars) {
    themeVars.value = vars;
  }

  return {
    theme,
    themeVars,
    toggleTheme,
    setThemeVars,
  };
}
