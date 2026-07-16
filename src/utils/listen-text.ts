/** 章节 HTML → 听书纯文本 / 分句（句界算法对齐 Web englishTts） */

/** 纯文本坐标片段（句级高亮 / 跟读用） */
export type ListenTextSpan = {
  text: string;
  start: number;
  end: number;
};

export type ListenSentence = {
  /** 送 TTS 的文本（整段；超长时为段内切出的一片） */
  text: string;
  index: number;
  /** 在章节纯文本中的起止（与 htmlToPlainText + stripMarkdownForTts 同一坐标系） */
  start: number;
  end: number;
  /** 段内句界：合成按段，高亮按句（由 Edge WordBoundary 时间戳驱动） */
  parts: ListenTextSpan[];
};

/** 与后端 /edge/speech/timed 的 boundary 对齐 */
export type ListenBoundary = {
  text: string;
  offsetMs: number;
  durationMs: number;
};

/** 把 Edge 词界顺序匹配到朗读文本上的字符区间 */
export function mapBoundariesToCharOffsets(
  text: string,
  boundaries: Array<{ text: string }>,
): Array<{ start: number; end: number } | null> {
  const out: Array<{ start: number; end: number } | null> = [];
  let cursor = 0;
  for (const b of boundaries) {
    const word = (b.text ?? "").trim();
    if (!word) {
      out.push(null);
      continue;
    }
    const idx = text.indexOf(word, cursor);
    if (idx < 0) {
      // 匹配失败不推进 cursor，后续词仍有机会对齐（对齐 Readest）
      out.push(null);
      continue;
    }
    out.push({ start: idx, end: idx + word.length });
    cursor = idx + word.length;
  }
  return out;
}

export function boundaryTimelineMs(boundaries: ListenBoundary[]): number {
  if (!boundaries.length) return 0;
  const last = boundaries[boundaries.length - 1];
  if (!last) return 0;
  return last.offsetMs + last.durationMs;
}

/** 中文 Edge TTS 粗估语速（字/秒 @1x，含标点停顿） */
export const LISTEN_CHARS_PER_SEC = 4.2;

/** 无实测时长时按字数估算；rate 已烘焙进音频时传合成倍速 */
export function estimateSpeechDurationMs(text: string, rate = 1): number {
  const r = Math.min(2, Math.max(0.5, rate));
  const chars = Math.max(text.replace(/\s+/g, "").length, 1);
  return Math.max(400, Math.round((chars / (LISTEN_CHARS_PER_SEC * r)) * 1000));
}

/** 章内时间轴 → 句下标 + 句内偏移 */
export function locateSpeechOffset(
  durationsMs: number[],
  positionMs: number,
): { index: number; offsetMs: number } {
  if (!durationsMs.length) return { index: 0, offsetMs: 0 };
  const target = Math.max(0, positionMs);
  let acc = 0;
  for (let i = 0; i < durationsMs.length; i += 1) {
    const d = Math.max(0, durationsMs[i] ?? 0);
    const last = i === durationsMs.length - 1;
    if (last || acc + d > target) {
      const offset = Math.min(Math.max(0, target - acc), Math.max(d - 1, 0));
      return { index: i, offsetMs: offset };
    }
    acc += d;
  }
  return { index: durationsMs.length - 1, offsetMs: 0 };
}

/** 按音频时间（ms）在段内选当前句；无 boundary 时退回整段 */
export function pickListenPartByTime(
  unit: ListenSentence,
  boundaries: ListenBoundary[],
  timeMs: number,
): ListenTextSpan {
  const fallback: ListenTextSpan = { text: unit.text, start: unit.start, end: unit.end };
  const parts = unit.parts.length > 0 ? unit.parts : [fallback];
  const head = parts[0] ?? fallback;
  if (!boundaries.length) return head;

  let bi = 0;
  for (let i = 0; i < boundaries.length; i += 1) {
    if ((boundaries[i]?.offsetMs ?? 0) <= timeMs) bi = i;
    else break;
  }
  const offsets = mapBoundariesToCharOffsets(unit.text, boundaries);
  const cur = offsets[bi];
  if (!cur) return head;
  const abs = unit.start + cur.start;
  for (const p of parts) {
    if (abs >= p.start && abs < p.end) return p;
  }
  const tail = parts[parts.length - 1] ?? head;
  if (abs >= tail.start) return tail;
  return head;
}

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

