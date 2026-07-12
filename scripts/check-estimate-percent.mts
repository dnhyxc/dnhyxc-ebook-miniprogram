import { calculatePercent, estimatePercent } from "../src/types/ebook.ts";
import type { ChapterMeta } from "../src/types/ebook.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(estimatePercent(0, 0, 10) === 0, "start");
assert(estimatePercent(9, 0.5, 10) === 0.95, "mid last chapter");
assert(estimatePercent(0, 1, 0) === 0, "zero total");
assert(estimatePercent(5, 0.5, 10) === 0.55, "mid book");

const chapters: ChapterMeta[] = [
  { index: 0, href: "a", title: "1", level: 0, wordCount: 100 },
  { index: 1, href: "b", title: "2", level: 0, wordCount: 300 },
];
assert(calculatePercent(1, 0.5, chapters) === 0.625, "word weighted");
assert(
  calculatePercent(0, 0, [{ index: 0, href: "a", title: "1", level: 0 }]) === 0,
  "no wordCount fallback",
);

console.log("progress calc ok");
