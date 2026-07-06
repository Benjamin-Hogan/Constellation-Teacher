# Constellation Teacher

An interactive web app that teaches the constellations. Enter your latitude and longitude (or use browser geolocation), pick any date and time, and the app renders the sky as it appears from your location — then helps you learn it through three modes:

- **Explore** — hover and click constellations on the map to see their lines, names, mythology, notable stars, plus RA/Dec coordinates and tonight's rise/set times so you can find them outside.
- **Guided tour** — a step-by-step walkthrough of the best constellations visible right now.
- **Quiz** — "find this constellation" and "name this constellation" challenges with scoring.

The map itself shows the sky as it really looks:

- **Realistic sky** (toggleable) — the Sun and Moon are drawn at their true positions, the Moon with its correct phase. Daylight and twilight tint the sky; moonlight and atmospheric dimming wash out faint stars just like in real life.
- **Planets** — the five naked-eye planets (Mercury, Venus, Mars, Jupiter, Saturn) appear at their true positions with correct brightness, and the Sky tonight panel lists which are up and where to look.
- **Two views** — an overhead planisphere (whole sky at once) and a first-person horizon view: pick a compass direction or type an exact bearing in degrees (e.g. from your phone's compass) and see exactly what is in front of you, ground and all.
- **Sky tonight** — sunset/sunrise, full-darkness window, moonrise/moonset, moon phase, and a viewing-conditions verdict for your date and location.
- **RA/Dec everywhere** — an equatorial grid overlay and a live cursor readout of Alt/Az and RA/Dec under the mouse.

Accounts are optional: the app is fully usable anonymously, but logging in saves your learning progress and quiz scores.

## How it works

All sky computation happens client-side. Star positions (RA/Dec, J2000) are converted to altitude/azimuth for the observer's location and time using [astronomy-engine](https://www.npmjs.com/package/astronomy-engine), which also supplies Sun/Moon positions, moon phase, and rise/set searches. The sky is drawn on a canvas with a stereographic projection about an arbitrary view center: the zenith for the overhead planisphere view, or a point above the horizon for the first-person view. Scrubbing the time slider shows the sky rotating (and brightening/darkening) in real time.

## Repository layout

- `frontend/` — Vite + React + TypeScript app (star map, controls, learning modes)
- `backend/` — Express + TypeScript API (JWT auth, progress, quiz results) backed by SQLite
- `data/` — generated star and constellation datasets (see below)
- `scripts/build-data.mjs` — regenerates the datasets in `data/`

## Data sources

`scripts/build-data.mjs` downloads and processes:

- [HYG star database](https://github.com/astronexus/HYG-Database) — stars filtered to magnitude ≤ 5.5 (`data/stars.json`)
- [Stellarium sky cultures](https://github.com/Stellarium/stellarium) — Western constellation line figures for all 88 IAU constellations (`data/constellation-lines.json`)
- `data/constellations.json` — authored metadata: full names, mythology blurbs, best viewing seasons, notable stars

The generated JSON is included in `data/`, so you only need to run the script to refresh it:

```bash
node scripts/build-data.mjs
```

## Getting started

Requires Node.js 20+.

```bash
# Backend (http://localhost:3001)
cd backend
npm install
npm run dev

# Frontend (http://localhost:5173, proxies /api to the backend)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173, allow geolocation (or type coordinates), and explore.

## API

| Method | Route | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Create account (email + password) |
| POST | `/api/auth/login` | Log in; sets httpOnly JWT cookie |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/auth/me` | Current user |
| GET | `/api/progress` | Constellations marked as learned |
| PUT | `/api/progress/:constellation` | Mark/unmark a constellation as learned |
| POST | `/api/quiz-results` | Save a quiz score |
| GET | `/api/quiz-results` | Quiz history |

The SQLite database (`backend/constellation.db`) is created automatically on first run.