/**
 * TTS / 听书坐标用的纯文本清洗。
 * 保留换行作段落界（听书按段合成）；行内空白压成单空格。
 */
/** 整段是否只剩装饰分隔符（*** / --- / _ 等），勿送 TTS */
export function isDecorativeSeparatorText(text: string): boolean {
  const t = text.replace(/\s+/g, "");
  return t.length > 0 && /^[*＊\-—_=~～·•.]+$/u.test(t);
}

/**
 * TTS / 听书坐标用的纯文本清洗。
 * 保留换行作段落界（听书按段合成）；行内空白压成单空格。
 */
export function stripMarkdownForTts(raw: string): string {
  if (!raw?.trim()) return "";
  return (
    raw
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`\n]+`/g, " ")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^[-*+]\s+/gm, "")
      .replace(/^\d+\.\s+/gm, "")
      // 网文装饰分隔线（*** / --- / ——— 等），勿朗读
      .replace(/[*＊]{3,}/g, " ")
      .replace(/[-—_=~～]{3,}/g, " ")
      .replace(/[·•.]{3,}/g, " ")
      // * * * 间隔星号分隔
      .replace(/(?:^|\s)(?:\*[ \t]*){2,}\*(?=\s|$)/gm, " ")
      // 整行仅剩装饰符（含单个 _）
      .replace(/^[ \t]*[*＊\-—_=~～·•.]{1,}[ \t]*$/gm, "")
      // 保留 \n 作为段界；其它空白压平
      .replace(/[^\S\n]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** 单段超过此字数则段内回退句切，避免超长合成超时/失败 */
const MAX_LISTEN_UNIT_CHARS = 600;

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

/** 按换行切段（htmlToPlainText 已把 </p> 等变成 \n） */
export function buildParagraphOffsetSpans(plain: string): Array<{ start: number; end: number }> {
  const text = plain.replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  const spans: Array<{ start: number; end: number }> = [];
  for (const m of text.matchAll(/[^\n]+/g)) {
    const raw = m[0];
    const content = raw.trim();
    if (!content) continue;
    const lead = raw.length - raw.trimStart().length;
    const start = m.index + lead;
    spans.push({ start, end: start + content.length });
  }
  return spans.length > 0 ? spans : [{ start: 0, end: text.length }];
}

/** 超长段在段内按句切开，坐标映射回全文 */
function expandSpansToMaxChars(
  plain: string,
  spans: Array<{ start: number; end: number }>,
  maxChars: number,
): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const span of spans) {
    if (span.end - span.start <= maxChars) {
      out.push(span);
      continue;
    }
    const slice = plain.slice(span.start, span.end);
    const inner = buildSentenceOffsetSpans(slice);
    for (const s of inner) {
      out.push({ start: span.start + s.start, end: span.start + s.end });
    }
  }
  return out;
}

function partsForUnitSpan(plain: string, start: number, end: number): ListenTextSpan[] {
  const slice = plain.slice(start, end);
  const inner = buildSentenceOffsetSpans(slice);
  const parts = inner
    .map((s) => {
      const text = slice.slice(s.start, s.end).replace(/\s+/g, " ").trim();
      return { text, start: start + s.start, end: start + s.end };
    })
    .filter((p) => p.text.length > 0);
  if (parts.length) return parts;
  const text = slice.replace(/\s+/g, " ").trim();
  return text ? [{ text, start, end }] : [];
}

/**
 * 听书朗读单元：默认按段落（比逐句合成少请求、句间更顺）。
 * `parts` 供句级高亮；播放进度由 Edge WordBoundary 驱动。
 */
