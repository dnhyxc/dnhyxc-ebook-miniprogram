/**
 * ponytail: 剩余长段不含已播短句。
 * 跑：npx tsx src/utils/listen-unit-tail.selfcheck.ts
 */
import type { ListenSentence } from "./listen-text";
import { listenUnitTailText } from "./listen-text";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const unit: ListenSentence = {
  index: 0,
  text: "首句。 次句。 末句。",
  start: 0,
  end: 12,
  parts: [
    { text: "首句。", start: 0, end: 3 },
    { text: "次句。", start: 4, end: 7 },
    { text: "末句。", start: 8, end: 11 },
  ],
};

assert(listenUnitTailText(unit, 0) === unit.text, "从 0 起应是全文");
assert(listenUnitTailText(unit, 1) === "次句。 末句。", "应去掉首句");
assert(!listenUnitTailText(unit, 1).includes("首句"), "剩余不得含首句");
assert(listenUnitTailText(unit, 3) === "", "越界为空");

console.log("listen-unit-tail.selfcheck: ok");
