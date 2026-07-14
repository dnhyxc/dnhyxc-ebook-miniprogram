import { computed, ref, watch } from "vue";

export type ReaderPaperTheme = "white" | "sepia" | "green" | "dark";
export type ReaderFontFamily = "system" | "serif" | "sans-serif" | "monospace";
export type ReaderPageMode = "scroll" | "horizontal";

export const lineHeightOptions = [1.4, 1.6, 1.8, 2.0, 2.2] as const;
export type ReaderLineHeight = (typeof lineHeightOptions)[number];

const FONT_KEY = "reader-font-size";
const PAPER_KEY = "reader-paper-theme";
const FONT_FAMILY_KEY = "reader-font-family";
const LINE_HEIGHT_KEY = "reader-line-height";
const LETTER_SPACING_KEY = "reader-letter-spacing";
const PAGE_MODE_KEY = "reader-page-mode";

const paperStyles: Record<ReaderPaperTheme, { bg: string; fg: string; label: string }> = {
  white: { bg: "#ffffff", fg: "#1a1a1a", label: "默认" },
  sepia: { bg: "#f4ecd8", fg: "#5c4b37", label: "护眼" },
  green: { bg: "#cce8cf", fg: "#2d4a32", label: "绿色" },
  dark: { bg: "#1c1c1e", fg: "#e5e5ea", label: "夜间" },
};

const fontFamilyCss: Record<ReaderFontFamily, string> = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  serif: "serif",
  "sans-serif": "sans-serif",
  monospace: "monospace",
};

function loadFontSize(): number {
  const v = Number(uni.getStorageSync(FONT_KEY));
  return v >= 14 && v <= 28 ? v : 18;
}

function loadPaper(): ReaderPaperTheme {
  const v = uni.getStorageSync(PAPER_KEY) as ReaderPaperTheme;
  return v in paperStyles ? v : "white";
}

function loadFontFamily(): ReaderFontFamily {
  const v = uni.getStorageSync(FONT_FAMILY_KEY) as ReaderFontFamily;
  return v in fontFamilyCss ? v : "system";
}

function loadLineHeight(): ReaderLineHeight {
  const v = Number(uni.getStorageSync(LINE_HEIGHT_KEY));
  return (lineHeightOptions as readonly number[]).includes(v) ? (v as ReaderLineHeight) : 1.8;
}

function loadLetterSpacing(): number {
  const v = Number(uni.getStorageSync(LETTER_SPACING_KEY));
  return v >= 0 && v <= 4 ? v : 0;
}

function loadPageMode(): ReaderPageMode {
  const v = uni.getStorageSync(PAGE_MODE_KEY) as ReaderPageMode;
  return v === "horizontal" ? v : "scroll";
}

const fontSize = ref(loadFontSize());
const paperTheme = ref<ReaderPaperTheme>(loadPaper());
const fontFamily = ref<ReaderFontFamily>(loadFontFamily());
const lineHeight = ref<ReaderLineHeight>(loadLineHeight());
const letterSpacing = ref(loadLetterSpacing());
const pageMode = ref<ReaderPageMode>(loadPageMode());

watch(fontSize, (v) => uni.setStorageSync(FONT_KEY, v));
watch(paperTheme, (v) => uni.setStorageSync(PAPER_KEY, v));
watch(fontFamily, (v) => uni.setStorageSync(FONT_FAMILY_KEY, v));
watch(lineHeight, (v) => uni.setStorageSync(LINE_HEIGHT_KEY, v));
watch(letterSpacing, (v) => uni.setStorageSync(LETTER_SPACING_KEY, v));
watch(pageMode, (v) => uni.setStorageSync(PAGE_MODE_KEY, v));

export const fontFamilies: { value: ReaderFontFamily; label: string }[] = [
  { value: "system", label: "系统" },
  { value: "serif", label: "宋体" },
  { value: "sans-serif", label: "黑体" },
  { value: "monospace", label: "等宽" },
];

export function useReaderSettings() {
  const readerStyle = computed(() => {
    const paper = paperStyles[paperTheme.value];
    return {
      backgroundColor: paper.bg,
      color: paper.fg,
      fontSize: `${fontSize.value}px`,
      fontFamily: fontFamilyCss[fontFamily.value],
      lineHeight: lineHeight.value,
      letterSpacing: `${letterSpacing.value}px`,
    };
  });

  const mpTagStyle = computed(() => {
    const color = `color:${readerStyle.value.color} !important`;
    const justify =
      "text-align:justify !important;text-justify:inter-ideograph;text-align-last:left";
    const textBase = `line-height:${lineHeight.value};font-size:${fontSize.value}px;${color};${justify}`;
    return {
      p: `margin:0 0 1em;${textBase}`,
      div: textBase,
      span: textBase,
      li: textBase,
      a: textBase,
      h1: `font-size:${fontSize.value + 8}px;font-weight:600;margin:1em 0 0.5em;${color}`,
      h2: `font-size:${fontSize.value + 6}px;font-weight:600;margin:1em 0 0.5em;${color}`,
      h3: `font-size:${fontSize.value + 4}px;font-weight:600;margin:1em 0 0.5em;${color}`,
      img: "max-width:100%;height:auto;display:block;margin:0.5em 0",
      blockquote: `margin:0.5em 0;padding-left:1em;border-left:3px solid #ccc;${color}`,
    };
  });

  function bumpFontSize(delta: number) {
    fontSize.value = Math.min(28, Math.max(14, fontSize.value + delta));
  }

  function setLineHeight(h: ReaderLineHeight) {
    lineHeight.value = h;
  }

  function setPageMode(mode: ReaderPageMode) {
    if (mode === "horizontal") {
      uni.showToast({ title: "左右翻页即将支持", icon: "none" });
      return;
    }
    pageMode.value = mode;
  }

  return {
    fontSize,
    paperTheme,
    fontFamily,
    lineHeight,
    letterSpacing,
    pageMode,
    readerStyle,
    mpTagStyle,
    bumpFontSize,
    setLineHeight,
    setPageMode,
    fontFamilies,
    lineHeightOptions,
    paperStyles,
    paperOptions: (Object.keys(paperStyles) as ReaderPaperTheme[]).map((value) => ({
      value,
      label: paperStyles[value].label,
    })),
    pageModeOptions: [
      { value: "scroll" as const, label: "上下滚动" },
      { value: "horizontal" as const, label: "左右翻页" },
    ],
  };
}
