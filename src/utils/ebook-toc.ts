import type { ChapterMeta } from "@/types/ebook";
import {
  chapterToSentences,
  htmlToPlainText,
  sentenceIndexAtPlainOffset,
  stripMarkdownForTts,
} from "@/utils/listen-text";

/** 章内纯文本（与听书分句同一清洗） */
export function chapterPlainText(html: string): string {
  return stripMarkdownForTts(htmlToPlainText(html || ""));
}

/**
 * 当前阅读位置对应的目录列表下标（非 spine index）。
 * 同文件多节时：按标题在正文中的出现位置与 scrollPercent 对齐。
 */
export function findActiveTocListIndex(
  toc: ChapterMeta[],
  spineIndex: number,
  opts?: { chapterHtml?: string; scrollPercent?: number },
): number {
  if (!toc.length || spineIndex < 0) return -1;

  let bestBefore = -1;
  const same: number[] = [];
  for (let i = 0; i < toc.length; i++) {
    const idx = toc[i]?.index;
    if (idx == null || idx < 0) continue;
    if (idx < spineIndex) bestBefore = i;
    else if (idx === spineIndex) same.push(i);
  }
  if (!same.length) return bestBefore;
  if (same.length === 1) return same[0];

  const html = opts?.chapterHtml ?? "";
  const scrollPercent = Math.min(1, Math.max(0, opts?.scrollPercent ?? 0));
  if (!html) return same[0];

  const plain = chapterPlainText(html);
  if (!plain.length) return same[0];

  const charTarget = scrollPercent * plain.length;
  let best = same[0];
  for (const i of same) {
    const title = (toc[i]?.title ?? "").trim();
    if (!title) continue;
    const pos = plain.indexOf(title);
    if (pos >= 0 && pos <= charTarget) best = i;
  }
  return best;
}

/**
 * 按目录标题把 HTML 拆成 before / after（标题落在 after 开头）。
 * 中间夹原生 view 锚点，避免往 mp-html 灌空 <a> 触发 node.attrs 空指针。
 */
export function splitHtmlAtTocTitle(
  html: string,
  item: ChapterMeta,
): { before: string; after: string } | null {
  const title = (item.title ?? "").trim();
  const src = html || "";
  if (!title || !src) return null;
  const idx = src.indexOf(title);
  if (idx < 0) return null;
  return {
    before: src.slice(0, idx),
    after: src.slice(idx),
  };
}

/** 目录项 → 章内滚动比（视觉顶齐回退；听书起播优先用 tocItemListenSentenceIndex） */
export function tocItemScrollPercent(chapterHtml: string, item: ChapterMeta): number {
  const title = (item.title ?? "").trim();
  if (!title || !chapterHtml) return 0;
  const plain = chapterPlainText(chapterHtml);
  if (!plain.length) return 0;
  const pos = plain.indexOf(title);
  if (pos < 0) return 0;
  return Math.min(1, Math.max(0, pos / plain.length));
}

/** 目录项 → 听书起播句（标题所在朗读单元，从节起点播） */
export function tocItemListenSentenceIndex(chapterHtml: string, item: ChapterMeta): number {
  const list = chapterToSentences(chapterHtml);
  if (!list.length) return 0;
  const title = (item.title ?? "").trim();
  if (!title) return 0;
  const plain = chapterPlainText(chapterHtml);
  const pos = plain.indexOf(title);
  if (pos < 0) return 0;
  return sentenceIndexAtPlainOffset(list, pos);
}
