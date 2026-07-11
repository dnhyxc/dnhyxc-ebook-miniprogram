import { computed, ref, watch } from "vue";

export type ReaderPaperTheme = "white" | "sepia" | "green" | "dark";

const FONT_KEY = "reader-font-size";
const PAPER_KEY = "reader-paper-theme";

const paperStyles: Record<ReaderPaperTheme, { bg: string; fg: string }> = {
  white: { bg: "#ffffff", fg: "#1a1a1a" },
  sepia: { bg: "#f4ecd8", fg: "#5c4b37" },
  green: { bg: "#cce8cf", fg: "#2d4a32" },
  dark: { bg: "#1c1c1e", fg: "#e5e5ea" },
};

function loadFontSize(): number {
  const v = Number(uni.getStorageSync(FONT_KEY));
  return v >= 14 && v <= 24 ? v : 18;
}

function loadPaper(): ReaderPaperTheme {
  const v = uni.getStorageSync(PAPER_KEY) as ReaderPaperTheme;
  return v in paperStyles ? v : "white";
}

const fontSize = ref(loadFontSize());
const paperTheme = ref<ReaderPaperTheme>(loadPaper());

watch(fontSize, (v) => uni.setStorageSync(FONT_KEY, v));
watch(paperTheme, (v) => uni.setStorageSync(PAPER_KEY, v));

export function useReaderSettings() {
  const readerStyle = computed(() => {
    const paper = paperStyles[paperTheme.value];
    return {
      backgroundColor: paper.bg,
      color: paper.fg,
      fontSize: `${fontSize.value}px`,
      lineHeight: 1.75,
    };
  });

  function bumpFontSize(delta: number) {
    fontSize.value = Math.min(24, Math.max(14, fontSize.value + delta));
  }

  return {
    fontSize,
    paperTheme,
    readerStyle,
    bumpFontSize,
    paperOptions: [
      { value: "white" as const, label: "默认" },
      { value: "sepia" as const, label: "护眼" },
      { value: "green" as const, label: "绿色" },
      { value: "dark" as const, label: "夜间" },
    ],
  };
}
