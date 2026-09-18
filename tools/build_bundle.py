#!/usr/bin/env python3
"""Build ./data from your own dumps of the channel (the repository already ships the result).

  python3 tools/build_bundle.py --eu-dol eu_main.dol --eu-data eu_00000006.d \\
      --kr-dol kr_main.dol --kr-data kr_00000006.d --jp-dol jp_main.dol --out data

The main programs must be LZ11-decompressed (`today_fortune.py decompress IN OUT`). Nothing that is not listed in
data/README.md is written, in particular no fortune message text.
"""
import argparse
import gzip
import io
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import today_fortune as tf  # noqa: E402


def gz(path, blob):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=9, mtime=0) as f:  # mtime 0: reproducible output
        f.write(blob)
    open(path, "wb").write(buf.getvalue())


def main():
    ap = argparse.ArgumentParser()
    for k in ("eu-dol", "eu-data", "kr-dol", "kr-data", "jp-dol"):
        ap.add_argument("--" + k, required=True)
    ap.add_argument("--out", default="data")
    a = ap.parse_args()
    eu = {lang: tf.DumpSource(a.eu_dol, a.eu_data, "eu", lang) for lang in tf.LANGS}
    kr = tf.DumpSource(a.kr_dol, a.kr_data, "kr", "en")
    jp = tf.DumpSource(a.jp_dol, None, "jp", "en")

    # planetary positions and lucky-colour rows, per time-zone band
    for band in "ABKMZ":
        gz(f"{a.out}/ephemeris/{band}.bin.gz", eu["en"]._read(f"logic/wii_ephemeris_decimal_{band}.bin"))
        gz(f"{a.out}/colours/{band}.bin.gz", tf.pack_colour_rows(eu["en"].colour_rows(band)))
    gz(f"{a.out}/ephemeris/I.bin.gz", kr._read("logic/wii_ephemeris_decimal_I.bin"))
    jp_eph = jp.dol.raw(jp.cfg["eph"], 56978 * 16)
    assert jp_eph == kr._read("logic/wii_ephemeris_decimal_I.bin"), "Korean and Japanese band I differ"
    kr_rows, jp_rows = kr.colour_rows("I"), jp.colour_rows("I")
    assert kr_rows == jp_rows, "Korean and Japanese colour tables differ"
    gz(f"{a.out}/colours/I.bin.gz", tf.pack_colour_rows(kr_rows))

    # the score column is identical in all three builds
    scores = eu["en"].scores()
    assert scores == kr.scores() == jp.scores(), "score tables differ between builds"
    open(f"{a.out}/scores.bin", "wb").write(bytes(b for t in scores for b in t))

    # hint tables, hint words and colour names
    def hints(src, colours):
        t = src.hint_tables()
        words = {k: t[k] for k in ("meal", "play", "care", "level")}
        if colours:
            words["colours"] = [src.colour_name(i) for i in range(23)]
        return t, words

    out = {}
    tables, words, rows = None, {}, {}
    for lang, src in eu.items():
        t, words[lang] = hints(src, True)
        tables = tables or {k: t[k] for k in ("meal_a", "meal_b", "play_tab")}
        assert tables == {k: t[k] for k in ("meal_a", "meal_b", "play_tab")}
        rows[lang] = t["care_rows"]
    out["eu"] = dict(tables=tables, care_rows=rows, words=words)
    for rel, src, colours in (("kr", kr, True), ("jp", jp, False)):
        t, w = hints(src, colours)
        out[rel] = dict(tables={k: t[k] for k in ("meal_a", "meal_b", "play_tab")}, care_rows=t["care_rows"], words=w)
    with open(f"{a.out}/hints.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("wrote", a.out)


if __name__ == "__main__":
    main()
