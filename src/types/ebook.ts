export type BookFormat = "epub" | "pdf";

export interface BookProgress {
  bookId?: string;
  epubCfi?: string;
  percent?: number;
  chapterIndex?: number;
  chapterHref?: string;
  scrollPercent?: number;
  updatedAt?: string;
}

export interface BackendBook {
  id: string;
  title: string;
  author?: string;
  coverUrl?: string;
  fmt: BookFormat;
  parseStatus?: "pending" | "ready" | "failed";
  totalWordCount?: number;
}

export interface ShelfBook extends BackendBook {
  progress?: BookProgress;
}

export interface EbookCategory {
  id: string;
  name: string;
  sortOrder: number;
  bookCount: number;
}

export interface CategoriesSummaryResponse {
  categories: EbookCategory[];
  uncategorizedCount: number;
  totalBookCount: number;
}

export type ShelfCategoryKey =
  | { kind: "all" }
  | { kind: "category"; categoryId: string }
  | { kind: "uncategorized" }
  | { kind: "public" };

/** 与 dnhyxc-ai GET /ebook/shelf 一致 */
export interface ShelfResponse {
  books: BackendBook[];
  progMap: Record<string, BookProgress>;
  total: number;
  pageNo: number;
  pageSize: number;
}

export interface BookDetailResponse {
  book: BackendBook;
  prog?: BookProgress;
}

export interface BookDetail extends BackendBook {
  prog?: BookProgress;
}

export interface ChapterMeta {
  index: number;
  href: string;
  title: string;
  level: number;
  wordCount?: number;
}

export interface ChaptersResponse {
  bookId: string;
  title: string;
  total: number;
  totalWordCount?: number;
  chapters: ChapterMeta[];
}

export interface ChapterContent {
  bookId: string;
  index: number;
  title: string;
  html: string;
  wordCount?: number;
  totalWordCount?: number;
  prevIndex: number | null;
  nextIndex: number | null;
  total: number;
}

export interface SaveProgressPayload {
  bookId: string;
  percent?: number;
  epubCfi?: string;
  chapterIndex?: number;
  chapterHref?: string;
  scrollPercent?: number;
}

/** 由章序与章内滚动比估算全书进度（无字数数据时） */
export function estimatePercent(
  chapterIndex: number,
  scrollPercent: number,
  total: number,
): number {
  if (total <= 0) return 0;
  const raw = (chapterIndex + scrollPercent) / total;
  return Math.min(1, Math.max(0, raw));
}

/** 基于章节字数加权计算进度（后端提供 wordCount 时更准确） */
export function calculatePercent(
  chapterIndex: number,
  scrollPercent: number,
  chapters: ChapterMeta[],
): number {
  if (!chapters.length) return 0;

  const totalWordCount = chapters.reduce((sum, ch) => sum + (ch.wordCount ?? 0), 0);
  if (totalWordCount <= 0) {
    return estimatePercent(chapterIndex, scrollPercent, chapters.length);
  }

  let prevWords = 0;
  for (let i = 0; i < chapterIndex; i++) {
    prevWords += chapters[i].wordCount ?? 0;
  }
  const currentWords = prevWords + (chapters[chapterIndex]?.wordCount ?? 0) * scrollPercent;
  return Math.min(1, Math.max(0, currentWords / totalWordCount));
}
