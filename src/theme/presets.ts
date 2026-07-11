import type { ConfigProviderThemeVars } from "@wot-ui/ui";

/**
 * 十套中式传统色 UI 主题
 * 数据源：中式传统色彩10套UI配色方案.md / 中式传统色彩UI配色方案.md / chinese-color-10themes.html
 */
export type BackgroundThemeId =
  | "cuiwei"
  | "dongfang"
  | "xuantian"
  | "shiyangjin"
  | "shanhu"
  | "chayun"
  | "qinglian"
  | "taiqing"
  | "liuli"
  | "moyun";

interface ThemePalette {
  bgPage: string;
  bgCard: string;
  bgElevated: string;
  inkPrimary: string;
  inkSecondary: string;
  inkTertiary: string;
  primary: string;
  primaryHover: string;
  accent: string;
  accentHover: string;
  accentText: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  border: string;
}

export interface BackgroundThemePreset {
  id: BackgroundThemeId;
  name: string;
  subtitle: string;
  color: string;
  mode: "light" | "dark";
  themeVars: ConfigProviderThemeVars;
  pageChrome: {
    frontColor: "#000000" | "#ffffff";
    backgroundColor: string;
    backgroundColorTop: string;
    backgroundColorBottom: string;
  };
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function pickOnColor(bg: string) {
  const { r, g, b } = hexToRgb(bg);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#2e201d" : "#ffffff";
}

function darkenHex(hex: string, amount = 0.12) {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 - amount;
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value * factor)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function rgbaHex(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createTheme(
  id: BackgroundThemeId,
  name: string,
  subtitle: string,
  mode: "light" | "dark",
  palette: ThemePalette,
): BackgroundThemePreset {
  const successActive = darkenHex(palette.success);
  const warningActive = darkenHex(palette.warning);
  const dangerActive = darkenHex(palette.danger);
  const infoActive = darkenHex(palette.info);

  return {
    id,
    name,
    subtitle,
    color: palette.bgPage,
    mode,
    themeVars: {
      filledBottom: palette.bgPage,
      filledOppo: palette.bgElevated,
      filledContent: palette.bgCard,
      textMain: palette.inkPrimary,
      textSecondary: palette.inkSecondary,
      textAuxiliary: palette.inkTertiary,
      borderMain: palette.border,
      borderLight: rgbaHex(palette.border, mode === "dark" ? 0.4 : 0.5),
      dividerMain: rgbaHex(palette.border, 0.35),
      dividerLight: rgbaHex(palette.border, 0.2),
      primary6: palette.inkPrimary,
      primary7: palette.inkSecondary,
      buttonPrimaryBg: palette.accent,
      buttonPrimaryBgActive: palette.accentHover,
      buttonPrimaryColor: palette.accent,
      buttonPrimaryColorActive: palette.accentHover,
      buttonPrimarySoftBg: rgbaHex(palette.accent, mode === "dark" ? 0.15 : 0.12),
      buttonMainColor: palette.accentText,
      buttonSuccessBg: palette.success,
      buttonSuccessBgActive: successActive,
      buttonSuccessColor: palette.success,
      buttonSuccessColorActive: successActive,
      successMain: palette.success,
      successClicked: successActive,
      buttonWarningBg: palette.warning,
      buttonWarningBgActive: warningActive,
      buttonWarningColor: palette.warning,
      buttonWarningColorActive: warningActive,
      warningMain: palette.warning,
      warningClicked: warningActive,
      buttonDangerBg: palette.danger,
      buttonDangerBgActive: dangerActive,
      buttonDangerColor: palette.danger,
      buttonDangerColorActive: dangerActive,
      dangerMain: palette.danger,
      dangerClicked: dangerActive,
      buttonInfoBg: palette.info,
      buttonInfoBgActive: infoActive,
      buttonInfoColor: pickOnColor(palette.info),
      buttonInfoColorActive: pickOnColor(infoActive),
      tabbarBg: palette.bgPage,
      tabbarItemColorActive: palette.inkPrimary,
      tabbarItemColorInactive: palette.inkTertiary,
    },
    pageChrome: {
      frontColor: mode === "light" ? "#000000" : "#ffffff",
      backgroundColor: palette.bgPage,
      backgroundColorTop: palette.bgPage,
      backgroundColorBottom: palette.bgPage,
    },
  };
}

export const backgroundThemePresets: Record<BackgroundThemeId, BackgroundThemePreset> = {
  cuiwei: createTheme("cuiwei", "翠微新绿", "自然清新", "light", {
    bgPage: "#bfd1b2",
    bgCard: "#c1e2cf",
    bgElevated: "#d4ebdf",
    inkPrimary: "#2e201d",
    inkSecondary: "#4a4548",
    inkTertiary: "#576470",
    primary: "#1c2d29",
    primaryHover: "#2a4540",
    accent: "#dc541b",
    accentHover: "#c44a18",
    accentText: "#ffffff",
    success: "#83ad28",
    warning: "#edac5d",
    danger: "#d64241",
    info: "#5b8b71",
    border: "#93bdad",
  }),
  dongfang: createTheme("dongfang", "东方既白", "清雅蓝调", "light", {
    bgPage: "#d3e5ef",
    bgCard: "#afdde0",
    bgElevated: "#c5e5e8",
    inkPrimary: "#2e201d",
    inkSecondary: "#576470",
    inkTertiary: "#75878a",
    primary: "#16304b",
    primaryHover: "#234a6f",
    accent: "#c36f4d",
    accentHover: "#a85e40",
    accentText: "#ffffff",
    success: "#479f94",
    warning: "#e5a84b",
    danger: "#d11313",
    info: "#277d93",
    border: "#75878a",
  }),
  xuantian: createTheme("xuantian", "玄天黑土", "暗色高雅", "dark", {
    bgPage: "#2e201d",
    bgCard: "#4a4548",
    bgElevated: "#5a5558",
    inkPrimary: "#cac9be",
    inkSecondary: "#b2b6b6",
    inkTertiary: "#9b9690",
    primary: "#cac9be",
    primaryHover: "#dddcd0",
    accent: "#e4a01d",
    accentHover: "#c48a18",
    accentText: "#2e201d",
    success: "#5b8b71",
    warning: "#edac5d",
    danger: "#a55d51",
    info: "#576470",
    border: "#4a4548",
  }),
  shiyangjin: createTheme("shiyangjin", "十樣錦", "暖调雅致", "light", {
    bgPage: "#cac9be",
    bgCard: "#b2b6b6",
    bgElevated: "#c4c8c8",
    inkPrimary: "#2e201d",
    inkSecondary: "#4a4548",
    inkTertiary: "#9d8b8e",
    primary: "#2e201d",
    primaryHover: "#4a3632",
    accent: "#af231c",
    accentHover: "#8f1c16",
    accentText: "#ffffff",
    success: "#3c5840",
    warning: "#e4a01d",
    danger: "#d11313",
    info: "#af6f60",
    border: "#9b9690",
  }),
  shanhu: createTheme("shanhu", "珊瑚暖阳", "热情活泼", "light", {
    bgPage: "#f8c6b5",
    bgCard: "#d3e5ef",
    bgElevated: "#ede0d6",
    inkPrimary: "#2e201d",
    inkSecondary: "#4a4548",
    inkTertiary: "#9d8b8e",
    primary: "#8d373b",
    primaryHover: "#6b2c2f",
    accent: "#bb5148",
    accentHover: "#9e443d",
    accentText: "#ffffff",
    success: "#479f94",
    warning: "#e5a84b",
    danger: "#d11313",
    info: "#277d93",
    border: "#9b9690",
  }),
  chayun: createTheme("chayun", "茶韵清烟", "文艺素雅", "light", {
    bgPage: "#b3b37a",
    bgCard: "#bfd1b2",
    bgElevated: "#d0d4a0",
    inkPrimary: "#2e201d",
    inkSecondary: "#4a4548",
    inkTertiary: "#8c4f35",
    primary: "#1c2d25",
    primaryHover: "#2a4538",
    accent: "#8c4f35",
    accentHover: "#734230",
    accentText: "#ffffff",
    success: "#5b8b71",
    warning: "#e5a84b",
    danger: "#d64241",
    info: "#475c4e",
    border: "#93bdad",
  }),
  qinglian: createTheme("qinglian", "青蓮暮色", "神秘优雅", "light", {
    bgPage: "#cac9be",
    bgCard: "#a59aca",
    bgElevated: "#b8b7d4",
    inkPrimary: "#2e201d",
    inkSecondary: "#43465f",
    inkTertiary: "#75878a",
    primary: "#43465f",
    primaryHover: "#5a5d7a",
    accent: "#7b5aa3",
    accentHover: "#654a87",
    accentText: "#ffffff",
    success: "#5b8b71",
    warning: "#edac5d",
    danger: "#d64241",
    info: "#277d93",
    border: "#75878a",
  }),
  taiqing: createTheme("taiqing", "苔青幽谷", "深沉静谧", "light", {
    bgPage: "#cac9be",
    bgCard: "#b3b37a",
    bgElevated: "#c4c4a0",
    inkPrimary: "#2e201d",
    inkSecondary: "#475c4e",
    inkTertiary: "#576470",
    primary: "#1c2d29",
    primaryHover: "#2a4540",
    accent: "#06786a",
    accentHover: "#055e54",
    accentText: "#ffffff",
    success: "#83ad28",
    warning: "#e5a84b",
    danger: "#d64241",
    info: "#475c4e",
    border: "#93bdad",
  }),
  liuli: createTheme("liuli", "琉璃金辉", "华丽富贵", "light", {
    bgPage: "#fdd876",
    bgCard: "#edac5d",
    bgElevated: "#f5e4a0",
    inkPrimary: "#2e201d",
    inkSecondary: "#576470",
    inkTertiary: "#8c4f35",
    primary: "#8c4f35",
    primaryHover: "#6b3d2a",
    accent: "#e4a01d",
    accentHover: "#c48a18",
    accentText: "#2e201d",
    success: "#479f94",
    warning: "#8c4f35",
    danger: "#d11313",
    info: "#af6f60",
    border: "#b5906b",
  }),
  moyun: createTheme("moyun", "墨韵书香", "沉稳典雅", "dark", {
    bgPage: "#131824",
    bgCard: "#1c2d29",
    bgElevated: "#2a3f39",
    inkPrimary: "#d3e5ef",
    inkSecondary: "#93bdad",
    inkTertiary: "#75878a",
    primary: "#d3e5ef",
    primaryHover: "#afdde0",
    accent: "#dc541b",
    accentHover: "#c44a18",
    accentText: "#ffffff",
    success: "#83ad28",
    warning: "#edac5d",
    danger: "#d11313",
    info: "#0f6b99",
    border: "#3a3c5b",
  }),
};

export const backgroundThemeOptions = Object.values(backgroundThemePresets);
