#!/usr/bin/env python3
"""Fortune maths of the Wii "Today & Tomorrow Channel" (Europe / Korea / Japan builds).

Everything here was reconstructed from the shipped files and the decompiled main program.
You need your own dump of the channel:
  * the main program, LZ11-decompressed (content 0x01 in the EU/KR WADs, 0x0d in the JP one;
    `today_fortune.py decompress IN OUT` does the LZ11 step)
  * for EU/KR: the data archive (content 0x06) unpacked to a folder (needs logic/ text/ color/)
  * for JP: nothing else, the data is embedded in the program

Examples (EU):
  today_fortune.py --dol 00000001.app --data 00000006.d fortune Ann=1990-05-17 Bob=1988-02-03   # like the channel: today, or tomorrow from 17:00
  today_fortune.py --dol 00000001.app --data 00000006.d fortune 1990-05-17 --when both
  today_fortune.py --dol 00000001.app --data 00000006.d hints 1990-05-17 1988-02-03 --when tomorrow
  today_fortune.py --dol 00000001.app --data 00000006.d compat 1990-05-17 1988-02-03 --day 2026-09-18 --json
Korea / Japan: add --release kr|jp (band I is used automatically).
"""
import argparse
import datetime
import functools
import re
import struct
import sys

TOPICS = ("love", "work", "study", "communications", "money")
ZODIAC = ("Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius",
          "Capricorn", "Aquarius", "Pisces")
# Natal ephemeris field used per topic: Venus, Saturn, Mercury, Moon@0h, Jupiter, (Sun = topic 5).
NATAL_FIELD = (1, 3, 4, 2, 5, 0)
DAY_FIELD = 7  # the day's Moon at about noon
FIELD_NAMES = ("Sun", "Venus", "Moon@0h", "Saturn", "Mercury", "Jupiter", "Mars", "Moon@12h", "-")
LANGS = {"en": 1, "de": 2, "fr": 3, "es": 4, "it": 5, "nl": 6}


# --------------------------------------------------------------------------------------------
# small helpers

def lz11(src):
    """Nintendo LZ11 decompression (how the WAD stores the main program)."""
    if src[0] != 0x11:
        raise ValueError("not LZ11 data")
    size, p, out = int.from_bytes(src[1:4], "little"), 4, bytearray()
    while len(out) < size:
        flags = src[p]
        p += 1
        for bit in range(8):
            if len(out) >= size:
                break
            if flags & (0x80 >> bit):
                b0 = src[p]
                kind = b0 >> 4
                if kind == 0:
                    cnt, disp, p = (((b0 & 15) << 4) | (src[p + 1] >> 4)) + 0x11, ((src[p + 1] & 15) << 8) | src[p + 2], p + 3
                elif kind == 1:
                    cnt = (((b0 & 15) << 12) | (src[p + 1] << 4) | (src[p + 2] >> 4)) + 0x111
                    disp, p = ((src[p + 2] & 15) << 8) | src[p + 3], p + 4
                else:
                    cnt, disp, p = kind + 1, ((b0 & 15) << 8) | src[p + 1], p + 2
                for _ in range(cnt):
                    out.append(out[-(disp + 1)])
            else:
                out.append(src[p])
                p += 1
    return bytes(out[:size])


class Dol:
    """A DOL image addressed by virtual address."""

    def __init__(self, path):
        self.data = open(path, "rb").read()
        h = struct.unpack(">64I", self.data[:256])
        self.sections = [(h[i], h[18 + i], h[36 + i]) for i in range(18) if h[36 + i]]

    def off(self, va):
        for o, a, size in self.sections:
            if a <= va < a + size:
                return o + va - a
        return None

    def u8(self, va):
        return self.data[self.off(va)]

    def u32(self, va):
        o = self.off(va)
        return struct.unpack(">I", self.data[o:o + 4])[0]

    def raw(self, va, n):
        o = self.off(va)
        return self.data[o:o + n]

    def text(self, va, enc):
        """NUL-terminated string; enc 'utf16' (2-byte NUL) or 'sjis'. Layout newlines are dropped."""
        o = self.off(va) if va else None
        if o is None:
            return ""
        e = o
        if enc == "utf16":
            while self.data[e:e + 2] != b"\0\0":
                e += 2
            s = self.data[o:e].decode("utf-16-be", "replace")
        else:
            s = self.data[o:self.data.index(b"\0", o)].decode("cp932", "replace")
        return s.replace("\n ", "").replace("\n", "")


