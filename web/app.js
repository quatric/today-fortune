import { ZODIAC } from "./engine.js";
import { loadChannel, browserIo } from "./data.js";
import { EDITION_NAME, BAND_NAME, detectBand, detectEdition, formatHour, isListedZone } from "./locale.js";

const io = browserIo(new URL("../data/", import.meta.url));
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const TEXT = "\uFE0E"; // ask for text (not emoji) presentation
const GLYPH = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"].map((g) => g + TEXT);
const PLANETS = [["sun", "☉" + TEXT, "Sun", "#f4c95d"], ["moon", "☽" + TEXT, "Moon (noon)", "#e8e6f5"], ["mercury", "☿" + TEXT, "Mercury", "#5fd1c1"],
  ["venus", "♀" + TEXT, "Venus", "#f08fb0"], ["mars", "♂" + TEXT, "Mars", "#ff6b5e"], ["jupiter", "♃" + TEXT, "Jupiter", "#ffb45e"], ["saturn", "♄" + TEXT, "Saturn", "#c9b28c"]];
const TOPIC_LABEL = { love: "Love", work: "Work", study: "Study", communications: "Communications", money: "Money" };
// Approximate swatches for the channel's 23 colours (indices 0-22).
const SWATCH = ["#1a1a1a", "#8a8f98", "#c0c4cc", "#2e3a87", "#2f6fdf", "#7ec8f0", "#b7d7f5", "#14a3a3", "#1f6b3a", "#9bd15a",
  "#3fae49", "#d4a017", "#f5d90a", "#f28c28", "#d62828", "#ff2f92", "#f7a1c4", "#8b4a2b", "#6f4a2f", "#7a7a1e", "#8a4fd0", "#6a2c91", "#f5f5f5"];
const COLOUR_EN = ["Black", "Grey", "Silver", "Indigo", "Blue", "Light Blue", "Pastel Blue", "Blue-Green", "Dark Green", "Pea Green",
  "Green", "Gold", "Yellow", "Orange", "Red", "Hot Pink", "Pink", "Chestnut", "Brown", "Olive", "Violet", "Purple", "White"];
const RATING = ["Normal day", "Good day", "Very good day"];

// --- state ----------------------------------------------------------------------------------------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
const detected = { edition: detectEdition(), band: detectBand(tzName), tz: tzName, listed: isListedZone(tzName) };
const effective = () => {
  const edition = state.edition === "auto" ? detected.edition : state.edition;
  return { edition, band: state.band === "auto" ? detected.band : state.band };
};
const defaults = { people: [{ name: "", birth: "" }], mode: "auto", date: "", edition: "auto", band: "auto" };
const clean = (s) => {
  s = s && typeof s === "object" ? s : {};
  const people = (Array.isArray(s.people) ? s.people : []).slice(0, 6)
    .map((p) => ({ name: String(p?.name ?? "").slice(0, 24), birth: String(p?.birth ?? "").slice(0, 10) }));
  return { ...defaults, mode: ["auto", "today", "tomorrow", "date"].includes(s.mode) ? s.mode : "auto", date: String(s.date ?? ""),
    edition: typeof s.edition === "string" ? s.edition : "auto", band: typeof s.band === "string" ? s.band : "auto",
    people: people.length ? people : defaults.people };
};
const restored = store.get("tt-state", null); // a list saved on an earlier visit
const state = clean(restored);
const hadList = () => state.people.some((p) => p.birth);
const save = () => store.set("tt-state", state);

function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return null;
  const d = [+m[1], +m[2], +m[3]], t = new Date(Date.UTC(d[0], d[1] - 1, d[2]));
  if (t.getUTCMonth() !== d[1] - 1 || d[0] < 1881 || d[0] > 2036) return null;
  return d;
}
const fmtDay = (d) => new Date(d[0], d[1] - 1, d[2]).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
const signOf = (deg) => ((Math.floor((deg - 1) / 30) % 12) + 12) % 12;
const degIn = (deg) => ((((deg - 1) % 30) + 30) % 30) + 1;

