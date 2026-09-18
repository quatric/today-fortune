"""Unit tests that need no game data."""
import datetime
import os
import struct
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import today_fortune as tf  # noqa: E402


def record(y, m, d, deg):
    """Pack a 16-byte ephemeris record from nine whole-degree values."""
    words = []
    for k in range(3):
        a, b, c = deg[3 * k:3 * k + 3]
        words.append((a << 23) | (b << 14) | (c << 5))
    return struct.pack(">HBB3I", y, m, d, *words)


class Tests(unittest.TestCase):
    def test_ephemeris_fields(self):
        deg = [279, 240, 216, 40, 271, 25, 327, 222, 0]
        e = tf.Ephemeris(record(2000, 1, 1, deg) + record(2000, 1, 2, [1] * 9))
        self.assertEqual(e.fields(2000, 1, 1), deg)
        self.assertEqual(e.fields(2000, 1, 2), [1] * 9)
        with self.assertRaises(ValueError):
            e.fields(2000, 1, 3)

    def test_day_flags_are_a_fixed_hash(self):
        self.assertEqual(tf.Channel.day_flags(2026, 9, 18), [True, True, True, False, True, False])
        self.assertEqual(tf.Channel.day_flags(2026, 9, 18), tf.Channel.day_flags(2026, 9, 18))

    def test_stars(self):
        got = {p: tf.Channel.stars(p) for p in (0, 2, 4, 6, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20)}
        self.assertEqual(list(got.values()), [1, 1, 2, 2, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5])

    def test_lz11(self):
        self.assertEqual(tf.lz11(bytes([0x11, 5, 0, 0, 0]) + b"ABCDE"), b"ABCDE")
        self.assertEqual(tf.lz11(bytes([0x11, 4, 0, 0, 0x40, 0x41, 0x20, 0x00])), b"AAAA")

    def test_channel_day_rule(self):
        at = lambda h: datetime.datetime(2026, 9, 18, h, 0)
        self.assertEqual(tf.days_for("auto", now=at(16))[0], ("today", (2026, 9, 18)))
        self.assertEqual(tf.days_for("auto", now=at(17))[0], ("tomorrow", (2026, 9, 19)))
        self.assertEqual([l for l, _ in tf.days_for("both", now=at(9))], ["today", "tomorrow"])
        self.assertEqual(tf.days_for("today", explicit=(2001, 3, 25), now=at(9)), [("day", (2001, 3, 25))])

    def test_person_parsing(self):
        self.assertEqual(tf.person("Ann=1990-05-17"), ("Ann", (1990, 5, 17)))
        self.assertEqual(tf.person("1990-05-17"), ("1990-05-17", (1990, 5, 17)))


class BundledData(unittest.TestCase):
    """Runs on the data shipped in ./data; the values were checked against the channel's own files."""

    @classmethod
    def setUpClass(cls):
        cls.eu = tf.Channel()

    def test_fortune(self):
        r = self.eu.fortune((1990, 5, 17), (2026, 9, 18))
        self.assertEqual((r["sign"], r["total"]), ("Taurus", 51))
        self.assertEqual([t["points"] for t in r["topics"]], [6, 0, 16, 15, 14])
        self.assertEqual([t["message_number"] for t in r["topics"]], [275, 556, 1018, 1296, 1800])
        self.assertIsNone(r["topics"][0]["text"])  # message text is not bundled

    def test_colour_and_languages(self):
        self.assertEqual(self.eu.colour((1990, 5, 17), (2026, 9, 18)), (8, "Dark Green"))
        self.assertEqual(tf.Channel(lang="de").colour((1990, 5, 17), (2026, 9, 18)), (8, "Dunkelgr\u00fcn"))

    def test_hints(self):
        h = self.eu.hints([(1990, 5, 17)], (2026, 9, 18))
        self.assertEqual(h["food"], ["Seafood", "Spicy food", "Light"])
        self.assertEqual(h["fun"], ["Video game", "Skill", "Throw"])
        self.assertEqual(h["care"], ("Kitchen", "Moderately", "Housework"))

    def test_compat(self):
        pair = [(1990, 5, 17), (1988, 2, 3)]
        self.assertEqual(self.eu.compat(pair, (2026, 9, 18)), 0)
        self.assertEqual(self.eu.next_great_day(pair, (2026, 9, 18)), (2026, 9, 28))

    def test_korea_and_japan_agree(self):
        kr, jp = tf.Channel(release="kr"), tf.Channel(release="jp")
        a, b = kr.fortune((1990, 5, 17), (2026, 9, 18)), jp.fortune((1990, 5, 17), (2026, 9, 18))
        self.assertEqual((a["total"], b["total"]), (69, 69))
        self.assertEqual(kr.colour((1990, 5, 17), (2026, 9, 18)), (9, "\uc5f0\ub450\uc0c9"))
        self.assertEqual(jp.hints([(1990, 5, 17)], (2026, 9, 18))["care"][0], "\u808c")

    def test_out_of_range(self):
        with self.assertRaises(ValueError):
            self.eu.fortune((1990, 5, 17), (2040, 1, 1))

    def test_all_bands_load(self):
        for band in tf.BANDS:
            self.assertEqual(len(tf.Channel(band=band).eph.index), 56978)

    def test_colour_row_packing_round_trips(self):
        rows = [((2007, 1, 1), list(range(12))), ((2007, 1, 2), [22] * 12)]
        self.assertEqual(tf.unpack_colour_rows(tf.pack_colour_rows(rows)), rows)


if __name__ == "__main__":
    unittest.main()
