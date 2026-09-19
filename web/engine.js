// Fortune maths of the Wii "Today & Tomorrow Channel": a port of today_fortune.py, no DOM, no dependencies.
// Dates are [year, month, day]. The data (see ../data/README.md) is passed in already loaded.

export const TOPICS = ["love", "work", "study", "communications", "money"];
export const ZODIAC = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius",
  "Capricorn", "Aquarius", "Pisces"];
const NATAL_FIELD = [1, 3, 4, 2, 5, 0]; // Venus, Saturn, Mercury, Moon@0h, Jupiter, (Sun, unused)
const DAY_FIELD = 7; // the day's Moon at about noon
const key = (y, m, d) => y * 10000 + m * 100 + d;

/** Daily records: u16 year, u8 month, u8 day, then nine 9-bit longitudes (whole degrees). */
export class Ephemeris {
  constructor(buffer) {
    this.view = new DataView(buffer);
    this.index = new Map();
    for (let i = 0; i < buffer.byteLength; i += 16) {
      this.index.set(key(this.view.getUint16(i), this.view.getUint8(i + 2), this.view.getUint8(i + 3)), i);
    }
  }
  has(y, m, d) { return this.index.has(key(y, m, d)); }
  /** The nine longitudes: Sun, Venus, Moon@0h, Saturn, Mercury, Jupiter, Mars, Moon@12h, 0. */
  fields(y, m, d) {
    const at = this.index.get(key(y, m, d));
    if (at === undefined) throw new RangeError("date outside 1881-01-01..2036-12-31");
    const out = [];
    for (let w = 0; w < 3; w++) {
      const word = this.view.getUint32(at + 4 + 4 * w);
      for (let j = 0; j < 3; j++) out.push((word >>> (23 - 9 * j)) & 0x1ff);
    }
    return out;
  }
}

/** 12-byte rows: date, then twelve 5-bit colour indices (one per sign). Returns {rows, byDate}. */
export function unpackColourRows(buffer) {
  const v = new DataView(buffer), rows = [], byDate = new Map();
  for (let i = 0; i + 12 <= buffer.byteLength; i += 12) {
    const cols = [];
    for (let h = 0; h < 2; h++) {
      const word = v.getUint32(i + 4 + 4 * h);
      for (let k = 0; k < 6; k++) cols.push((word >>> (27 - 5 * k)) & 31);
    }
    rows.push(cols);
    byDate.set(key(v.getUint16(i), v.getUint8(i + 2), v.getUint8(i + 3)), cols);
  }
  return { rows, byDate };
}

export const stars = (p) => ({ 0: 1, 2: 1, 4: 2, 6: 2, 20: 5 }[p] ?? (p >= 10 && p <= 19 ? ((p - 10) >> 1) + 1 : 0));

/** Per-date modifier flags (5 topics + overall): a fixed hash of the date. */
export function dayFlags(y, m, d) {
  let seed = (y * d) << m;
  const step = y % 100, flags = [];
  for (let k = 0; k < 6; k++) { flags.push(seed % 100 < (k === 5 ? 30 : 80)); seed += step; }
  return flags;
}

const idx = (pos) => (pos % 360 === 0 ? 359 : (pos % 360) - 1);
const SPREAD = { 2: [0.5, 1.0], 3: [1.0, 2.0], 4: [1.5, 2.5], 5: [2.0, 3.0], 6: [2.5, 3.0] };

export class Channel {
  /** data: {ephemeris: Ephemeris, scores: Uint8Array(2160), colours: {rows, byDate}, hintData: {...}, text: string[]|null, release, lang} */
  constructor(data) { Object.assign(this, data); }

  position(birth, day, topic) {
    return idx(this.ephemeris.fields(...birth)[NATAL_FIELD[topic]] + this.ephemeris.fields(...day)[DAY_FIELD]);
  }
  rawScores(birth, day) {
    return [0, 1, 2, 3, 4].map((t) => this.scores[t * 360 + this.position(birth, day, t)]);
  }