function resolveDay() {
  const now = new Date(), ymd = (d) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  let mode = state.mode;
  if (mode === "date") { const d = parseDate(state.date); return d ? { mode, day: d } : null; }
  if (mode === "auto") mode = now.getHours() >= 17 ? "tomorrow" : "today";
  return { mode, day: ymd(mode === "tomorrow" ? tomorrow : now) };
}

// --- controls -------------------------------------------------------------------------------------
function drawPeople() {
  $("#people").innerHTML = state.people.map((p, i) => `
    <li class="person" data-i="${i}">
      <label class="field">Name<input data-f="name" type="text" maxlength="24" value="${esc(p.name)}" placeholder="Person ${i + 1}" autocomplete="off"></label>
      <label class="field">Birth date<input data-f="birth" type="date" min="1881-01-01" max="2036-12-31" value="${esc(p.birth)}"></label>
      <button type="button" class="icon-btn" data-remove aria-label="Remove ${esc(p.name || "person " + (i + 1))}" ${state.people.length === 1 ? "disabled" : ""}>×</button>
    </li>`).join("");
  $("#add").disabled = state.people.length >= 6;
}
function drawControls() {
  document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === state.mode)));
  $("#date-wrap").hidden = state.mode !== "date";
  $("#date").value = state.date;
  $("#edition").value = state.edition;
  $("#band").value = state.band;
  const eff = effective();
  $("#band-wrap").hidden = eff.edition === "kr" || eff.edition === "jp";
  $("#edition").options[0].textContent = `Automatic (${EDITION_NAME[detected.edition]})`;
  $("#band").options[0].textContent = `Automatic (${BAND_NAME[detected.band]})`;
  $("#detected").textContent = `Detected from your device: ${EDITION_NAME[detected.edition]}${detected.tz ? `, ${detected.tz}` : ""}. ` +
    (detected.listed ? "" : `That is not one of the countries the channel lists, so it uses its default table (${BAND_NAME[detected.band]}), as a real console does. `) +
    "Choose a different edition or zone above to override.";
  const five = formatHour(17);
  $("#when-note").textContent = { auto: `Opens on today's fortune before ${five} and on tomorrow's from ${five}, as the channel did.`,
    today: "The date is your device's date.", tomorrow: "Tomorrow, from your device's date.", date: "Any date from 1881 to 2036." }[state.mode];
}

$("#people").addEventListener("input", (e) => {
  const li = e.target.closest(".person"); if (!li) return;
  state.people[+li.dataset.i][e.target.dataset.f] = e.target.value; save(); scheduleRefresh();
});
$("#people").addEventListener("click", (e) => {
  if (!e.target.matches("[data-remove]")) return;
  state.people.splice(+e.target.closest(".person").dataset.i, 1); save(); drawPeople(); refresh();
});
$("#add").addEventListener("click", () => {
  if (state.people.length < 6) { state.people.push({ name: "", birth: "" }); save(); drawPeople(); $("#people li:last-child input").focus(); }
});
$("#example").addEventListener("click", () => {
  state.people = [{ name: "Ann", birth: "1990-05-17" }, { name: "Bob", birth: "1988-02-03" }]; save(); drawPeople(); refresh();
});
document.querySelector(".seg").addEventListener("click", (e) => {
  if (e.target.dataset.mode) { state.mode = e.target.dataset.mode; save(); drawControls(); refresh(); }
});
for (const [id, key] of [["#date", "date"], ["#edition", "edition"], ["#band", "band"]]) {
  $(id).addEventListener("change", (e) => { state[key] = e.target.value; save(); drawControls(); refresh(); });
}
let timer;
const scheduleRefresh = () => { clearTimeout(timer); timer = setTimeout(refresh, 250); };

// --- rendering ------------------------------------------------------------------------------------
const channels = new Map();
function getChannel() {
  const eff = effective();
  const release = eff.edition === "kr" || eff.edition === "jp" ? eff.edition : "eu";
  const opts = { release, lang: release === "eu" ? eff.edition : "en", band: release === "eu" ? eff.band : "I" };
  const key = JSON.stringify(opts);
  if (!channels.has(key)) channels.set(key, loadChannel(io, opts));
  return channels.get(key);
}

