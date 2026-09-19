// Loads the bundled data (../data) into an engine Channel. `io` abstracts where bytes come from, so the same code
// runs in the browser (fetch) and in Node tests (fs).
import { Channel, Ephemeris, unpackColourRows } from "./engine.js";

export const BANDS = { A: "UTC+1", B: "UTC+2", I: "UTC+9", K: "UTC+10", M: "UTC+12", Z: "UTC+0" };

/** release: "eu" | "kr" | "jp"; lang: en de fr es it nl (eu only); band: A B I K M Z. */
export async function loadChannel(io, { release, lang = "en", band }) {
  band = band || (release === "eu" ? "A" : "I");
  const [eph, scores, colourBuf, hints] = await Promise.all([
    io.gz(`ephemeris/${band}.bin.gz`), io.raw("scores.bin"), io.gz(`colours/${band}.bin.gz`), io.json("hints.json"),
  ]);
  const h = hints[release];
  const hintData = release === "eu"
    ? { tables: h.tables, care_rows: h.care_rows[lang], words: h.words[lang] }
    : { tables: h.tables, care_rows: h.care_rows, words: h.words };
  let text = null;
  try { text = new TextDecoder().decode(await io.gz(`text/${release === "eu" ? lang : release}.txt.gz`)).split("\n"); }
  catch { /* data/text was removed: message numbers only */ }
  return new Channel({ ephemeris: new Ephemeris(eph), scores: new Uint8Array(scores), colours: unpackColourRows(colourBuf),
    hintData, text, release, lang, band });
}

/** Browser io: fetches relative to the data folder and gunzips with the built-in DecompressionStream. */
export function browserIo(base) {
  const cache = new Map();
  const get = (path) => {
    if (!cache.has(path)) cache.set(path, fetch(new URL(path, base)).then((r) => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return r;
    }));
    return cache.get(path).then((r) => r.clone());
  };
  return {
    raw: (p) => get(p).then((r) => r.arrayBuffer()),
    json: (p) => get(p).then((r) => r.json()),
    gz: (p) => get(p).then((r) => new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()),
  };
}
