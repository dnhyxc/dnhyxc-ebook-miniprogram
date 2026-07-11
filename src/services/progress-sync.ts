import { saveProgress } from "@/services/ebook";
import type { SaveProgressPayload } from "@/types/ebook";

const REMOTE_DEBOUNCE_MS = 8000;

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: SaveProgressPayload | null = null;
let flushing: Promise<void> | null = null;

export function scheduleProgressSave(payload: SaveProgressPayload) {
  pending = payload;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void flushProgressSave();
  }, REMOTE_DEBOUNCE_MS);
}

export function flushProgressSave(): Promise<void> {
  if (flushing) return flushing;

  if (!pending) return Promise.resolve();

  const snapshot = pending;
  pending = null;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  flushing = saveProgress(snapshot)
    .catch((err) => {
      // 失败时保留 pending 供下次 flush
      pending = snapshot;
      console.warn("[progress-sync] save failed", err);
    })
    .finally(() => {
      flushing = null;
    });

  return flushing;
}
