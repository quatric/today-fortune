import { detectBand, detectEdition, formatHour, isListedZone } from "../locale.js";
const cases = [
  ["Europe/Berlin", "A"], ["Europe/Zurich", "A"], ["Europe/Stockholm", "A"], ["Europe/Paris", "Z"], ["Europe/London", "Z"], ["Europe/Madrid", "Z"],
  ["Atlantic/Canary", "Z"], ["Europe/Lisbon", "Z"], ["Europe/Helsinki", "B"], ["Europe/Athens", "B"], ["Australia/Sydney", "K"], ["Australia/Perth", "K"],
  ["Pacific/Auckland", "M"],
  // not in the channel's country table: its default band
  ["America/New_York", "B"], ["America/Chicago", "B"], ["Europe/Warsaw", "B"], ["Europe/Moscow", "B"], ["Asia/Tokyo", "B"], ["Asia/Seoul", "B"],
  ["Europe/Vaduz", "B"], ["Africa/Cairo", "B"], ["", "B"],
];
let bad = 0;
for (const [tz, want] of cases) {
  const got = detectBand(tz);
  if (got !== want) { bad++; console.log("band", tz, got, "want", want); }
}
for (const tz of ["Europe/Berlin", "Europe/Athens", "Australia/Sydney"]) if (!isListedZone(tz)) { bad++; console.log("listed", tz); }
for (const tz of ["America/Chicago", "Asia/Tokyo", "Europe/Warsaw"]) if (isListedZone(tz)) { bad++; console.log("not listed", tz); }
const ed = [[["de-CH", "en"], "de"], [["en-GB"], "en"], [["ko-KR"], "kr"], [["ja"], "jp"], [["pt-BR"], "en"], [["fr-CA", "en"], "fr"], [["nl-BE"], "nl"], [["zh-CN", "es"], "es"]];
for (const [l, want] of ed) { const got = detectEdition(l, ""); if (got !== want) { bad++; console.log("edition", l, got, "want", want); } }
if (detectEdition(["pt"], "Asia/Tokyo") !== "jp" || detectEdition(["pt"], "Asia/Seoul") !== "kr") { bad++; console.log("tz fallback"); }
const hours = [[["en-US"], /^5\s?PM$/i], [["en-GB"], /^17:00$/], [["de-DE"], /^17:00$/], [["ja-JP"], /^17:00$/], [["ko-KR"], /5/], [["nl"], /^17:00$/], [["fr-FR"], /^17:00$/], [["en-AU"], /^5\s?pm$/i]];
for (const [l, re] of hours) { const got = formatHour(17, l); if (!re.test(got.replace(/\u202f|\u00a0/g, " "))) { bad++; console.log("hour", l, JSON.stringify(got)); } }
if (formatHour(17, ["xx-invalid-!!"]).length === 0) { bad++; console.log("hour fallback"); }
console.log(`locale: ${bad} problems`);
process.exit(bad ? 1 : 0);
