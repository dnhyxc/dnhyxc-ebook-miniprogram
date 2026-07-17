/**
 * ponytail: 紧急短句 vs 长片段合成目标选择。
 * 跑：npx tsx src/utils/listen-synth-target.selfcheck.ts
 */
import type { ListenSentence } from "./listen-text";
import { resolveListenSynthTarget } from "./listen-text";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const unit: ListenSentence = {
  index: 0,
  text: "甲句。 乙句。 丙句。",
  start: 0,
  end: 12,
  parts: [
    { text: "甲句。", start: 0, end: 3 },
    { text: "乙句。", start: 4, end: 7 },
    { text: "丙句。", start: 8, end: 11 },
  ],
};

const urgent = resolveListenSynthTarget(unit, { partIndex: 1, useUnit: false });
assert(urgent.kind === "part", "紧急应为短句");
assert(urgent.text === "乙句。", `紧急文本应为乙句，实际=${urgent.text}`);
assert(urgent.partIndex === 1, "短句下标");

const ready = resolveListenSynthTarget(unit, { partIndex: 1, useUnit: true });
assert(ready.kind === "unit", "长片段就绪应整段");
assert(ready.text === unit.text, "整段文本");

const single: ListenSentence = {
  index: 0,
  text: "仅一句。",
  start: 0,
  end: 4,
  parts: [{ text: "仅一句。", start: 0, end: 4 }],
};
const one = resolveListenSynthTarget(single, { partIndex: 0, useUnit: false });
assert(one.kind === "unit", "单句单元无短轨");

console.log("listen-synth-target.selfcheck: ok");