const ring = (total) => {
  const c = 2 * Math.PI * 48;
  return `<svg class="ring" viewBox="0 0 118 118" role="img" aria-label="${total} points out of 100">
    <circle class="track" cx="59" cy="59" r="48" fill="none" stroke-width="9"/>
    <circle class="value" cx="59" cy="59" r="48" fill="none" stroke-width="9" transform="rotate(-90 59 59)"
      stroke-dasharray="${c}" stroke-dashoffset="${c}" data-offset="${c * (1 - total / 100)}"/>
    <text class="num" x="59" y="67">${total}</text><text class="of" x="59" y="85">points</text></svg>`;
};
const starsHtml = (n) => `<span class="stars" role="img" aria-label="${n} of 5 stars">${"★".repeat(n)}<span class="off">${"★".repeat(5 - n)}</span></span>`;

function personCard(ch, p, i, day) {
  const f = ch.fortune(p.birth, day), col = ch.colour(p.birth, day), sun = ch.ephemeris.fields(...p.birth)[0];
  const name = p.name.trim() || `Person ${i + 1}`;
  const colourName = col.name || COLOUR_EN[col.index]; // the Japanese build has no names of its own
  return `<article class="panel card">
    <div class="card-head">
      ${ring(f.total)}
      <div class="who">
        <h2 class="name">${esc(name)}</h2>
        <p class="sub"><span class="glyph" aria-hidden="true">${GLYPH[f.sign]}</span> ${ZODIAC[f.sign]}, Sun at ${degIn(sun)}° &middot; born ${esc(fmtDay(p.birth))}</p>
        <span class="chip-colour"><span class="swatch" style="background:${SWATCH[col.index]}"></span>Lucky colour: ${esc(colourName)}</span>
      </div>
    </div>
    <ul class="topics">${f.topics.map((t) => `
      <li class="topic"><div><h3>${TOPIC_LABEL[t.topic]}</h3>${starsHtml(t.stars)}<span class="pts">${t.points} points</span></div>
        <p class="msg ${t.text ? "" : "num"}" lang="${ch.release === "kr" ? "ko" : ch.release === "jp" ? "ja" : ch.lang}">${t.text ? esc(t.text) : `Message #${t.number}`}</p></li>`).join("")}
    </ul></article>`;
}

function groupCard(ch, people, day) {
  const births = people.map((p) => p.birth), h = ch.hints(births, day);
  let compat = "";
  if (births.length >= 2) {
    const r = ch.compat(births, day), next = r === 2 ? null : ch.nextGreatDay(births, day);
    compat = `<p class="lab">Compatibility of ${births.length} people</p>
      <span class="badge r${r}">${RATING[r]}</span>
      ${next ? `<p class="hint">The next very good day for this group is <strong>${esc(fmtDay(next))}</strong>.</p>` : r === 2 ? "" : `<p class="hint">No very good day in the next 90 days.</p>`}`;
  }
  const chips = (list) => `<div class="chips">${list.map((w) => `<span class="chip">${esc(w)}</span>`).join("")}</div>`;
  return `<article class="panel card"><h2>${births.length > 1 ? "The group" : "Hints"}</h2>${compat}
    <p class="lab">Food</p>${chips(h.food)}<p class="lab">Fun</p>${chips(h.fun)}
    <p class="lab">Care</p>${chips(h.care)}</article>`;
}

