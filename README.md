# SOLMAR HEAT

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/wizzy-bounty/gta6-01-solmar/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/wizzy-bounty/gta6-01-solmar/reward.svg)](https://make.fun/c/gta6-01)

An open-world crime game set in Solmar City, a sun-soaked coastal city of four
districts — the Marina, Old Town, the Neon Strip and the Docks — built
procedurally with three.js and playable entirely offline in a desktop browser.

You are Riko "Vex" Marlowe, fresh out and already in debt to the wrong people.
Work the six-mission story chain **"The Solmar Job"** for fixer Mara Voss:
lift a marked Vantara GT, run a package across town under a three-star chase,
and finish the night aboard the casino yacht *Solmar Star* — or ignore the
story and make the city your own.

## What's in the city

- **On foot and behind the wheel** — walk, sprint, steal any parked or passing
  car, and drive a full traffic system that shares the 9×9 street grid.
- **Wanted system** — crimes witnessed by pedestrians or the SCPD raise your
  stars (1–5); police AI gives chase, and getting caught means fines and a
  trip past Solmar General.
- **Living streets** — 42 pedestrians stroll the sidewalks and panic at
  gunfire and near-misses; districts change character from marina towers to
  dock cranes.
- **Combat** — fists and gunplay, with armed guards watching the big scores.
- **A full day cycle** — dawn, golden hour and neon night, with synthesized
  WebAudio music, engine, siren and city sounds. No audio files, no network:
  every asset is generated at runtime or vendored locally.
- **Save game** — progress, money and story state persist in `localStorage`.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Walk / drive |
| `Shift` | Sprint |
| `E` | Steal / enter / exit a car |
| `F` | Punch |
| Mouse (click to lock) | Look / aim, click to shoot |
| `Space` | Advance dialogue / handbrake while driving |
| `P` | Pause |

## Running it

Open `game/index.html` in a desktop browser — that's it. For local play over
HTTP, `node serve.ts` serves `game/` on <http://localhost:8080>.

`node main.ts` is the make.fun hand-in program (Node 22, standard library
only): with `MAKEFUN_OUTPUT_DIR` set it copies `game/` and `screenshots/`
into the output directory and writes the entry's `dossier.json` there.
