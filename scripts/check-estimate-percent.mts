import { estimatePercent } from "../src/types/ebook.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(estimatePercent(0, 0, 10) === 0, "start");
assert(estimatePercent(9, 0.5, 10) === 0.95, "mid last chapter");
assert(estimatePercent(0, 1, 0) === 0, "zero total");
assert(estimatePercent(5, 0.5, 10) === 0.55, "mid book");
assert(estimatePercent(-1, 0, 10) === 0, "clamp negative index");

console.log("estimatePercent ok");
