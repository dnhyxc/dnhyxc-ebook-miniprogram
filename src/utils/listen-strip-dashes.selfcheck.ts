/**
 * ponytail: 句中 ----- 必须保留，否则听书高亮对不上正文。
 * 跑：npx tsx src/utils/listen-strip-dashes.selfcheck.ts
 */
import { findPlainRangeInHtml, stripMarkdownForTts } from "./listen-text";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const dialogue =
  '一个女生小声说道"唐佳怡，赵凯不错哦，长的帅气，又非常喜欢你，听说家里还非常有背景-----你可以考虑考虑哦。"';

const stripped = stripMarkdownForTts(dialogue);
assert(stripped.includes("-----"), "句中横线应保留");
assert(stripped.includes("有背景-----你可以"), "横线两侧汉字应仍相连语义");

const html = `<p>${dialogue}</p>`;
const range = findPlainRangeInHtml(html, stripped);
assert(range != null, "高亮应能在 HTML 中命中含 ----- 的句子");

const onlyLine = stripMarkdownForTts("前言\n-----\n后记");
assert(!/^-----$/m.test(onlyLine) && !onlyLine.includes("-----"), "整行分隔线仍应去掉");

console.log("listen-strip-dashes.selfcheck: ok");
