const CACHE_KEY_PREFIX = "ebook_chapter_";
const CACHE_EXPIRE_DAYS = 7;

export interface ChapterCache {
  bookId: string;
  index: number;
  html: string;
  title: string;
  cachedAt: number;
}

export function getChapterCache(bookId: string, index: number): ChapterCache | null {
  try {
    const key = `${CACHE_KEY_PREFIX}${bookId}_${index}`;
    const raw = uni.getStorageSync(key);
    if (!raw) return null;

    const cache = JSON.parse(String(raw)) as ChapterCache;
    const expireAt = cache.cachedAt + CACHE_EXPIRE_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() > expireAt) {
      uni.removeStorageSync(key);
      return null;
    }
    return cache;
  } catch {
    return null;
  }
}

export function setChapterCache(bookId: string, index: number, html: string, title: string): void {
  try {
    const key = `${CACHE_KEY_PREFIX}${bookId}_${index}`;
    const cache: ChapterCache = { bookId, index, html, title, cachedAt: Date.now() };
    uni.setStorageSync(key, JSON.stringify(cache));
  } catch (err) {
    console.warn("[reader-cache] set failed", err);
  }
}

export function clearChapterCache(bookId: string): void {
  try {
    const keys = uni.getStorageInfoSync().keys ?? [];
    for (const key of keys) {
      if (key.startsWith(`${CACHE_KEY_PREFIX}${bookId}_`)) {
        uni.removeStorageSync(key);
      }
    }
  } catch (err) {
    console.warn("[reader-cache] clear failed", err);
  }
}
