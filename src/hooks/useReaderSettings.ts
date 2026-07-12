import { computed, ref, watch } from "vue";

export type ReaderPaperTheme = "white" | "sepia" | "green" | "dark";
export type ReaderFontFamily = "system" | "serif" | "sans-serif" | "monospace";

const FONT_KEY = "reader-font-size";
const PAPER_KEY = "reader-paper-theme";
const FONT_FAMILY_KEY = "reader-font-family";
const LINE_HEIGHT_KEY = "reader-line-height";
const LETTER_SPACING_KEY = "reader-letter-spacing";

const paperStyles: Record<ReaderPaperTheme, { bg: string; fg: string }> = {
  white: { bg: "#ffffff", fg: "#1a1a1a" },
  sepia: { bg: "#f4ecd8", fg: "#5c4b37" },
  green: { bg: "#cce8cf", fg: "#2d4a32" },
  dark: { bg: "#1c1c1e", fg: "#e5e5ea" },
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

function loadLineHeight(): number {
  const v = Number(uni.getStorageSync(LINE_HEIGHT_KEY));
  return [1.4, 1.6, 1.8, 2.0, 2.2].includes(v) ? v : 1.75;
}

function loadLetterSpacing(): number {
  const v = Number(uni.getStorageSync(LETTER_SPACING_KEY));
  return v >= 0 && v <= 4 ? v : 0;
}

const fontSize = ref(loadFontSize());
const paperTheme = ref<ReaderPaperTheme>(loadPaper());
const fontFamily = ref<ReaderFontFamily>(loadFontFamily());
const lineHeight = ref(loadLineHeight());
const letterSpacing = ref(loadLetterSpacing());

watch(fontSize, (v) => uni.setStorageSync(FONT_KEY, v));
watch(paperTheme, (v) => uni.setStorageSync(PAPER_KEY, v));
watch(fontFamily, (v) => uni.setStorageSync(FONT_FAMILY_KEY, v));
watch(lineHeight, (v) => uni.setStorageSync(LINE_HEIGHT_KEY, v));
watch(letterSpacing, (v) => uni.setStorageSync(LETTER_SPACING_KEY, v));

export const lineHeightOptions = [1.4, 1.6, 1.8, 2.0, 2.2] as const;

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

  const mpTagStyle = computed(() => ({
    p: `margin:0 0 1em;line-height:${lineHeight.value};font-size:${fontSize.value}px;color:${readerStyle.value.color}`,
    div: `line-height:${lineHeight.value};font-size:${fontSize.value}px;color:${readerStyle.value.color}`,
    h1: `font-size:${fontSize.value + 8}px;font-weight:600;margin:1em 0 0.5em`,
    h2: `font-size:${fontSize.value + 6}px;font-weight:600;margin:1em 0 0.5em`,
    h3: `font-size:${fontSize.value + 4}px;font-weight:600;margin:1em 0 0.5em`,
    img: "max-width:100%;height:auto;display:block;margin:0.5em 0",
    blockquote: "margin:0.5em 0;padding-left:1em;border-left:3px solid #ccc",
  }));

  function bumpFontSize(delta: number) {
    fontSize.value = Math.min(28, Math.max(14, fontSize.value + delta));
  }

  function setLineHeight(h: number) {
    lineHeight.value = h;
  }

  return {
    fontSize,
    paperTheme,
    fontFamily,
    lineHeight,
    letterSpacing,
    readerStyle,
    mpTagStyle,
    bumpFontSize,
    setLineHeight,
    fontFamilies,
    lineHeightOptions,
    paperOptions: [
      { value: "white" as const, label: "默认" },
      { value: "sepia" as const, label: "护眼" },
      { value: "green" as const, label: "绿色" },
      { value: "dark" as const, label: "夜间" },
    ],
  };
}
