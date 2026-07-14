/** 章节 HTML → 听书纯文本 / 分句（句界算法对齐 Web englishTts） */

export type ListenSentence = {
  text: string;
  index: number;
  /** 在章节纯文本中的起止（与 htmlToPlainText + stripMarkdownForTts 同一坐标系） */
  start: number;
  end: number;
};

export type ChapterHtmlSegment = {
  html: string;
  start: number;
  end: number;
};

/** ponytail: EPUB 章多为平铺块级标签；同名嵌套可能切偏，跟读仍远好于整章估算 */
function splitHtmlIntoBlocks(html: string): string[] {
  const re = /<(p|div|h[1-6]|li|blockquote|table|section|article)(\s[^>]*)?>[\s\S]*?<\/\1\s*>/gi;
  const blocks: string[] = [];
  let last = 0;
  for (;;) {
    const m = re.exec(html);
    if (!m) break;
    if (m.index > last) {
      const gap = html.slice(last, m.index).trim();
      if (gap) blocks.push(gap);
    }
    blocks.push(m[0]);
    last = m.index + m[0].length;
  }
  const tail = html.slice(last).trim();
  if (tail) blocks.push(tail);
  if (!blocks.length && html.trim()) return [html];
  return blocks;
}

/** 控制段数上限，避免一章上百个 mp-html */
function mergeHtmlChunks(chunks: string[], maxSeg: number): string[] {
  if (chunks.length <= maxSeg) return chunks;
  const out = chunks.slice();
  while (out.length > maxSeg) {
    let best = 0;
    let bestLen = Infinity;
    for (let i = 0; i < out.length - 1; i++) {
      const len = (out[i]?.length ?? 0) + (out[i + 1]?.length ?? 0);
      if (len < bestLen) {
        bestLen = len;
        best = i;
      }
    }
    out.splice(best, 2, `${out[best] ?? ""}${out[best + 1] ?? ""}`);
  }
  return out;
}

/**
 * 把章节 HTML 切成块段，并标上与分句相同的纯文本坐标。
 * 外壳用原生 view id 定位，不往 mp-html 里灌锚点。
 */
export function buildChapterHtmlSegments(html: string, maxSeg = 40): ChapterHtmlSegment[] {
  const fullPlain = stripMarkdownForTts(htmlToPlainText(html));
  const chunks = mergeHtmlChunks(splitHtmlIntoBlocks(html), maxSeg);
  if (!chunks.length) return [{ html: html || "", start: 0, end: fullPlain.length }];
  if (!fullPlain) {
    return chunks.map((chunk) => ({ html: chunk, start: 0, end: 0 }));
  }

  let from = 0;
  const segs: ChapterHtmlSegment[] = [];
  for (const chunk of chunks) {
    const piece = stripMarkdownForTts(htmlToPlainText(chunk));
    if (!piece) {
      segs.push({ html: chunk, start: from, end: from });
      continue;
    }
    let at = fullPlain.indexOf(piece, from);
    if (at < 0) {
      const needle = piece.slice(0, Math.min(24, piece.length));
      at = needle ? fullPlain.indexOf(needle, from) : -1;
    }
    if (at < 0) at = from;
    const end = Math.min(fullPlain.length, at + piece.length);
    segs.push({ html: chunk, start: at, end });
    from = Math.max(from, end);
  }
  return segs;
}

export function segmentIndexForChar(segments: ChapterHtmlSegment[], charOffset: number): number {
  if (!segments.length) return 0;
  let best = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    if (seg.start <= charOffset) best = i;
    if (charOffset < seg.end) return i;
  }
  return best;
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripMarkdownForTts(raw: string): string {
  if (!raw?.trim()) return "";
  return raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

const SENTENCE_TERMINATOR = /[.!?。！？；\uFF01\uFF1F]/u;
const TRAILING_CLOSER_AFTER_SENTENCE_END =
  /[\u2019\u201d\u0022\u0027\u300d\u300f\ufe42\uff02\u00bb\u300b\u3011\uff09)\]]/u;
