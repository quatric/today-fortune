#!/usr/bin/env python3
"""Write web/test/fixtures.json: random cases computed by the Python tool, for the JavaScript port to reproduce."""
import json
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import today_fortune as tf  # noqa: E402

random.seed(11)
birth = lambda: [random.randint(1930, 2015), random.randint(1, 12), random.randint(1, 28)]
day = lambda: [random.randint(2005, 2036), random.randint(1, 12), random.randint(1, 28)]
out = []
for release, lang, band in (("eu", "en", "A"), ("eu", "de", "K"), ("eu", "fr", "Z"), ("eu", "es", "B"), ("kr", "en", "I"), ("jp", "en", "I")):
    ch = tf.Channel(release=release, lang=lang, band=band)
    for _ in range(40):
        p, d = birth(), day()
        grp = [birth() for _ in range(random.randint(2, 6))]
        f = ch.fortune(tuple(p), tuple(d))
        rating = ch.compat([tuple(g) for g in grp], tuple(d))
        nxt = ch.next_great_day([tuple(g) for g in grp], tuple(d)) if rating != 2 else None
        out.append(dict(release=release, lang=lang, band=band, birth=p, day=d, group=grp,
                        sign=tf.ZODIAC.index(f["sign"]), total=f["total"], flags=f["flags"],
                        topics=[[t["index"], t["points"], t["stars"], (t["text"] or "")[:24]] for t in f["topics"]],
                        colour=list(ch.colour(tuple(p), tuple(d))),
                        hints=ch.hints([tuple(g) for g in grp], tuple(d)), compat=rating,
                        next=list(nxt) if nxt else None))
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "test", "fixtures.json"), "w"),
          ensure_ascii=False)
print(len(out), "cases")
