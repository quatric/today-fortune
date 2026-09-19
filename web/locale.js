// Guesses the edition (language/build) and ephemeris band (time-zone group) from the browser. No DOM.
// --- locale and time zone detection ---------------------------------------------------------------
export const EDITION_NAME = { en: "English", de: "Deutsch", fr: "Français", es: "Español", it: "Italiano", nl: "Nederlands", kr: "한국어", jp: "日本語" };
export const BAND_NAME = { A: "UTC+1", B: "UTC+2", I: "UTC+9", K: "UTC+10", M: "UTC+12", Z: "UTC±0" };
// The countries the channel's own table lists (it maps a console's country to one of these planetary tables), by time zone
// name. Any other country falls back to band B (UTC+2), exactly as on a real console.
export const DEFAULT_BAND = "B";
const TZ_BAND = [
  [/^Europe\/(London|Jersey|Guernsey|Isle_of_Man|Dublin|Paris|Madrid|Amsterdam|Brussels|Luxembourg|Lisbon)$|^Europe\/Ceuta$|^Atlantic\/(Canary|Madeira|Azores)$/, "Z"],
  [/^Europe\/(Berlin|Busingen|Rome|Vienna|Zurich|Stockholm|Oslo|Copenhagen)$|^Arctic\/Longyearbyen$/, "A"],
  [/^Europe\/(Helsinki|Mariehamn|Athens)$/, "B"],
  [/^Australia\//, "K"],
  [/^Pacific\/(Auckland|Chatham)$|^Antarctica\/McMurdo$/, "M"],
];
/** True if the time zone belongs to a country the channel lists. */
export const isListedZone = (tz) => TZ_BAND.some(([re]) => re.test(tz));
/** Band (planetary table) for a time zone: the channel's own country mapping, else its default. */
export function detectBand(tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "") {
  for (const [re, band] of TZ_BAND) if (re.test(tz)) return band;
  return DEFAULT_BAND;
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
