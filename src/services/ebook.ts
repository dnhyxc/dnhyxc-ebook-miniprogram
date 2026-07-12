import { request } from "@/services/http";
import { resolveUploadFileUrl } from "@/utils/upload-file-url";
import type {
  BookDetail,
  BookDetailResponse,
  CategoriesSummaryResponse,
  ChapterContent,
  ChaptersResponse,
  SaveProgressPayload,
  ShelfBook,
  ShelfCategoryKey,
  ShelfResponse,
} from "@/types/ebook";

export type ShelfQuery = {
  pageNo?: number;
  pageSize?: number;
  scope?: "mine" | "public";
  categoryId?: string;
  uncategorizedOnly?: boolean;
};

export function shelfQueryFromKey(key: ShelfCategoryKey): ShelfQuery {
  if (key.kind === "public") return { scope: "public" };
  if (key.kind === "category") return { categoryId: key.categoryId };
  if (key.kind === "uncategorized") return { uncategorizedOnly: true };
  return { scope: "mine" };
}

function resolveBookCover(coverUrl?: string): string | undefined {
  if (!coverUrl) return undefined;
  const resolved = resolveUploadFileUrl(coverUrl);
  return resolved || undefined;
}

function buildShelfUrl(query: ShelfQuery = {}): string {
  const parts = [
    `pageNo=${query.pageNo ?? 1}`,
    `pageSize=${query.pageSize ?? 50}`,
    `scope=${query.scope ?? "mine"}`,
  ];
  if (query.categoryId) parts.push(`categoryId=${encodeURIComponent(query.categoryId)}`);
  if (query.uncategorizedOnly) parts.push("uncategorizedOnly=true");
  return `/ebook/shelf?${parts.join("&")}`;
}

export function fetchShelf(query: ShelfQuery = {}) {
  return request<ShelfResponse>({ url: buildShelfUrl(query) });
}

export function fetchCategoriesSummary() {
  return request<CategoriesSummaryResponse>({
    url: "/ebook/categories/summary?locale=zh-CN",
  });
}

/** 合并 progMap，供书架展示 */
export function mapShelfBooks(res: ShelfResponse): ShelfBook[] {
  return res.books.map((book) => ({
    ...book,
    coverUrl: resolveBookCover(book.coverUrl),
    progress: res.progMap[book.id],
  }));
}

/** 按 Web 端 Tab 规则拉书架（「全部」合并公开书） */
export async function fetchShelfByCategoryKey(
  key: ShelfCategoryKey,
  pageSize = 50,
): Promise<{ books: ShelfBook[]; total: number }> {
  if (key.kind === "all") {
    const [mine, pub] = await Promise.all([
      fetchShelf({ pageNo: 1, pageSize, scope: "mine" }),
      fetchShelf({ pageNo: 1, pageSize: 100, scope: "public" }),
    ]);
    const mineIds = new Set(mine.books.map((b) => b.id));
    const progMap = { ...pub.progMap, ...mine.progMap };
    const books = [...mine.books, ...pub.books.filter((b) => !mineIds.has(b.id))].map((book) => ({
      ...book,
      coverUrl: resolveBookCover(book.coverUrl),
      progress: progMap[book.id],
    }));
    return { books, total: mine.total + pub.total };
  }

  const res = await fetchShelf({ pageNo: 1, pageSize, ...shelfQueryFromKey(key) });
  return { books: mapShelfBooks(res), total: res.total };
}

export async function fetchBook(bookId: string): Promise<BookDetail> {
  const detail = await request<BookDetailResponse>({
    url: `/ebook/book/${bookId}`,
  });
  return { ...detail.book, prog: detail.prog };
}

export function fetchChapters(bookId: string) {
  return request<ChaptersResponse>({
    url: `/ebook/book/${bookId}/chapters`,
    timeout: 120000,
  });
}

export function fetchChapter(bookId: string, index: number) {
  return request<ChapterContent>({
    url: `/ebook/book/${bookId}/chapter/${index}`,
    timeout: 120000,
  });
}

export function saveProgress(payload: SaveProgressPayload) {
  return request<void>({
    url: "/ebook/progress",
    method: "PUT",
    data: payload,
  });
}
