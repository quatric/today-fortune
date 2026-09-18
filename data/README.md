# Bundled data

Everything `today_fortune.py` needs to compute fortunes, lucky colours, hints and compatibility. It was read from the
channel's own files by `tools/build_bundle.py`.

| File | Content |
|---|---|
| `ephemeris/<band>.bin.gz` | planetary positions: one 16-byte record per day, 1881-01-01 to 2036-12-31 (u16 year, u8 month, u8 day, nine 9-bit whole-degree longitudes), for the time-zone bands A, B, I, K, M and Z |
| `colours/<band>.bin.gz` | lucky-colour rows for 2007 to 2050: 12 bytes per day (date, then twelve 5-bit colour indices, one per sign) |
| `scores.bin` | 6 x 360 score bytes (10 to 20), the same in the European, Korean and Japanese builds |
| `hints.json` | hint index tables (360 x 3 for food and fun, 360 x 6 for care) and the short hint words, intensity words and colour names of each build (EU in six languages) |

The fortune **message text** (1,800 messages per language) is deliberately not included. Pass `--data` (EU, Korea)
or `--dol` (Japan) with your own dump to have the tool print it.

Format details: [wii-kaitai `channels/uranai`](https://github.com/quatric/Wii-Kaitai/tree/main/channels/uranai) and
[the write-up](https://gist.github.com/quatric/222008fe67167e8dcbda6b022b0f7551).
