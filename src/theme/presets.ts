import type { ConfigProviderThemeVars } from "@wot-ui/ui";

export type BackgroundThemeId =
  | "moonlight"
  | "willow"
  | "ink"
  | "qingdai"
  | "zhehuang"
  | "shuise"
  | "qingbai"
  | "ciqing"
  | "zhizi"
  | "wuxinlv"
  | "zhushi"
  | "chase"
  | "shanhuzhu"
  | "liaoqing"
  | "haitianxia";

interface TextColors {
  main: string;
  secondary: string;
  auxiliary: string;
}

interface ThemeAccent {
  primary6: string;
  primary7: string;
  buttonBg: string;
  buttonBgActive: string;
  successBg: string;
  successBgActive: string;
  buttonMainColor: string;
}

export interface BackgroundThemePreset {
  id: BackgroundThemeId;
  name: string;
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

/** ponytail: 相对亮度阈值，足够覆盖主题色块对比度 */
function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function pickButtonMainColor(...backgrounds: string[]) {
  const darkest = Math.min(...backgrounds.map(relativeLuminance));
  return darkest > 0.55 ? "#2c2c2c" : "#ffffff";
}

function createTheme(
  id: BackgroundThemeId,
  name: string,
  bg: string,
  mode: "light" | "dark",
  text: TextColors,
  surface: { oppo: string; content: string; border: string },
  accent: ThemeAccent,
): BackgroundThemePreset {
  return {
    id,
    name,
    color: bg,
    mode,
    themeVars: {
      filledBottom: bg,
      filledOppo: surface.oppo,
      filledContent: surface.content,
      textMain: text.main,
      textSecondary: text.secondary,
      textAuxiliary: text.auxiliary,
      borderMain: surface.border,
      primary6: accent.primary6,
      primary7: accent.primary7,
      buttonPrimaryBg: accent.buttonBg,
      buttonPrimaryBgActive: accent.buttonBgActive,
      buttonPrimaryColor: accent.buttonBg,
      buttonPrimaryColorActive: accent.buttonBgActive,
      buttonMainColor: accent.buttonMainColor,
      buttonSuccessBg: accent.successBg,
      buttonSuccessBgActive: accent.successBgActive,
      buttonSuccessColor: accent.successBg,
      buttonSuccessColorActive: accent.successBgActive,
      successMain: accent.successBg,
      successClicked: accent.successBgActive,
    },
    pageChrome: {
      frontColor: mode === "light" ? "#000000" : "#ffffff",
      backgroundColor: bg,
      backgroundColorTop: bg,
      backgroundColorBottom: bg,
    },
  };
}

/** 选中色跟随文字色系；Primary / Success 各两档深浅，且彼此可区分 */
function themeAccent(
  text: TextColors,
  buttonBg: string,
  buttonBgActive: string,
  successBg: string,
  successBgActive: string,
): ThemeAccent {
  return {
    primary6: text.main,
    primary7: text.secondary,
    buttonBg,
    buttonBgActive,
    successBg,
    successBgActive,
    buttonMainColor: pickButtonMainColor(buttonBg, successBg),
  };
}

export const backgroundThemePresets: Record<BackgroundThemeId, BackgroundThemePreset> = {
  moonlight: createTheme(
    "moonlight",
    "月光",
    "#f5f5f5",
    "light",
    { main: "#3d3d3d", secondary: "#666666", auxiliary: "#999999" },
    { oppo: "#ffffff", content: "#ffffff", border: "#d8d8d8" },
    // 主题主色调搭配说明:
    // text: 主文字色(main)、次文字色(secondary)、辅助文字色(auxiliary)
    // buttonBg: 主要按钮背景色（正常态）
    // buttonBgActive: 主要按钮背景色（点击态/高亮）
    // successBg: “成功”相关元素的主色（正常态，和主色系有区分）
    // successBgActive: “成功”状态的深色或高亮色
    themeAccent(
      { main: "#3d3d3d", secondary: "#666666", auxiliary: "#999999" }, // 文字主色/次色/辅助色
      "#3d3d3d", // 按钮主色（正常）— 深灰，与 #f5f5f5 背景对比清晰
      "#2c2c2c", // 按钮主色（点击/高亮）
      "#666666", // 成功状态主色（正常）— 中灰，与 Primary 区分
      "#4d4d4d", // 成功状态主色（高亮/点击）
    ),
  ),
  willow: createTheme(
    "willow",
    "柳绿",
    "#83ad28",
    "dark",
    { main: "#ffffff", secondary: "#eef5e6", auxiliary: "#d4e8b8" },
    { oppo: "#759f24", content: "#8fb82e", border: "#6b921f" },
    themeAccent(
      { main: "#ffffff", secondary: "#eef5e6", auxiliary: "#d4e8b8" },
      "#1c2d25",
      "#0f1814",
      "#4a6614",
      "#3a5210",
    ),
  ),
  ink: createTheme(
    "ink",
    "墨绿",
    "#1c2d25",
    "dark",
    { main: "#e8efe6", secondary: "#b4c2b8", auxiliary: "#8a9a8f" },
    { oppo: "#243830", content: "#243830", border: "#2a4238" },
    themeAccent(
      { main: "#e8efe6", secondary: "#b4c2b8", auxiliary: "#8a9a8f" },
      "#357a72",
      "#2a635c",
      "#4a6258",
      "#3d5248",
    ),
  ),
  qingdai: createTheme(
    "qingdai",
    "青黛",
    "#43465f",
    "dark",
    { main: "#e8e9ef", secondary: "#c2c4ce", auxiliary: "#9498a8" },
    { oppo: "#3a3d52", content: "#4a4d62", border: "#565972" },
    themeAccent(
      { main: "#e8e9ef", secondary: "#c2c4ce", auxiliary: "#9498a8" },
      "#6a6d82",
      "#565972",
      "#4a4d62",
      "#3a3d52",
    ),
  ),
  zhehuang: createTheme(
    "zhehuang",
    "柘黄",
    "#e4152b",
    "dark",
    { main: "#ffffff", secondary: "#ffe5e8", auxiliary: "#ffb8c0" },
    { oppo: "#c91226", content: "#d41428", border: "#a80f1f" },
    themeAccent(
      { main: "#ffffff", secondary: "#ffe5e8", auxiliary: "#ffb8c0" },
      "#a80f1f",
      "#8a0c19",
      "#c91226",
      "#a80f1f",
    ),
  ),
  shuise: createTheme(
    "shuise",
    "水色",
    "#75878a",
    "dark",
    { main: "#f5f8f9", secondary: "#d8e0e2", auxiliary: "#b0bec2" },
    { oppo: "#667a7d", content: "#6d8184", border: "#5a6e71" },
    themeAccent(
      { main: "#f5f8f9", secondary: "#d8e0e2", auxiliary: "#b0bec2" },
      "#4a5c5f",
      "#3a4a4d",
      "#6d8184",
      "#5a6e71",
    ),
  ),
  qingbai: createTheme(
    "qingbai",
    "清白",
    "#cac9be",
    "light",
    { main: "#2c2b28", secondary: "#4a4944", auxiliary: "#6d6c65" },
    { oppo: "#deddd4", content: "#e8e7de", border: "#989788" },
    themeAccent(
      { main: "#2c2b28", secondary: "#4a4944", auxiliary: "#6d6c65" },
      "#2c2b28",
      "#1a1918",
      "#6d6c65",
      "#4a4944",
    ),
  ),
  ciqing: createTheme(
    "ciqing",
    "瓷青",
    "#afdde0",
    "light",
    { main: "#1a3a3d", secondary: "#3d5c5f", auxiliary: "#5a787b" },
    { oppo: "#9dd0d3", content: "#b8e8eb", border: "#6eb3b8" },
    themeAccent(
      { main: "#1a3a3d", secondary: "#3d5c5f", auxiliary: "#5a787b" },
      "#1a3a3d",
      "#0f2528",
      "#5a787b",
      "#3d5c5f",
    ),
  ),
  zhizi: createTheme(
    "zhizi",
    "栀子",
    "#fdd876",
    "light",
    { main: "#4a3f10", secondary: "#6d5f20", auxiliary: "#8a7830" },
    { oppo: "#fceb9a", content: "#fef0b0", border: "#e8c860" },
    themeAccent(
      { main: "#4a3f10", secondary: "#6d5f20", auxiliary: "#8a7830" },
      "#4a3f10",
      "#3a3210",
      "#c99820",
      "#a87a18",
    ),
  ),
  wuxinlv: createTheme(
    "wuxinlv",
    "无心绿",
    "#bfd1b2",
    "light",
    { main: "#2a3d22", secondary: "#455a3a", auxiliary: "#5f7552" },
    { oppo: "#afc5a4", content: "#d0e0c8", border: "#8fab82" },
    themeAccent(
      { main: "#2a3d22", secondary: "#455a3a", auxiliary: "#5f7552" },
      "#2a3d22",
      "#1a2818",
      "#5f7552",
      "#455a3a",
    ),
  ),
  zhushi: createTheme(
    "zhushi",
    "朱柿",
    "#dc541b",
    "dark",
    { main: "#ffffff", secondary: "#ffe8dc", auxiliary: "#ffccb8" },
    { oppo: "#c44a18", content: "#e05e28", border: "#a83e12" },
    themeAccent(
      { main: "#ffffff", secondary: "#ffe8dc", auxiliary: "#ffccb8" },
      "#a83e12",
      "#8a3210",
      "#c44a18",
      "#a83e12",
    ),
  ),
  chase: createTheme(
    "chase",
    "茶色",
    "#b3b37a",
    "light",
    { main: "#2a2a1a", secondary: "#454530", auxiliary: "#606048" },
    { oppo: "#a3a368", content: "#c4c490", border: "#939360" },
    themeAccent(
      { main: "#2a2a1a", secondary: "#454530", auxiliary: "#606048" },
      "#2a2a1a",
      "#1a1a10",
      "#606048",
      "#454530",
    ),
  ),
  shanhuzhu: createTheme(
    "shanhuzhu",
    "珊瑚珠",
    "#bb5148",
    "dark",
    { main: "#ffffff", secondary: "#ffe8e6", auxiliary: "#ffc8c4" },
    { oppo: "#a84840", content: "#c86058", border: "#943e38" },
    themeAccent(
      { main: "#ffffff", secondary: "#ffe8e6", auxiliary: "#ffc8c4" },
      "#943e38",
      "#7a322e",
      "#a84840",
      "#943e38",
    ),
  ),
  liaoqing: createTheme(
    "liaoqing",
    "蓼青",
    "#479f94",
    "dark",
    { main: "#ffffff", secondary: "#dff5f2", auxiliary: "#b8e8e0" },
    { oppo: "#3d8f84", content: "#52aba0", border: "#357a72" },
    themeAccent(
      { main: "#ffffff", secondary: "#dff5f2", auxiliary: "#b8e8e0" },
      "#2a635c",
      "#1f4f48",
      "#357a72",
      "#2a635c",
    ),
  ),
  haitianxia: createTheme(
    "haitianxia",
    "海天霞",
    "#9d8b8e",
    "dark",
    { main: "#ffffff", secondary: "#f5eef0", auxiliary: "#e0d4d6" },
    { oppo: "#8a787b", content: "#a8999c", border: "#7a686b" },
    themeAccent(
      { main: "#ffffff", secondary: "#f5eef0", auxiliary: "#e0d4d6" },
      "#685658",
      "#554648",
      "#7a686b",
      "#685658",
    ),
  ),
};

export const backgroundThemeOptions = Object.values(backgroundThemePresets);
