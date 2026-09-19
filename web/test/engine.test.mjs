// Replays the cases in fixtures.json (computed by today_fortune.py) against the JavaScript engine.
//   node web/test/engine.test.mjs
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { loadChannel } from "../data.js";
import { ZODIAC } from "../engine.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "..", "..", "data");
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const io = {
  raw: async (p) => ab(await fs.readFile(path.join(dataDir, p))),
  json: async (p) => JSON.parse(await fs.readFile(path.join(dataDir, p), "utf8")),
  gz: async (p) => ab(zlib.gunzipSync(await fs.readFile(path.join(dataDir, p)))),
};
const cases = JSON.parse(await fs.readFile(path.join(here, "fixtures.json"), "utf8"));
const channels = new Map();
let bad = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
for (const [n, c] of cases.entries()) {
  const k = `${c.release}/${c.lang}/${c.band}`;
  if (!channels.has(k)) channels.set(k, await loadChannel(io, c));
  const ch = channels.get(k), p = c.birth, d = c.day;
  const f = ch.fortune(p, d), col = ch.colour(p, d), hi = ch.hints(c.group, d), rating = ch.compat(c.group, d);
  const checks = {
    sign: ZODIAC[f.sign] === ZODIAC[c.sign], total: f.total === c.total, flags: eq(f.flags.map(Number), c.flags),
    topics: eq(f.topics.map((t) => [t.index, t.points, t.stars, (t.text || "").slice(0, 24)]), c.topics),
    colour: eq([col.index, col.name], c.colour),
    hints: eq([hi.food, hi.fun, hi.care], [c.hints.food, c.hints.fun, c.hints.care]),
    compat: rating === c.compat,
    next: rating === 2 || eq(ch.nextGreatDay(c.group, d), c.next),
  };
  for (const [name, ok] of Object.entries(checks)) if (!ok) { bad++; console.log(`case ${n} ${k} ${name} differs`); }
}
console.log(`${cases.length} cases, ${bad} differences`);
process.exit(bad ? 1 : 0);
