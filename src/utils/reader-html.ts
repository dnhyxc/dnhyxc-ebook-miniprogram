const READER_STRIP_PROPS = new Set([
  "color",
  "background",
  "background-color",
  "text-align",
  "text-align-last",
  "text-justify",
]);

/** 去掉 EPUB 内联颜色与对齐，阅读主题才能即时控制字色与两端对齐 */
export function stripReaderColorStyles(html: string): string {
  return html
    .replace(/<font\b([^>]*)\s+color\s*=\s*["'][^"']*["']([^>]*)>/gi, "<font$1$2>")
    .replace(/\s+color\s*=\s*["'][^"']*["']/gi, "")
    .replace(
      /(\sstyle\s*=\s*["'])([^"']*)(["'])/gi,
      (_match, open: string, styles: string, close: string) => {
        const kept = styles
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)
          .filter((s) => !READER_STRIP_PROPS.has(s.split(":")[0]?.trim().toLowerCase() ?? ""));
        return kept.length ? `${open}${kept.join(";")}${close}` : "";
      },
    );
}