  fortune(birth, day) {
    const flags = dayFlags(...day), topics = [], st = [];
    let total = 0;
    for (let t = 0; t < 5; t++) {
      const index = this.position(birth, day, t);
      let points = Math.min(this.scores[t * 360 + index], 20);
      if (flags[t]) points = { 13: 6, 12: 4, 11: 2, 10: 0 }[points] ?? points; // penalty on ~80% of dates
      st.push(stars(points));
      total += points;
      topics.push({ topic: TOPICS[t], index, number: t * 360 + index + 1, points, stars: st[t],
        text: this.text ? this.text[t * 360 + index] : null });
    }
    total = Math.max(0, Math.min(100, total));
    if (flags[5]) { // ~30% of dates: bonus for a strong day; a perfect 100 needs four 5-star topics
      if (total > 79) total = Math.min(100, total + 10);
      if (total === 100 && !st.slice(0, 4).every((s) => s === 5)) total = 99;
    }
    const sun = this.ephemeris.fields(...birth)[0];
    return { sign: ((Math.floor((sun - 1) / 30) % 12) + 12) % 12, total, flags, topics };
  }

  /** Lucky colour index (0-22) and name (null where unknown) for the birth sign on a day. */
  colour(birth, day) {
    const sun = this.ephemeris.fields(...birth)[0];
    const sign = ((Math.floor((sun - 1) / 30) % 12) + 12) % 12;
    const { rows, byDate } = this.colours;
    const row = day[0] >= 2007 && day[0] <= 2036 ? byDate.get(key(...day))
      : rows[(day[2] + day[0] * 2 ** day[1]) % 16071];
    const i = row[sign];
    return { index: i, name: this.hintData.words.colours ? this.hintData.words.colours[i] : null };
  }

  /** 0 normal, 1 good, 2 very good, for 2-6 people. */
  compat(births, day) {
    const n = births.length, rows = births.map((b) => this.rawScores(b, day));
    const a = rows.map((r) => r[3]), b = rows.map((r) => r[0]), c = rows.map((r) => r[1]); // Moon, Venus, Saturn
    const mean = (x) => x.reduce((s, v) => s + v, 0) / n, ma = mean(a), mb = mean(b), low = Math.min(...c);
    if (low > 12) {
      const [da, db] = SPREAD[n];
      if (a.every((x) => Math.abs(x - ma) <= da) && b.every((x) => Math.abs(x - mb) <= db)) return 2;
    }
    if (ma + mb - low > 21) return 2;
    return ma >= 15 ? 1 : 0;
  }
  nextGreatDay(births, day, limit = 90) {
    for (let k = 1; k <= limit; k++) {
      const t = new Date(Date.UTC(day[0], day[1] - 1, day[2] + k));
      const d = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
      if (!this.ephemeris.has(...d)) break;
      if (this.compat(births, d) === 2) return d;
    }
    return null;
  }

  /** Three food words, three fun words and [place, how much, chore] for a group of 1-6 people. */
  hints(births, day) {
    const h = this.hintData, w = h.words, tab = h.tables, care = h.care_rows;
    const moon = this.ephemeris.fields(...day)[2]; // the day's Moon at midnight
    const sums = Array(7).fill(0);
    for (const b of births) this.ephemeris.fields(...b).slice(0, 7).forEach((v, k) => { sums[k] += v; });
    const mealTab = (sums[6] + moon) % 360 < 180 ? tab.meal_a : tab.meal_b;
    const food = mealTab[idx(moon + sums[0])].map((x) => w.meal[x]).filter(Boolean);
    const fun = tab.play_tab[idx(moon + sums[2])].map((x) => w.play[x]).filter(Boolean);
    const per = births.map((b) => this.rawScores(b, day));
    const love = per.reduce((s, x) => s + x[0], 0), comms = per.reduce((s, x) => s + x[3], 0);
    const row = care[idx(moon + sums[love < comms ? 1 : 2])];
    const item = row[2 + ((sums[5] + moon) % 3)];
    const work = per.reduce((s, x) => s + x[1], 0), study = per.reduce((s, x) => s + x[2], 0);
    let level;
    if (work === study) level = w.level[4];
    else {
      const low = work < study, top = low ? 2 : 1;
      const m = Math.max(...per.map((x) => x[top])) - 10;
      level = w.level[Math.min(Math.max(0, (low ? 10 - m : m) - 1), 9)];
    }
    return { food, fun, care: [w.care[row[0]], level, w.care[item === 0x3f ? row[5] : item]] };
  }

  /** Where the planets stood on a day (whole degrees), for the sky wheel. */
  sky(day) {
    const f = this.ephemeris.fields(...day);
    return { sun: f[0], venus: f[1], moon: f[7], saturn: f[3], mercury: f[4], jupiter: f[5], mars: f[6] };
  }
}
