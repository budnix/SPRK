# SPRK – Polish Railway Traffic Control Simulator

A browser-based simulator of a Polish train dispatcher's work at a **cube-type control desk**
(*pulpit kostkowy*, relay interlocking type E), modelled on the ISDR simulator.
Runs in desktop browsers and on iPad (touch support). No frameworks: plain JavaScript (ES modules) + SVG.

![Control desk of the Stare Pustkowie station](docs/screenshot.png)

Live version: https://budnix.github.io/SPRK/

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173  (Vite; add --host to reach it from an iPad on the LAN)
npm test           # logic tests (node --test)
npm run build      # static build in dist/ (for GitHub Pages: VITE_BASE=/SPRK/)
```

Station selection: `?stacja=<id>` (default `stare-pustkowie`).

## What is in version 0.1

* **Modular desk tiles** (`src/tiles/registry.js`): straight / diagonal / curved track, point (turnout),
  crossing, buffer stop, signal repeaters (main signal and shunting signal) with buttons, group buttons with
  counters, Eap line-block panel, labels. A new tile type is one registry entry plus one drawing function.
* **Type E interlocking** (`src/model/Interlocking.js`): two-button route setting, automatic point setting
  in routes, route locking (white), track occupancy (red), point position (yellow), flank protection,
  overlaps, derailers, sectional release, route cancel with timed release, emergency release and
  substitute signal with counters, individual point locking, run-through (trailing) detection,
  signal aspects per the Polish Ie-1 instruction (S1–S5, S10–S13, Ms1/Ms2, Sz).
* **Eap semi-automatic line block** (`src/model/Block.js`): Wbl, Poz, Ko, dPo, dKo; neighbouring
  stations are driven by AI (they request permission, dispatch trains per the timetable, confirm arrival).
* **Train movement** (`src/model/Train.js`): trains run over the real track topology and current point
  positions, brake for stop signals, 40 km/h over diverging points, 20 km/h on a substitute signal,
  platform stops per timetable, non-stop passes, terminating trains, shunting under Ms2.
* **Side panel**: clock and time factor (1–30×), timetable with live status and delays, event log with
  messages from neighbouring stations, block / route / counter state, switching a train to shunting mode,
  built-in manual (?).
* **Test station Stare Pustkowie**: single-track line, two main tracks with platforms, a loading siding
  with a derailer, 3 points, 6 main signals, 2 shunting signals, a timetable of 10 trains (with crossings).

## Operating the desk (short version)

| Action | How |
|---|---|
| Press a button | click / tap |
| Pull a button | hold for 0.5 s or right-click |
| Train route | green button of the start signal → green button of the end (signal or line exit `kW` / `kE`) |
| Shunting route | white button of the start → white button of the end (`kT3`, Tm, C2) |
| Put a signal to stop | pull the signal button |
| Cancel a route | `Pz` + signal button (timed release of 90 s when the approach section is occupied) |
| Emergency release | `dPz` + signal button (counted) |
| Substitute signal | `Sz` + green signal button (counted) |
| Point | `Zw` + point button; lock with `Zz` + point button |
| Line block | `Wbl` request permission, `Poz` grant permission, `Ko` confirm arrival |

Full manual: the **?** button in the app (in Polish, as is the whole UI, since the simulator follows Polish railway rules and terminology).

## Structure and roadmap

* `docs/STATION-FORMAT.md` – station definition format (the basis for a future station editor),
* `docs/ARCHITECTURE.md` – architecture, design rules, roadmap,
* `docs/SOURCES.md` – sources (Ie-1, Ir-1, ISDR documentation, descriptions of type E equipment).

The simulator is a simplification: interlocking details (timings, overlaps, flank protection) follow published
descriptions of type E equipment, not the dependency tables of specific signal boxes. Report differences – the model lives in one place.

## CI / deploy

Workflow `.github/workflows/ci.yml`: every push and pull request runs `npm test`; after the tests pass on
`main`, the app is built and published to GitHub Pages (`https://budnix.github.io/SPRK/`).