export function chapterToSentences(html: string): ListenSentence[] {
  const plain = stripMarkdownForTts(htmlToPlainText(html));
  if (!plain) return [];
  const spans = expandSpansToMaxChars(
    plain,
    buildParagraphOffsetSpans(plain),
    MAX_LISTEN_UNIT_CHARS,
  );
  return spans
    .map(({ start, end }) => {
      const text = plain.slice(start, end).replace(/\s+/g, " ").trim();
      const parts = partsForUnitSpan(plain, start, end).filter(
        (p) => !isDecorativeSeparatorText(p.text),
      );
      return { text, start, end, parts };
    })
    .filter((s) => s.text.length > 0 && !isDecorativeSeparatorText(s.text))
    .map((s, index) => ({ ...s, index }));
}

/** 听书句级高亮：成对去掉 data-listen-hl 包裹（用 span，mp-html 信任标签） */
export function stripListenHighlight(html: string): string {
  return html.replace(/<span\s+[^>]*data-listen-hl="1"[^>]*>([\s\S]*?)<\/span>/gi, "$1");
}

function matchEntityAt(html: string, i: number): { out: string; len: number } | null {
  if (html[i] !== "&") return null;
  if (html.startsWith("&nbsp;", i)) return { out: " ", len: 6 };
  if (html.startsWith("&amp;", i)) return { out: "&", len: 5 };
  if (html.startsWith("&lt;", i)) return { out: "<", len: 4 };
  if (html.startsWith("&gt;", i)) return { out: ">", len: 4 };
  if (html.startsWith("&quot;", i)) return { out: '"', len: 6 };
  if (html.startsWith("&#39;", i)) return { out: "'", len: 5 };
  return null;
}

/**
 * 在 HTML 字符串中尝试按“纯文本”方式匹配 needle（即需高亮的原文句子），返回其在 HTML 中的起止下标。
 *
 * 设计要点与适用场景：
 *   - 保证返回的区间正好落在“文本节点”上，可安全用 <mark> 或 <span> 包裹做前端高亮，且符号/实体也能被识别。
 *   - 支持句子跨标签、HTML 实体、混入多余空白等“噪音”，保证实际显示和语音朗读能找准。
 *   - 匹配失败（找不到精确区间）时，调用方需根据返回 null 自行处理（如不做高亮等）。
 *
 * 具体参数：
 *   @param html   待查找的 HTML 源字符串（通常是一小段，如一个 <p> 块）
 *   @param needle 需匹配的目标句子（strip 后的纯文本）
 *   @param from   搜索起始下标，可选（用于继续寻找下一个可能的匹配）
 * @returns
 *   找到时返回 {start, end} 为 HTML 源字符串上的下标区间，正好可用来做 substring 包裹实际原文。
 *   未找到返回 null。
 *
 * 算法主要流程：
 *   1. 跳过所有 HTML 标签（以 < 开头的），直接快进至 > 后继续。
 *   2. 支持常见 HTML 实体（如 &nbsp;、&amp;、&lt; 等等），一律按其文本效果解码参与匹配，并按实体原始长度前进。
 *   3. 按字符（纯文本）逐一与 needle 的 ch 做等价比对，如果全部一致则认为命中，记录起止区间。
 *   4. 匹配中若遇多余的空白字符会略过，允许 needle 句内外前后空格变动。
 *   5. 若中途出现不符（且非空白），即回溯 needle，尝试在下一个原文起点重新起步。
 */