const LEADING_OPENER_BEFORE_SENTENCE_START =
  /[\u2018\u201c\u300c\u300e\ufe41\uff02\u00ab\u300a\u3010\uff08([]/u;

function isLeadingEllipsisAt(trimmed: string, index: number): boolean {
  const ch = trimmed[index];
  if (!ch) return false;
  if (ch === "\u2026") return true;
  if (ch === "." && trimmed.startsWith("......", index)) return true;
  return ch === "." && trimmed.startsWith("...", index) && trimmed[index + 3] !== ".";
}

function isAttachableBeforeSentenceStart(trimmed: string, index: number): boolean {
  const ch = trimmed[index];
  if (!ch) return false;
  if (LEADING_OPENER_BEFORE_SENTENCE_START.test(ch)) return true;
  if (isLeadingEllipsisAt(trimmed, index)) return true;
  if (ch === "-" && trimmed.startsWith("——", index)) return true;
  if (ch === "-" && trimmed.startsWith("--", index)) return true;
  return false;
}

function consumeLeadingAttachableBeforeSentenceStart(trimmed: string, index: number): number {
  const ch = trimmed.charAt(index);
  if (!ch) return index;
  if (ch === "-" && trimmed.startsWith("——", index)) return index + 2;
  if (ch === "-" && trimmed.startsWith("--", index)) return index + 2;
  if (isLeadingEllipsisAt(trimmed, index)) {
    if (ch === "\u2026") {
      let j = index;
      while (j < trimmed.length && trimmed.charAt(j) === "\u2026") j += 1;
      return j;
    }
    if (ch === "." && trimmed.startsWith("......", index)) return index + 6;
    return index + 3;
  }
  if (LEADING_OPENER_BEFORE_SENTENCE_START.test(ch)) return index + 1;
  return index + 1;
}

function computeSentenceSpanStart(
  trimmed: string,
  segmentStart: number,
  contentStart: number,
): number {
  let pos = segmentStart;
  while (pos < contentStart) {
    while (pos < contentStart && /\s/u.test(trimmed.charAt(pos))) pos += 1;
    if (pos >= contentStart) break;
    if (!isAttachableBeforeSentenceStart(trimmed, pos)) break;
    pos = consumeLeadingAttachableBeforeSentenceStart(trimmed, pos);
  }
  return pos > segmentStart ? segmentStart : contentStart;
}

function isWithinSentenceLeadingAttachables(
  trimmed: string,
  index: number,
  segmentStart: number,
): boolean {
  let pos = segmentStart;
  while (pos <= index && pos < trimmed.length) {
    while (pos < trimmed.length && /\s/u.test(trimmed.charAt(pos))) pos += 1;
    if (pos > index) return false;
    if (!isAttachableBeforeSentenceStart(trimmed, pos)) return false;
    const next = consumeLeadingAttachableBeforeSentenceStart(trimmed, pos);
    if (index < next) return true;
    pos = next;
  }
  return false;
}

function isAttachableAfterSentenceEnd(trimmed: string, index: number): boolean {
  const ch = trimmed[index];
  if (!ch) return false;
  if (SENTENCE_TERMINATOR.test(ch)) return true;
  if (TRAILING_CLOSER_AFTER_SENTENCE_END.test(ch)) return true;
  if (ch === "." && trimmed.startsWith("......", index)) return true;
  if (ch === "." && trimmed.startsWith("...", index) && trimmed[index + 3] !== ".") {
    return true;
  }
  return false;
}

function consumeAttachableAfterSentenceEnd(trimmed: string, index: number): number {
  const ch = trimmed.charAt(index);
  if (!ch) return index;
  if (SENTENCE_TERMINATOR.test(ch)) {
    let j = index;
    while (j < trimmed.length && SENTENCE_TERMINATOR.test(trimmed.charAt(j))) j += 1;
    return j;
  }
  if (ch === "." && trimmed.startsWith("......", index)) return index + 6;
  if (ch === "." && trimmed.startsWith("...", index) && trimmed.charAt(index + 3) !== ".") {
    return index + 3;
  }
  if (TRAILING_CLOSER_AFTER_SENTENCE_END.test(ch)) return index + 1;
  return index;
}

function extendSentenceBoundaryEnd(trimmed: string, end: number): number {
  let j = end;
  while (j < trimmed.length) {
    if (/\s/u.test(trimmed.charAt(j))) {
      let k = j;
      while (k < trimmed.length && /\s/u.test(trimmed.charAt(k))) k += 1;
      if (k >= trimmed.length || !isAttachableAfterSentenceEnd(trimmed, k)) break;
      j = k;
      continue;
    }
    if (!isAttachableAfterSentenceEnd(trimmed, j)) break;
    j = consumeAttachableAfterSentenceEnd(trimmed, j);
  }
  return j;
}

function sentenceBoundaryEnd(trimmed: string, i: number, segmentStart: number): number {
  const ch = trimmed[i];
  if (!ch) return -1;
  let end = -1;
  if (SENTENCE_TERMINATOR.test(ch)) end = i + 1;
  else if (ch === "\u2026") {
    if (isWithinSentenceLeadingAttachables(trimmed, i, segmentStart)) return -1;
    let j = i + 1;
    while (j < trimmed.length && trimmed[j] === "\u2026") j += 1;
    end = j;
  } else if (ch === "." && trimmed.startsWith("......", i)) {
    if (isWithinSentenceLeadingAttachables(trimmed, i, segmentStart)) return -1;
    end = i + 6;
  } else if (ch === "." && trimmed.startsWith("...", i) && trimmed[i + 3] !== ".") {
    if (isWithinSentenceLeadingAttachables(trimmed, i, segmentStart)) return -1;
    end = i + 3;
  }
  if (end < 0) return -1;
  return extendSentenceBoundaryEnd(trimmed, end);
}

/** 与 Web 听书对齐的句界（plain 内 start/end 偏移） */
export function buildSentenceOffsetSpans(plain: string): Array<{ start: number; end: number }> {
  const trimmed = plain.trim();
  if (!trimmed) return [];

  const spans: Array<{ start: number; end: number }> = [];
  let rawStart = 0;

  for (let i = 0; i < trimmed.length; i += 1) {
    const boundary = sentenceBoundaryEnd(trimmed, i, rawStart);
    if (boundary < 0) continue;

    const slice = trimmed.slice(rawStart, boundary);
    const content = slice.trim();
    if (content) {
      const lead = slice.length - slice.trimStart().length;
      const trail = slice.length - slice.trimEnd().length;
      const start = computeSentenceSpanStart(trimmed, rawStart, rawStart + lead);
      spans.push({ start, end: boundary - trail });
    }

    rawStart = boundary;
    while (rawStart < trimmed.length && /\s/u.test(trimmed.charAt(rawStart))) {
      rawStart += 1;
    }
    i = boundary - 1;
  }

  if (rawStart < trimmed.length) {
    const tail = trimmed.slice(rawStart).trim();
    if (tail) {
      const lead = trimmed.slice(rawStart).length - trimmed.slice(rawStart).trimStart().length;
      const start = computeSentenceSpanStart(trimmed, rawStart, rawStart + lead);
      spans.push({ start, end: trimmed.length });
    }
  }

  return spans.length > 0 ? spans : [{ start: 0, end: trimmed.length }];
}

export function chapterToSentences(html: string): ListenSentence[] {
  const plain = stripMarkdownForTts(htmlToPlainText(html));
  if (!plain) return [];
  return buildSentenceOffsetSpans(plain)
    .map(({ start, end }) => ({
      text: stripMarkdownForTts(plain.slice(start, end)).trim(),
      start,
      end,
    }))
    .filter((s) => s.text.length > 0)
    .map((s, index) => ({ text: s.text, index, start: s.start, end: s.end }));
}
