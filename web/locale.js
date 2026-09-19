// Guesses the edition (language/build) and ephemeris band (time-zone group) from the browser. No DOM.
// --- locale and time zone detection ---------------------------------------------------------------
export const EDITION_NAME = { en: "English", de: "Deutsch", fr: "Français", es: "Español", it: "Italiano", nl: "Nederlands", kr: "한국어", jp: "日本語" };
export const BAND_NAME = { A: "UTC+1", B: "UTC+2", I: "UTC+9", K: "UTC+10", M: "UTC+12", Z: "UTC±0" };
const BAND_UTC = { Z: 0, A: 1, B: 2, I: 9, K: 10, M: 12 };
// Countries the channel itself listed for a band (by time zone name); everything else goes to the nearest band.
const TZ_BAND = [
  [/^Europe\/(London|Dublin|Paris|Madrid|Amsterdam|Brussels|Luxembourg|Lisbon)$|^Atlantic\/(Canary|Madeira|Azores)$/, "Z"],
  [/^Europe\/(Berlin|Rome|Vienna|Zurich|Stockholm|Oslo|Copenhagen|Busingen|Vaduz|Vatican|San_Marino)$/, "A"],
  [/^Europe\/(Helsinki|Athens)$/, "B"],
  [/^Asia\/(Tokyo|Seoul|Pyongyang)$/, "I"],
  [/^Australia\//, "K"],
  [/^Pacific\/(Auckland|Chatham|Fiji)$|^Antarctica\/McMurdo$/, "M"],
];
export function detectBand(tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "", now = new Date()) {
  for (const [re, band] of TZ_BAND) if (re.test(tz)) return band;
  const y = now.getFullYear(), std = -Math.max(new Date(y, 0, 1).getTimezoneOffset(), new Date(y, 6, 1).getTimezoneOffset()) / 60;
  return Object.entries(BAND_UTC).sort((p, q) => Math.abs(p[1] - std) - Math.abs(q[1] - std))[0][0];
}
export function detectEdition(langs = navigator.languages || [navigator.language || "en"], tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "") {
  for (const l of langs) {
    const base = String(l).toLowerCase().split("-")[0];
    if (base === "ko") return "kr";
    if (base === "ja") return "jp";
    if (base in EDITION_NAME) return base;
  }
  if (tz === "Asia/Seoul") return "kr";
  if (tz === "Asia/Tokyo") return "jp";
  return "en";
}

/** A clock time in the reader's own style: "5 PM" for 12-hour locales such as en-US, "17:00" for 24-hour ones. */
export function formatHour(hour, locales = navigator.languages) {
  const d = new Date(2000, 0, 1, hour, 0);
  let list;
  try { list = [...(locales || [])]; new Intl.DateTimeFormat(list); } catch { list = undefined; }
  const twelve = new Intl.DateTimeFormat(list, { hour: "numeric" }).resolvedOptions().hour12;
  return new Intl.DateTimeFormat(list, twelve ? { hour: "numeric" } : { hour: "2-digit", minute: "2-digit" }).format(d);
}