class Ephemeris:
    """Daily records: u16 year, u8 month, u8 day, then nine 9-bit longitudes (whole degrees)."""

    def __init__(self, blob):
        self.blob = blob
        self.index = {(struct.unpack(">H", blob[i:i + 2])[0], blob[i + 2], blob[i + 3]): i
                      for i in range(0, len(blob) - 15, 16)}

    def fields(self, y, m, d):
        try:
            i = self.index[(y, m, d)]
        except KeyError:
            raise ValueError("date outside 1881-01-01..2036-12-31") from None
        bits = int.from_bytes(self.blob[i + 4:i + 16], "big")
        out = []
        for k in range(9):
            word = (bits >> (64 - 32 * (k // 3))) & 0xFFFFFFFF
            out.append((word >> (32 - 9 - 9 * (k % 3))) & 0x1FF)
        return out


# --------------------------------------------------------------------------------------------
# per-release addresses (virtual addresses inside the decompressed program)

EU_STR = {1: 0x8030CE70, 2: 0x8030F42C, 3: 0x8030DB04, 4: 0x803100C0, 5: 0x8030E798, 6: 0x80310D54}
EU_CARE = {1: 0x8027E260, 2: 0x8027FBB0, 3: 0x8027EAD0, 4: 0x80280420, 5: 0x8027F340, 6: 0x80280C90}

RELEASES = {
    "eu": dict(band="A", scores=(0x802C6710, 28, 0x2760), colour_names=460),
    "kr": dict(band="I", scores=(0x802D7738, 28, 0x2760), colour_names=450, colour_table=0x80270C10,
               strtab=0x802EECE0, meal_ids=0x802B9220, meal_n=58, meal_a=0x802B95E0, meal_b=0x802B9A18,
               play_tab=0x802B9E50, play_ids=0x802B94E4, play_n=62, care_rows=0x802BA288,
               care_ids=0x802B9440, care_n=40, level=0x802B9418),
    "jp": dict(band="I", scores=(0x8036C448, 20, 0x1C20), colour_table=0x80376D08, eph=0x80260E70,
               meal_words=0x803C16B8, meal_n=53, meal_a=0x803C1860, meal_b=0x803C1C98,
               play_tab=0x803C2A98, play_words=0x803E39F4, play_n=56, care_rows=0x803C2178,
               care_words=0x803E3950, care_n=32, level=0x803E3900),
}


class Channel:
    def __init__(self, dol, data=None, release="eu", band=None, lang="en"):
        self.rel, self.cfg = release, RELEASES[release]
        self.dol = Dol(dol)
        self.data_dir = data
        self.band = band or self.cfg["band"]
        self.lang = lang
        if "eph" in self.cfg:  # Japan: ephemeris is embedded (56,978 records x 16 bytes)
            self.eph = Ephemeris(self.dol.raw(self.cfg["eph"], 56978 * 16))
        else:
            self.eph = Ephemeris(self._read(f"logic/wii_ephemeris_decimal_{self.band}.bin"))
        base, stride, tstride = self.cfg["scores"]
        self.scores = [[self.dol.u8(base + t * tstride + i * stride + 2) for i in range(360)] for t in range(6)]

    def _read(self, rel):
        if not self.data_dir:
            raise SystemExit("--data <folder with logic/ text/ color/> is required for this release")
        return open(f"{self.data_dir}/{rel}", "rb").read()

    # ----- fortune ---------------------------------------------------------------------------
    @staticmethod
    def day_flags(y, m, d):
        """Per-date modifier flags (5 topics + overall): a fixed hash of the date."""
        seed, step, flags = (y * d) << m, y % 100, []
        for k in range(6):
            flags.append((seed % 100) < (30 if k == 5 else 80))
            seed += step
        return flags

    @staticmethod
    def stars(points):
        return {0: 1, 2: 1, 4: 2, 6: 2, 20: 5}.get(points, (points - 10) // 2 + 1 if 10 <= points <= 19 else 0)

    def position(self, birth, day, topic):
        """Index 0..359 into the score table / message list for one topic."""
        pos = (self.eph.fields(*birth)[NATAL_FIELD[topic]] + self.eph.fields(*day)[DAY_FIELD]) % 360
        return 359 if pos == 0 else pos - 1

    def raw_scores(self, birth, day):
        return [self.scores[t][self.position(birth, day, t)] for t in range(5)]

    def message(self, topic, idx):
        if self.rel == "jp":  # original text is embedded as up to four Shift-JIS lines per entry
            base, stride, tstride = self.cfg["scores"]
            entry = base + topic * tstride + idx * stride
            return "".join(self.dol.text(self.dol.u32(entry + 4 + 4 * k), "sjis") for k in range(4))
        f = "kr" if self.rel == "kr" else self.lang
        text = self._read(f"text/fortune_{f}.txt").decode("utf-16").lstrip("﻿").split("\r")
        return text[topic * 360 + idx].replace("\t", " ")

    def fortune(self, birth, day):
        flags = self.day_flags(*day)
        topics, total, stars = [], 0, []
        for t in range(5):
            idx = self.position(birth, day, t)
            score = min(self.scores[t][idx], 20)
            if flags[t]:  # penalty on ~80% of dates
                score = {13: 6, 12: 4, 11: 2, 10: 0}.get(score, score)
            stars.append(self.stars(score))
            total += score
            topics.append(dict(topic=TOPICS[t], index=idx, points=score, stars=stars[-1], text=self.message(t, idx)))
        total = max(0, min(100, total))
        if flags[5]:  # ~30% of dates: bonus for a strong day; a perfect 100 needs four 5-star topics
            if total > 79:
                total = min(100, total + 10)
            if total == 100 and stars[:4] != [5, 5, 5, 5]:
                total = 99
        sun = self.eph.fields(*birth)[0]
        return dict(sign=ZODIAC[((sun - 1) // 30) % 12], total=total, flags=[int(f) for f in flags], topics=topics)

    # ----- lucky colour ----------------------------------------------------------------------
    @functools.cached_property
    def _colour_rows(self):
        if "colour_table" in self.cfg:  # KR/JP: 16,071 embedded rows of u16 y, u8 m, u8 d, 12 x 5 bits
            rows = []
            for i in range(16071):
                o = self.cfg["colour_table"] + 12 * i
                y, m, d = struct.unpack(">HBB", self.dol.raw(o, 4))
                w1, w2 = self.dol.u32(o + 4), self.dol.u32(o + 8)
                rows.append(((y, m, d), [(w >> (27 - 5 * k)) & 31 for w in (w1, w2) for k in range(6)]))
            return rows
        rows = []
        for line in self._read(f"color/wii_color_japanese_{self.band}.txt").decode("cp932").split("\r\n")[1:]:
            m = re.match(r"(\d+)\D+(\d+)\D+(\d+)\D+,(.*)", line)
            if m:
                rows.append(((int(m[1]), int(m[2]), int(m[3])), [int(x) for x in m[4].split(",")]))
        return rows

    def colour(self, birth, day):
        """Lucky colour index (0-22) and, where known, its name."""
        sign = ((self.eph.fields(*birth)[0] - 1) // 30) % 12
        rows = self._colour_rows
        by_date = dict(rows)
        row = by_date[day] if 2007 <= day[0] <= 2036 else rows[(day[2] + (day[0] << day[1])) % 16071][1]
        idx = row[sign]
        name = None
        if self.rel == "eu":
            name = self._eu_string(self.cfg["colour_names"] + idx)
        elif self.rel == "kr":
            name = self.dol.text(self.dol.u32(self.cfg["strtab"] + 4 * (self.cfg["colour_names"] + idx)), "utf16")
        return idx, name

    def _eu_string(self, sid):
        return self.dol.text(self.dol.u32(EU_STR[LANGS[self.lang]] + 4 * sid), "utf16")

    # ----- compatibility ---------------------------------------------------------------------
    SPREAD = {2: (0.5, 1.0), 3: (1.0, 2.0), 4: (1.5, 2.5), 5: (2.0, 3.0), 6: (2.5, 3.0)}

    def compat(self, births, day):
        """0 = normal, 1 = good, 2 = very good day for a group of 2-6."""
        n = len(births)
        rows = [self.raw_scores(b, day) for b in births]
        a, b, c = [r[3] for r in rows], [r[0] for r in rows], [r[1] for r in rows]  # Moon, Venus, Saturn scores
        mean_a, mean_b, low = sum(a) / n, sum(b) / n, min(c)
        if low > 12:
            da, db = self.SPREAD[n]
            if all(abs(x - mean_a) <= da for x in a) and all(abs(x - mean_b) <= db for x in b):
                return 2
        if mean_a + mean_b - low > 21:
            return 2
        return 1 if mean_a >= 15 else 0

    def next_great_day(self, births, day, limit=90):
        d = datetime.date(*day)
        for k in range(1, limit + 1):
            n = d + datetime.timedelta(days=k)
            if (n.year, n.month, n.day) > (2036, 12, 31):
                break
            if self.compat(births, (n.year, n.month, n.day)) == 2:
                return (n.year, n.month, n.day)
        return None

    # ----- food / fun / care hints -------------------------------------------------------------
    @functools.cached_property
    def _hint_tables(self):
        c, d = self.cfg, self.dol
        if self.rel == "eu":
            st = self._eu_string
            care_rows = EU_CARE[LANGS[self.lang]]
            return dict(
                meal=[st(d.u32(0x8027D1F8 + 8 * n)) for n in range(59)],
                play=[st(d.u32(0x8027D4B8 + 4 * n)) for n in range(64)],
                care=[st(d.u32(0x8027D418 + 4 * n)) for n in range(41)],
                level=[st(d.u32(0x8027D3C8 + 4 * n)) for n in range(10)],
                meal_a=0x8027D5B8, meal_b=0x8027D9F0, play_tab=0x8027DE28, care_rows=care_rows)
        keys = ("meal_a", "meal_b", "play_tab", "care_rows")
        if self.rel == "kr":
            st = lambda sid: d.text(d.u32(c["strtab"] + 4 * sid), "utf16")
            return dict(
                meal=[st(d.u32(c["meal_ids"] + 8 * n)) for n in range(c["meal_n"])],
                play=[st(d.u32(c["play_ids"] + 4 * n)) for n in range(c["play_n"])],
                care=[st(d.u32(c["care_ids"] + 4 * n)) for n in range(c["care_n"])],
                level=[st(d.u32(c["level"] + 4 * n)) for n in range(10)], **{k: c[k] for k in keys})
        sj = lambda va: d.text(va, "sjis")
        return dict(
            meal=[sj(d.u32(c["meal_words"] + 8 * n)) for n in range(c["meal_n"])],
            play=[sj(d.u32(c["play_words"] + 4 * n)) for n in range(c["play_n"])],
            care=[sj(d.u32(c["care_words"] + 4 * n)) for n in range(c["care_n"])],
            level=[sj(d.u32(c["level"] + 4 * n)) for n in range(10)], **{k: c[k] for k in keys})

    def hints(self, births, day):
        """Three food words, three fun words and (place, intensity, chore) for a group of 1-6 people."""
        t, d = self._hint_tables, self.dol
        moon = self.eph.fields(*day)[2]  # the day's Moon at midnight
        sums = [sum(self.eph.fields(*b)[k] for b in births) for k in range(7)]  # Sun Venus Moon Saturn Mercury Jupiter Mars
        idx = lambda pos: 359 if pos % 360 == 0 else pos % 360 - 1
        meal_tab = t["meal_a"] if (sums[6] + moon) % 360 < 180 else t["meal_b"]
        i = idx(moon + sums[0])
        food = [t["meal"][d.u8(meal_tab + i * 3 + k)] for k in range(3)]
        i = idx(moon + sums[2])
        fun = [t["play"][d.u8(t["play_tab"] + i * 3 + k)] for k in range(3)]
        per = [self.raw_scores(b, day) for b in births]
        love, comms = sum(x[0] for x in per), sum(x[3] for x in per)
        i = idx(moon + sums[1 if love < comms else 2])
        row = [d.u8(t["care_rows"] + i * 6 + j) for j in range(6)]
        item = row[2 + (sums[5] + moon) % 3]
        work, study = sum(x[1] for x in per), sum(x[2] for x in per)
        if work == study:
            level = t["level"][4]
        else:
            topic, low = (2, True) if work < study else (1, False)
            m = max(x[topic] for x in per) - 10
            level = t["level"][min(max(0, (10 - m if low else m) - 1), 9)]
        return dict(food=food, fun=fun, care=(t["care"][row[0]], level, t["care"][row[5] if item == 0x3F else item]))


# --------------------------------------------------------------------------------------------

def date(s):
    try:
        d = datetime.date.fromisoformat(s)
    except ValueError:
        raise argparse.ArgumentTypeError(f"bad date {s!r}, use YYYY-MM-DD") from None
    return (d.year, d.month, d.day)


def _fmt(d):
    return "%04d-%02d-%02d" % d if d else None


def person(s):
    """'YYYY-MM-DD' or 'NAME=YYYY-MM-DD' -> (name, birth)."""
    name, _, d = s.rpartition("=")
    return (name or d, date(d))


def days_for(when, explicit=None, now=None):
    """The dates to show, following the channel: it opens on today's fortune before 17:00 and on tomorrow's from 17:00."""
    now = now or datetime.datetime.now()
    today, tomorrow = now.date(), now.date() + datetime.timedelta(days=1)
    ymd = lambda d: (d.year, d.month, d.day)
    if explicit:
        return [("day", explicit)]
    if when == "both":
        return [("today", ymd(today)), ("tomorrow", ymd(tomorrow))]
    if when == "auto":
        when = "tomorrow" if now.hour >= 17 else "today"
    return [(when, ymd(tomorrow if when == "tomorrow" else today))]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dol", help="decompressed main program")
    ap.add_argument("--data", help="unpacked data archive (content 0x06); not needed for --release jp")
    ap.add_argument("--release", choices=RELEASES, default="eu")
    ap.add_argument("--band", help="EU ephemeris band A/B/K/M/Z (default A); KR/JP always use I")
    ap.add_argument("--lang", choices=LANGS, default="en", help="EU language")
    when = argparse.ArgumentParser(add_help=False)
    when.add_argument("--when", choices=("auto", "today", "tomorrow", "both"), default="auto",
                      help="auto = the channel's rule: today before 17:00, tomorrow from 17:00 (default)")
    when.add_argument("--day", type=date, help="an explicit date instead of --when (YYYY-MM-DD)")
    when.add_argument("--json", action="store_true", help="machine-readable output")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name, help_ in (("fortune", "five-topic fortune, total and lucky colour, for each person"),
                        ("colour", "lucky colour for each person"),
                        ("hints", "food / fun / care hints for the group"),
                        ("compat", "compatibility rating for the group (2-6 people)")):
        p = sub.add_parser(name, help=help_, parents=[when])
        p.add_argument("people", nargs="+", type=person, metavar="[NAME=]YYYY-MM-DD",
                       help="birth dates; a name is optional")
    p = sub.add_parser("decompress", help="LZ11-decompress the main program")
    p.add_argument("src")
    p.add_argument("dst")
    a = ap.parse_args(argv)

    if a.cmd == "decompress":
        open(a.dst, "wb").write(lz11(open(a.src, "rb").read()))
        return 0
    if not a.dol:
        ap.error("--dol is required")
    ch = Channel(a.dol, a.data, a.release, a.band, a.lang)
    days = days_for(a.when, a.day)
    out = []
    try:
        for label, day in days:
            stamp = "%04d-%02d-%02d" % day
            if a.cmd in ("fortune", "colour"):
                for name, birth in a.people:
                    entry = dict(day=stamp, when=label, person=name, colour=ch.colour(birth, day))
                    if a.cmd == "fortune":
                        entry.update(ch.fortune(birth, day))
                    out.append(entry)
            elif a.cmd == "hints":
                out.append(dict(day=stamp, when=label, people=[n for n, _ in a.people],
                                **ch.hints([b for _, b in a.people], day)))
            else:
                births = [b for _, b in a.people]
                if not 2 <= len(births) <= 6:
                    ap.error("compat needs 2 to 6 people")
                rating = ch.compat(births, day)
                out.append(dict(day=stamp, when=label, people=[n for n, _ in a.people],
                                rating=("normal", "good", "very good")[rating],
                                next_very_good_day=None if rating == 2 else _fmt(ch.next_great_day(births, day))))
    except ValueError as e:
        raise SystemExit(f"error: {e}")
    if getattr(a, "json", False):
        import json
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return 0
    for e in out:
        head = f"{e['when']} {e['day']}"
        if a.cmd == "fortune":
            print(f"== {e['person']}  ({e['sign']}, {head})  total {e['total']}/100  lucky colour: {e['colour'][1] or e['colour'][0]}")
            for t in e["topics"]:
                print(f"   {t['topic']:15s} {t['points']:2d} pts {'*' * t['stars']:5s} {t['text'][:96]}")
        elif a.cmd == "colour":
            print(f"{e['person']} ({head}): {e['colour'][1] or e['colour'][0]}")
        elif a.cmd == "hints":
            print(f"== {', '.join(e['people'])} ({head})\n   food: {' / '.join(e['food'])}\n   fun:  {' / '.join(e['fun'])}\n   care: {' - '.join(e['care'])}")
        else:
            print(f"== {', '.join(e['people'])} ({head}): {e['rating']} day" +
                  (f", next very good day {e['next_very_good_day']}" if e["next_very_good_day"] else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
