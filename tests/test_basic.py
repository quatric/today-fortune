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


if __name__ == "__main__":
    unittest.main()
