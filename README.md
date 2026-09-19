# today-fortune

A reimplementation of the fortune maths of the Wii **Today & Tomorrow Channel** (Europe, Korea and Japan builds).
Give it birth dates and it prints what the channel would show: the five-topic fortune with total points, the lucky
colour, food / fun / care hints, and compatibility for a group, for today, tomorrow, or any date from 1881 to 2036.

It runs with the data bundled in [`data/`](data/README.md) (planetary positions, tables, hint words and the fortune
messages), so no dump of the channel is needed. Python 3.8 or newer, no dependencies.

## Usage

```sh
# like opening the channel: today's fortune, or tomorrow's from 17:00
python3 today_fortune.py fortune Ann=1990-05-17 Bob=1988-02-03

python3 today_fortune.py fortune 1990-05-17 --when both        # today and tomorrow
python3 today_fortune.py fortune 1990-05-17 --day 2026-12-24    # any date
python3 today_fortune.py colour Ann=1990-05-17 --when tomorrow
python3 today_fortune.py hints Ann=1990-05-17 Bob=1988-02-03    # up to 6 people
python3 today_fortune.py compat Ann=1990-05-17 Bob=1988-02-03   # 2 to 6 people, finds the next very good day
python3 today_fortune.py fortune 1990-05-17 --json              # machine-readable
python3 today_fortune.py --release kr fortune 1990-05-17        # Korean build (or jp)
python3 today_fortune.py --lang de hints 1990-05-17             # German words (en de fr es it nl)
```

| Option | Meaning |
|---|---|
| `--release eu\|kr\|jp` | which build's tables and words to use (default `eu`) |
| `--band A\|B\|I\|K\|M\|Z` | time-zone band of the planetary positions; default `A` for `eu` and `I` for `kr`/`jp` (the channel picks it from the console's country) |
| `--lang en\|de\|fr\|es\|it\|nl` | language of the hint words and colour names (EU) |
| `--when auto\|today\|tomorrow\|both` | `auto` follows the channel: today before 17:00, tomorrow from 17:00 |
| `--day YYYY-MM-DD` | an explicit date instead of `--when` |
| `--json` | JSON output |
| `--data DIR` | read the EU or Korean message text from your own unpacked data archive (content `00000006.app`) instead of the bundle |
| `--dol FILE` | read everything from your own decompressed main program instead of the bundle |

People are `YYYY-MM-DD` or `NAME=YYYY-MM-DD`.

## Messages

The 1,800 fortune messages of each build are bundled in `data/text/` (English, German, French, Spanish, Italian, Dutch,
Korean and the original Japanese). Delete that folder if you do not want them: the tool then prints the message number
of each topic instead of the text.

## How it works

The rules, data formats and how they compare with real astrology are written up in
[the documentation gist](https://gist.github.com/quatric/222008fe67167e8dcbda6b022b0f7551), and the file formats are
defined for Kaitai Struct in [Wii-Kaitai](https://github.com/quatric/Wii-Kaitai/tree/main/channels/uranai). In short:
real planetary positions in whole degrees, `(natal planet + today's Moon) mod 360` as an index into a table of fixed
scores and hand-written messages, plus a date-hash modifier.

As a module: `Channel(dol=None, data=None, release="eu", band=None, lang="en")` has `fortune()`, `colour()`, `hints()`,
`compat()` and `next_great_day()`.

## Website

`web/` is a static site that runs the same maths in the browser (no server, no build step, nothing is uploaded). It
loads the bundled `data/` files, so serve the repository root over http and open `/web/`:

```sh
python3 -m http.server 8000     # then open http://localhost:8000/web/
node web/test/engine.test.mjs   # the JavaScript engine against 240 cases computed by the Python tool
```

It offers up to six people, today / tomorrow / any date (or "like the channel": tomorrow from 17:00), all eight
editions (six European languages, Korean and Japanese), lucky colours, hints, group compatibility with the next very
good day, and a zodiac wheel drawn from the day's planetary positions. The text uses the Rodin NTLG Pro font from
`web/fonts/`; the page falls back to system fonts without it.

## Rebuilding the data

`tools/build_bundle.py` regenerates `data/` from your own dumps (see its docstring). The output is reproducible.

## Status

The formulas and tables are read from the channel's code and data. The bundled results were checked against the dumps
on 750 random cases across all three builds with no differences, and the Korean and Japanese builds (which store their
data independently) agree with each other. The output has **not** been compared with a live console yet; reports from a
real channel or Dolphin are welcome.

## Tests

`python3 -m unittest discover -s tests` (uses only the bundled data). `python3 tools/make_web_fixtures.py` regenerates the fixtures for the website's JavaScript test.