// "The sky today" / "The sky tomorrow" when the chosen day is one of those, otherwise "The sky that day".
function skyTitle(day) {
  const now = new Date(), same = (t) => day[0] === t.getFullYear() && day[1] === t.getMonth() + 1 && day[2] === t.getDate();
  if (same(now)) return "The sky today";
  if (same(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))) return "The sky tomorrow";
  return "The sky that day";
}
function skyCard(ch, people, day) {
  const sky = ch.sky(day), R = 185, R2 = 150, cx = 200, cy = 200;
  const pt = (lon, r) => { const a = Math.PI + (lon * Math.PI) / 180; return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
  let svg = "";
  for (let i = 0; i < 12; i++) {
    const [x1, y1] = pt(i * 30, R), [x2, y2] = pt(i * 30 + 30, R), [x3, y3] = pt(i * 30 + 30, R2), [x4, y4] = pt(i * 30, R2);
    const [gx, gy] = pt(i * 30 + 15, (R + R2) / 2);
    svg += `<path d="M${x1} ${y1} A${R} ${R} 0 0 0 ${x2} ${y2} L${x3} ${y3} A${R2} ${R2} 0 0 1 ${x4} ${y4} Z" fill="${i % 2 ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.13)"}" stroke="rgba(255,255,255,.2)"/>
      <text x="${gx}" y="${gy + 6}" text-anchor="middle" font-size="19" fill="#f4c95d">${GLYPH[i]}</text>`;
  }
  svg += `<circle cx="${cx}" cy="${cy}" r="${R2}" fill="rgba(10,8,30,.5)" stroke="rgba(255,255,255,.2)"/>`;
  const placed = [];
  for (const [key, sym, name, colour] of [...PLANETS].sort((a, b) => sky[a[0]] - sky[b[0]])) {
    let r = 118, tries = 0;
    while (placed.some((q) => Math.abs(q.lon - sky[key]) < 9 && Math.abs(q.r - r) < 16) && tries++ < 6) r -= 17;
    placed.push({ lon: sky[key], r });
    const [x, y] = pt(sky[key], r), [tx, ty] = pt(sky[key], R2);
    svg += `<line x1="${x}" y1="${y}" x2="${tx}" y2="${ty}" stroke="${colour}" stroke-opacity=".35"/>
      <text x="${x}" y="${y + 8}" text-anchor="middle" font-size="24" fill="${colour}"><title>${name}</title>${sym}</text>`;
  }
  people.forEach((p, i) => {
    const sun = ch.ephemeris.fields(...p.birth)[0], [x, y] = pt(sun, R2 - 8), label = (p.name.trim() || `P${i + 1}`)[0].toUpperCase();
    svg += `<circle cx="${x}" cy="${y}" r="9" fill="#f4c95d" stroke="#14122b" stroke-width="2"><title>${esc(p.name.trim() || `Person ${i + 1}`)}: natal Sun</title></circle>
      <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#14122b">${esc(label)}</text>`;
  });
  const legend = PLANETS.map(([key, sym, name, colour]) => `<li><span class="sym" style="color:${colour}" aria-hidden="true">${sym}</span> <b>${name}</b> <span>${degIn(sky[key])}° ${ZODIAC[signOf(sky[key])]}</span></li>`).join("");
  return `<article class="panel card night"><h2>${esc(skyTitle(day))}</h2>
    <p class="hint">${esc(fmtDay(day))}. Positions are the channel's own table, in whole degrees; the gold dots are the natal Suns.</p>
    <div class="sky-body"><svg class="wheel" viewBox="0 0 400 400" role="img" aria-label="Zodiac wheel showing the planets on ${esc(fmtDay(day))}">${svg}</svg>
    <ul class="legend">${legend}</ul></div></article>`;
}

let token = 0, welcome = restored !== null && hadList();
async function refresh() {
  const mine = ++token, status = $("#status"), out = $("#results");
  const today = resolveDay();
  const people = state.people.map((p, i) => ({ ...p, i, birth: parseDate(p.birth) })).filter((p) => p.birth);
  const bad = state.people.some((p) => p.birth && !parseDate(p.birth));
  status.className = "status";
  if (!today) { status.textContent = "Pick a date between 1881 and 2036."; status.classList.add("error"); out.innerHTML = ""; return; }
  const warn = bad ? "Birth dates must be between 1881 and 2036. " : "";
  status.textContent = warn;
  if (bad) status.classList.add("error");
  if (!people.length) {
    out.innerHTML = `<div class="panel empty"><span class="glyph" aria-hidden="true">☉\uFE0E☽\uFE0E</span>Enter a birth date, or <button class="btn ghost" id="try" type="button">try an example</button></div>`;
    $("#try").addEventListener("click", () => $("#example").click());
    return;
  }
  if (!out.querySelector(".card")) out.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
  let ch;
  try { ch = await getChannel(); } catch (e) { status.textContent = `Could not load the data (${e.message}). Serve this folder over http.`; status.classList.add("error"); return; }
  if (mine !== token) return;
  const day = today.day;
  shownKey = JSON.stringify(today); scheduleBoundary();
  const names = people.map((p) => p.name.trim()).filter(Boolean);
  const back = welcome && names.length ? `Welcome back, ${new Intl.ListFormat(navigator.languages?.[0], { style: "long", type: "conjunction" }).format(names)}. ` : ""; welcome = false;
  status.textContent = `${warn}${back}${today.mode === "date" ? "" : today.mode === "tomorrow" ? "Tomorrow: " : "Today: "}${fmtDay(day)}`;
  out.innerHTML = people.map((p) => personCard(ch, p, p.i, day)).join("") +
    `<div class="grid2">${groupCard(ch, people, day)}${skyCard(ch, people, day)}</div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => out.querySelectorAll(".ring .value").forEach((c) => { c.style.strokeDashoffset = c.dataset.offset; })));
}

drawPeople(); drawControls(); refresh();

// --- keeping the list: saved on this device, refreshed whenever the day (or the channel's evening switch) comes round ---
$("#forget").addEventListener("click", () => {
  state.people = [{ name: "", birth: "" }]; save(); drawPeople(); drawControls(); refresh();
});
window.addEventListener("storage", (e) => { // the same page open in another tab
  if (e.key !== "tt-state") return;
  Object.assign(state, clean(store.get("tt-state", null))); drawPeople(); drawControls(); refresh();
});
let boundary;
function scheduleBoundary() {
  clearTimeout(boundary);
  const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  if (state.mode === "auto") { const five = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 1); if (five > now && five < next) next.setTime(five.getTime()); }
  boundary = setTimeout(() => { refresh(); }, Math.min(next - now, 2 ** 31 - 1));
}
let shownKey = "";
document.addEventListener("visibilitychange", () => { if (!document.hidden) { const r = resolveDay(); if (r && JSON.stringify(r) !== shownKey) refresh(); scheduleBoundary(); } });
window.addEventListener("focus", () => { const r = resolveDay(); if (r && JSON.stringify(r) !== shownKey) refresh(); });

// --- background music (off by default; the browser only allows sound after a click) ------------------
const music = (() => {
  const btn = $("#music"), label = $(".toggle-label", btn), URL_ = new URL("assets/bgm.mp3", import.meta.url);
  let ctx, gain, source, buffer, on = false, wanted = store.get("tt-music", false);
  const show = () => { btn.setAttribute("aria-pressed", String(on)); label.textContent = on ? "Music on" : "Music off"; };
  // bgm.mp3 is one 40-bar loop followed by its release tail and silence; folding the tail
  // back onto the start is how the second pass sounds in the channel. Measured at 44.1 kHz.
  const LOOP_SECONDS = 2351680 / 44100;
  function seamless(buf) {
    const len = Math.min(buf.length, Math.round(LOOP_SECONDS * buf.sampleRate));
    const out = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const src = buf.getChannelData(c), dst = out.getChannelData(c);
      dst.set(src.subarray(0, len));
      for (let i = len; i < src.length; i++) dst[(i - len) % len] += src[i];
    }
    return out;
  }
  async function start() {
    on = true; show(); store.set("tt-music", true);
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      gain = gain || Object.assign(ctx.createGain(), {}); gain.connect(ctx.destination);
      if (ctx.state === "suspended") await ctx.resume();
      buffer = buffer || await fetch(URL_).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then(seamless);
      if (!on) return;
      source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true; source.connect(gain); // looping buffer: no gap
      gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setValueAtTime(0, ctx.currentTime); gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 1.2);
      source.start();
    } catch (e) { on = false; show(); btn.title = "Music could not be played on this device"; }
  }
  function stop() {
    on = false; show(); store.set("tt-music", false);
    if (!source) return;
    const s = source; source = null;
    gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime); gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
    setTimeout(() => { try { s.stop(); } catch { /* already stopped */ } }, 450);
  }
  btn.addEventListener("click", (e) => { wanted = false; on ? stop() : start(); });
  document.addEventListener("visibilitychange", () => { if (ctx && on) document.hidden ? ctx.suspend() : ctx.resume(); });
  // If music was on last visit, resume it on the first click or key press (browsers block sound before that).
  if (wanted) {
    btn.title = "Music will resume when you click anywhere";
    const resume = (e) => { if (wanted && !btn.contains(e.target)) start(); wanted = false; removeEventListener("pointerdown", resume); removeEventListener("keydown", resume); };
    addEventListener("pointerdown", resume); addEventListener("keydown", resume);
  }
  show();
  return { get on() { return on; } };
})();

// --- sky: the banner's background colours, its Start animation and then its Loop, in the banner's 60 fps frames ---
const sky = (() => {
  const el = $(".sky"), still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // [frame, edge colour, middle colour]; the banner's keys all have zero slope, so every channel eases between them
  const START = [[0, 0x8696f2, 0xa0f3ec], [240, 0x8696f2, 0xa0f3ec], [290, 0xffaa91, 0xfffbc5]];
  const LOOP = [[100, 0xffaa91, 0xfffbc5], [300, 0xffa9b3, 0xffeace], [500, 0xffa9b3, 0xffeace], [700, 0xc898ff, 0xffe1ff],
    [800, 0xc898ff, 0xffe1ff], [1100, 0x82e3a6, 0xe6ffea], [1200, 0x82e3a6, 0xe6ffea], [1450, 0xffaa91, 0xfffbc5]];
  const LOOP_FROM = 391, LOOP_LEN = 1501;
  const NIGHT = [[14, 17, 26], [42, 51, 72]], TINT = [.16, .12]; // how much of the banner's colour shows through the dark theme
  const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  function sample(keys, f) {
    const k = keys.findIndex((key) => key[0] > f);
    if (k <= 0) { const key = keys.at(k); return [rgb(key[1]), rgb(key[2])]; }
    const [f0, e0, m0] = keys[k - 1], [f1, e1, m1] = keys[k], t = (f - f0) / (f1 - f0), s = t * t * (3 - 2 * t);
    const mix = (a, b) => rgb(a).map((v, j) => v + (rgb(b)[j] - v) * s);
    return [mix(e0, e1), mix(m0, m1)];
  }
  let rootAt = -Infinity;
  function paint(frame, now) {
    let cols = frame < LOOP_FROM ? sample(START, frame) : sample(LOOP, (frame - LOOP_FROM) % LOOP_LEN);
    if (document.documentElement.dataset.theme === "dark") cols = cols.map((c, i) => c.map((v, j) => NIGHT[i][j] + (v - NIGHT[i][j]) * TINT[i]));
    const [edge, mid] = cols.map((c) => `rgb(${c.map(Math.round).join(" ")})`);
    el.style.setProperty("--sky-edge", edge); el.style.setProperty("--sky-mid", mid);
    // Mobile browsers show the root background under a sliding toolbar or on fast scrolls, so it follows the sky;
    // only once a second, since changing it can repaint the whole page.
    if (now - rootAt >= 1000) { rootAt = now; document.documentElement.style.backgroundColor = edge; }
  }
  const t0 = performance.now(), frameAt = (now) => still ? 0 : (now - t0) * .06;
  let last = -Infinity;
  const tick = (now) => { if (now - last >= 50) { last = now; paint(frameAt(now), now); } requestAnimationFrame(tick); };
  if (still) paint(0, t0); else requestAnimationFrame(tick);
  return { repaint: () => { rootAt = -Infinity; const now = performance.now(); paint(frameAt(now), now); } };
})();

// --- theme: follows the device until the toggle saves a choice -----------------------------------------
(() => {
  const btn = $("#theme"), label = $(".toggle-label", btn), system = matchMedia("(prefers-color-scheme: dark)");
  let saved = store.get("tt-theme", null);
  function apply(t) {
    document.documentElement.dataset.theme = t;
    btn.setAttribute("aria-pressed", String(t === "dark")); label.textContent = t === "dark" ? "Dark" : "Light";
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.content = t === "dark" ? "#0e111a" : "#8696f2";
    sky.repaint();
  }
  apply(saved === "dark" || saved === "light" ? saved : system.matches ? "dark" : "light");
  system.addEventListener("change", (e) => { if (!saved) apply(e.matches ? "dark" : "light"); });
  btn.addEventListener("click", () => { saved = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; store.set("tt-theme", saved); apply(saved); });
})();

// --- wheels: on desktop, grab a background wheel and fling it like a fidget spinner ---------------------
(() => {
  const html = document.documentElement, still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const desktop = matchMedia("(hover: hover) and (pointer: fine)");
  // Only bare background starts a spin, never a card, the logo, text or a control.
  const bare = new Set([html, document.body, $("main"), $(".hero"), $("footer"), $(".sky")]);
  const wheels = [...document.querySelectorAll(".bg-wheel")].map((el) => ({ el, live: false, angle: 0, spin: 0, idle: 0, drag: null }));
  const deg = (y, x) => Math.atan2(y, x) * 180 / Math.PI;
  const draw = (w) => { w.el.style.transform = `rotate(${w.angle}deg)`; };

  function hit(x, y) {
    for (const w of wheels) {
      const r = w.el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      // the outer ring sits at 245.5 of the image's 256 radius
      if (Math.hypot(x - cx, y - cy) <= w.el.offsetWidth / 2 * .96) return { w, cx, cy };
    }
    return null;
  }

  // The first grab hands a wheel from its CSS animation to this loop, at the same angle and idle speed.
  let looping = false, last = 0;
  function take(w) {
    if (w.live) return;
    const m = new DOMMatrix(getComputedStyle(w.el).transform);
    w.angle = deg(m.b, m.a);
    w.idle = w.spin = still ? 0 : -360 / parseFloat(getComputedStyle(w.el).animationDuration);
    w.el.style.animation = "none"; w.live = true; draw(w);
    if (!looping) { looping = true; last = performance.now(); requestAnimationFrame(frame); }
  }
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    for (const w of wheels) {
      if (!w.live || w.drag) continue;
      w.spin += (w.idle - w.spin) * (1 - Math.exp(-dt / 2.5)); // friction eases a fling back to the idle turn
      w.angle += w.spin * dt; draw(w);
    }
    requestAnimationFrame(frame);
  }

  addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" || !desktop.matches || e.button !== 0 || !bare.has(e.target)) return;
    const h = hit(e.clientX, e.clientY);
    if (!h) return;
    e.preventDefault(); take(h.w);
    h.w.drag = { cx: h.cx, cy: h.cy, at: deg(e.clientY - h.cy, e.clientX - h.cx), samples: [[e.timeStamp, h.w.angle]] };
    e.target.setPointerCapture?.(e.pointerId);
    html.classList.add("spinning");
  });
  addEventListener("pointermove", (e) => {
    const w = wheels.find((w) => w.drag);
    if (!w) {
      html.classList.toggle("grabbable", e.pointerType !== "touch" && desktop.matches && bare.has(e.target) && !!hit(e.clientX, e.clientY));
      return;
    }
    const d = w.drag, at = deg(e.clientY - d.cy, e.clientX - d.cx);
    w.angle += ((at - d.at + 540) % 360) - 180; d.at = at; draw(w);
    d.samples.push([e.timeStamp, w.angle]);
    while (d.samples.length > 2 && e.timeStamp - d.samples[0][0] > 100) d.samples.shift();
  });
  function release(e) {
    const w = wheels.find((w) => w.drag);
    if (!w) return;
    const s = w.drag.samples, [t0, a0] = s[0], [t1, a1] = s[s.length - 1];
    // a wheel held still before letting go just drifts back to idle
    w.spin = t1 > t0 && e.timeStamp - t1 < 80 ? Math.max(-2160, Math.min(2160, (a1 - a0) / (t1 - t0) * 1000)) : 0;
    w.drag = null; html.classList.remove("spinning");
  }
  addEventListener("pointerup", release); addEventListener("pointercancel", release);
})();
