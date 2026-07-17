/**
 * ponytail: 打包单元内按纯文本偏移落到正确句，避免目录切章从 parts[0] 开播。
 * 跑：npx tsx src/utils/listen-part-offset.selfcheck.ts
 */
import type { ListenSentence } from "./listen-text";
import { listenPartIndexAtPlainOffset } from "./listen-text";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const unit: ListenSentence = {
  index: 0,
  text: "前文一句。 第二节标题。 正文。",
  start: 0,
  end: 16,
  parts: [
    { text: "前文一句。", start: 0, end: 5 },
    { text: "第二节标题。", start: 6, end: 12 },
    { text: "正文。", start: 13, end: 16 },
  ],
};

assert(listenPartIndexAtPlainOffset(unit, 0) === 0, "章首应 parts[0]");
assert(listenPartIndexAtPlainOffset(unit, 6) === 1, "标题应 parts[1]");
assert(listenPartIndexAtPlainOffset(unit, 11) === 1, "标题内应 parts[1]");
assert(listenPartIndexAtPlainOffset(unit, 13) === 2, "正文应 parts[2]");

console.log("listen-part-offset.selfcheck: ok");