export function findPlainRangeInHtml(
  html: string,
  needle: string,
  from = 0,
): { start: number; end: number } | null {
  if (!needle) return null; // 如果没有目标句子，直接认为匹配失败

  let ni = 0; // needle 的指针：当前待匹配的字符下标
  let start = -1; // HTML 原文中，needle 匹配起点（展开时才赋值）
  let i = from; // HTML 源文本当前查找指针

  while (i < html.length) {
    // 1. 跳过 HTML 标签内容。遇到 <，找到下一个 > 并移到其后，再继续匹配
    if (html[i] === "<") {
      const gt = html.indexOf(">", i);
      if (gt < 0) break; // 异常标签，直接结束
      i = gt + 1;
      continue;
    }

    // 2. 检查当前位置是否是 HTML 实体，若是则替换为真实字符参与匹配
    const ent = matchEntityAt(html, i); // 支持 &nbsp; &amp; 等
    const rawCh = html[i];
    if (!ent && rawCh == null) break; // 走到末尾
    const ch = ent ? ent.out : rawCh; // 需参与 needle 匹配的字符
    const step = ent ? ent.len : 1; // 本轮检查完应跳过的 HTML 源长度

    // 3. 匹配 needle 字符
    if (ch === needle[ni]) {
      // 开始或继续匹配
      if (ni === 0) start = i; // 记录此次命中的原文下标
      ni += 1;
      // 全部匹配完成，返回区间
      if (ni >= needle.length) return { start, end: i + step };
    } else {
      // 允许 needle 中间穿插空白：若已进入匹配状态，但遇到 HTML 中的空格等，略过即可
      if (ni > 0 && /\s/u.test(ch)) {
        i += step;
        continue;
      }
      // 若发生实际不符，需回退重试：从上一个匹配起点的下一个字符继续
      if (ni > 0) {
        i = start + 1;
        ni = 0;
        start = -1;
        continue;
      }
      // 若还未开始命中，也不是空白不符，则往下走
    }
    // 继续遍历原文
    i += step;
  }
  // 整个 HTML 检查完仍未匹配，返回 null
  return null;
}

/**
 * 仅在一段 HTML 内包当前句高亮。调用方应对「当前段」setContent，勿整章重灌。
 *
 * 功能说明：
 *   - 在给定的 HTML 段落中查找当前需高亮的句子（sentenceText），
 *     并用带指定样式（markStyle）的 <span> 标签将其包裹，实现高亮显示。
 *   - 仅作用于一段（而不是整个章节），避免整章内容反复替换导致性能或高亮错乱。
 *   - 若传入的 sentenceText 在当前 HTML 找不到，可以尝试使用前 24 或 12 个字符宽松匹配，提升容错。
 *   - 输入样式仅允许安全字符，防止破坏 HTML 属性或注入风险。
 *
 * 参数说明：
 *   @param html        原始 HTML 字符串（一般为当前显示段）
 *   @param sentenceText  需高亮的句子文本（纯文本，通常为当前播读的句子）
 *   @param markStyle     用于高亮 <span> 的内联 style 样式字符串（如背景色等）
 *
 * @returns
 *   返回已包裹高亮 span 的新 HTML 字符串，若未匹配到则返回原 HTML（清除高亮后）
 */
export function injectListenSentenceHighlight(
  html: string,
  sentenceText: string,
  markStyle: string,
): string {
  // 先移除已有的高亮，避免重复包裹
  const cleaned = stripListenHighlight(html);
  // 去除句子首尾空白，得到待查找的文本
  const needle = sentenceText.trim();
  // 句子为空则直接返回处理后原文
  if (!needle) return cleaned;

  // 在 HTML 纯文本中查找目标句子范围（精确查找）
  let range = findPlainRangeInHtml(cleaned, needle);
  // 如果精确找不到，且句子较长，尝试用前 24 个字符宽松匹配
  if (!range && needle.length > 24) {
    range = findPlainRangeInHtml(cleaned, needle.slice(0, 24));
  }
  // 若依然找不到，再尝试前 12 个字符
  if (!range && needle.length > 12) {
    range = findPlainRangeInHtml(cleaned, needle.slice(0, 12));
  }
  // 若最终都未找到匹配，返回清理后的原 HTML
  if (!range) return cleaned;

  // style 属性仅允许安全字符，移除引号和尖括号防止属性异常
  const safeStyle = markStyle.replace(/["<>]/g, "");
  // 构造带高亮标记的 <span> 标签
  const open = `<span data-listen-hl="1" style="${safeStyle}">`;
  const close = "</span>";
  // 将目标区间用 <span> 包起来并拼接，其余部分保持原样
  return (
    cleaned.slice(0, range.start) + // 目标前内容
    open + // 打开 span 标签
    cleaned.slice(range.start, range.end) + // 目标区间（需高亮）
    close + // 关闭 span
    cleaned.slice(range.end) // 目标后内容
  );
}
