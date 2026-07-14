import type { ConfigProviderThemeVars } from "@wot-ui/ui";
import { onShow } from "@dcloudio/uni-app";
import { computed, ref, watch, type CSSProperties } from "vue";
import {
  type BackgroundThemeId,
  backgroundThemeOptions,
  backgroundThemePresets,
} from "@/theme/presets";

const STORAGE_KEY = "background-theme-id";

function getStoredThemeId(): BackgroundThemeId {
  const stored = uni.getStorageSync(STORAGE_KEY) as BackgroundThemeId | "";
  if (stored && stored in backgroundThemePresets) return stored;
  return "cuiwei";
}

// ponytail: 模块级状态，保证各 Tab 页背景主题同步
const backgroundThemeId = ref<BackgroundThemeId>(getStoredThemeId());

const activePreset = computed(() => backgroundThemePresets[backgroundThemeId.value]);

const theme = computed(() => activePreset.value.mode);

const themeVars = computed<ConfigProviderThemeVars>(() => activePreset.value.themeVars);

const pageShellStyle = computed<CSSProperties>(() => ({
  minHeight: "100vh",
  backgroundColor: activePreset.value.themeVars.filledBottom,
}));

const themeRootStyle = computed(
  () => `min-height: 100vh; background-color: ${activePreset.value.themeVars.filledBottom};`,
);

const navbarStyle = computed(() => {
  const { filledBottom, textMain } = activePreset.value.themeVars;
  return `background-color: ${filledBottom}; color: ${textMain};`;
});

export function applyPageChrome() {
  const colors = activePreset.value.pageChrome;

  // 自定义导航栏下 frontColor 仅影响状态栏文字颜色
  uni.setNavigationBarColor({
    frontColor: colors.frontColor,
    backgroundColor: colors.backgroundColor,
  });

  uni.setBackgroundColor({
    backgroundColor: colors.backgroundColor,
    backgroundColorTop: colors.backgroundColorTop,
    backgroundColorBottom: colors.backgroundColorBottom,
  });
}

function setBackgroundTheme(id: BackgroundThemeId) {
  backgroundThemeId.value = id;
}

watch(backgroundThemeId, (id) => {
  uni.setStorageSync(STORAGE_KEY, id);
  applyPageChrome();
});

/** 仅读主题色，不改状态栏（阅读/听书页有自己的纸张 chrome） */
export function useThemeAccent() {
  const accentBtnStyle = computed<CSSProperties>(() => ({
    backgroundColor: String(themeVars.value.buttonPrimaryBg ?? ""),
    color: String(themeVars.value.buttonMainColor ?? "#fff"),
  }));

  return { themeVars, accentBtnStyle };
}

export function useTheme() {
  applyPageChrome();

  onShow(() => {
    applyPageChrome();
  });

  return {
    backgroundThemeId,
    backgroundThemeOptions,
    theme,
    themeVars,
    pageShellStyle,
    navbarStyle,
    themeRootStyle,
    setBackgroundTheme,
  };
}
