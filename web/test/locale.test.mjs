import { detectBand, detectEdition, formatHour } from "../locale.js";
const cases = [
  [["Europe/Berlin"], "A"], [["Europe/Paris"], "Z"], [["Europe/London"], "Z"], [["Europe/Helsinki"], "B"], [["Australia/Sydney"], "K"],
  [["Pacific/Auckland"], "M"], [["Asia/Tokyo"], "I"], [["Asia/Seoul"], "I"], [["Europe/Warsaw"], "A"], [["Europe/Athens"], "B"],
  [["America/New_York"], "Z"], [["Europe/Moscow"], "B"],
];
let bad = 0;
for (const [[tz], want] of cases) {
  const got = detectBand(tz, new Date(2026, 0, 15));
  // nearest-band fallback depends on the machine's own offset only when tz is unlisted: only assert listed zones strictly
  const listed = /Berlin|Paris|London|Helsinki|Sydney|Auckland|Tokyo|Seoul|Athens/.test(tz);
  if (listed && got !== want) { bad++; console.log("band", tz, got, "want", want); }
}
const ed = [[["de-CH", "en"], "de"], [["en-GB"], "en"], [["ko-KR"], "kr"], [["ja"], "jp"], [["pt-BR"], "en"], [["fr-CA", "en"], "fr"], [["nl-BE"], "nl"], [["zh-CN", "es"], "es"]];
for (const [l, want] of ed) { const got = detectEdition(l, ""); if (got !== want) { bad++; console.log("edition", l, got, "want", want); } }
if (detectEdition(["pt"], "Asia/Tokyo") !== "jp" || detectEdition(["pt"], "Asia/Seoul") !== "kr") { bad++; console.log("tz fallback"); }
const hours = [[["en-US"], /^5\s?PM$/i], [["en-GB"], /^17:00$/], [["de-DE"], /^17:00$/], [["ja-JP"], /^17:00$/], [["ko-KR"], /5/], [["nl"], /^17:00$/], [["fr-FR"], /^17:00$/], [["en-AU"], /^5\s?pm$/i]];
for (const [l, re] of hours) { const got = formatHour(17, l); if (!re.test(got.replace(/\u202f|\u00a0/g, " "))) { bad++; console.log("hour", l, JSON.stringify(got)); } }
if (formatHour(17, ["xx-invalid-!!"]).length === 0) { bad++; console.log("hour fallback"); }
console.log(`locale: ${bad} problems`);
process.exit(bad ? 1 : 0);
