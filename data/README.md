# Bundled data

Everything `today_fortune.py` needs to compute fortunes, lucky colours, hints and compatibility. It was read from the
channel's own files by `tools/build_bundle.py`.

| File | Content |
|---|---|
| `ephemeris/<band>.bin.gz` | planetary positions: one 16-byte record per day, 1881-01-01 to 2036-12-31 (u16 year, u8 month, u8 day, nine 9-bit whole-degree longitudes), for the time-zone bands A, B, I, K, M and Z |
| `colours/<band>.bin.gz` | lucky-colour rows for 2007 to 2050: 12 bytes per day (date, then twelve 5-bit colour indices, one per sign) |
| `scores.bin` | 6 x 360 score bytes (10 to 20), the same in the European, Korean and Japanese builds |
| `hints.json` | hint index tables (360 x 3 for food and fun, 360 x 6 for care) and the short hint words, intensity words and colour names of each build (EU in six languages) |
| `text/<name>.txt.gz` | the fortune messages, one per line, 1,800 per file: topic 0 to 4 x 360 positions. Names: `en` `de` `fr` `es` `it` `nl` (European build), `kr` (Korean build), `jp` (the original Japanese text). Display lines are joined with a space, or directly for the Japanese lines |

The message text in `text/` comes from the channel itself (the channel's manual credits the predictions to Media Kobo,
Inc.) and is included from the repository owner's own dump. `--no-text` in `tools/build_bundle.py` leaves it out, and the
tool works without the folder (it then prints message numbers).

Format details: [Wii-Kaitai `channels/uranai`](https://github.com/quatric/Wii-Kaitai/tree/main/channels/uranai) and
[the write-up](https://gist.github.com/quatric/222008fe67167e8dcbda6b022b0f7551).
