# today-fortune

A reimplementation of the fortune maths of the Wii **Today & Tomorrow Channel** (Europe, Korea and Japan builds).
Give it birth dates and it prints what the channel would show: the five-topic fortune with total points, the lucky
colour, food / fun / care hints, and compatibility for a group, for today, tomorrow, or any date.

It reads the channel's own files, so you need **your own dump** of the channel. Nothing from the game is included.

## Usage

```sh
# like opening the channel: today's fortune, or tomorrow's from 17:00
python3 today_fortune.py --dol 00000001.app --data 00000006.d fortune Ann=1990-05-17 Bob=1988-02-03

python3 today_fortune.py ... fortune 1990-05-17 --when both        # today and tomorrow
python3 today_fortune.py ... fortune 1990-05-17 --day 2026-12-24    # any date 1881-2036
python3 today_fortune.py ... colour Ann=1990-05-17 --when tomorrow
python3 today_fortune.py ... hints Ann=1990-05-17 Bob=1988-02-03    # up to 6 people
python3 today_fortune.py ... compat Ann=1990-05-17 Bob=1988-02-03   # 2 to 6 people, finds the next very good day
python3 today_fortune.py ... fortune 1990-05-17 --json              # machine-readable
python3 today_fortune.py --release jp --dol jp_main.dol fortune 1990-05-17   # Japan: nothing else needed
```

| Option | Meaning |
|---|---|
| `--dol` | the main program, LZ11-decompressed |
| `--data` | the unpacked data archive (EU and Korea only) |
| `--release eu\|kr\|jp` | which build the files come from (default `eu`) |
| `--band A\|B\|K\|M\|Z` | EU time-zone band, default `A` (Korea and Japan always use `I`) |
| `--lang en\|de\|fr\|es\|it\|nl` | EU language for messages, colour names and hints |
| `--when auto\|today\|tomorrow\|both` | `auto` follows the channel: today before 17:00, tomorrow from 17:00 |
| `--day YYYY-MM-DD` | an explicit date instead of `--when` |
| `--json` | JSON output |

People are `YYYY-MM-DD` or `NAME=YYYY-MM-DD`. Birth dates and days must fall between 1881-01-01 and 2036-12-31.

## Getting the input files

| Release | Main program | Data archive |
|---|---|---|
| Europe (HAVP) | WAD content `00000001.app`, LZ11-compressed | content `00000006.app`, a U8 archive, unpacked to a folder with `logic/`, `text/`, `color/` |
| Korea (HAVK) | `00000001.app`, LZ11-compressed | content `00000006.app`, same layout |
| Japan (HAVJ) | `0000000d.app`, LZ11-compressed | not needed |

Unpack the WAD with any WAD tool, decompress the main program with
`python3 today_fortune.py decompress 00000001.app main.dol`, and unpack the U8 archive with any U8 tool
(or parse it with the definition in [wii-kaitai](https://github.com/quatric/wii-kaitai)).

## How it works

The rules, data formats and how they compare with real astrology are written up in
[the documentation gist](https://gist.github.com/quatric/84a1df3a0b7c83dc4596bdc372ac8bfc).
In short: real planetary positions in whole degrees, `(natal planet + today's Moon) mod 360` as an index into a table of
fixed scores and hand-written messages, plus a date-hash modifier. The tool is also usable as a module:
`Channel(dol, data, release, band, lang)` has `fortune()`, `colour()`, `hints()`, `compat()` and `next_great_day()`.

## Status

The formulas and tables are read from the channel's code and data, and the Korean and Japanese builds (which store their
data independently) agree with each other. The output has **not** been compared with a live console yet. Reports from
a real channel or Dolphin are welcome.

## Tests

`python3 -m unittest discover -s tests` (no game data needed).
