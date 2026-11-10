# AstroPulse (prototype 1)

Hunt for exoplanets in star-brightness data. No code, runs fully in your browser.

## Run

    npm install
    npm run dev          # http://localhost:3000

## Check

    npm run check        # typecheck, lint, 17 science tests
    npm run build        # static site in out/

## Real NASA stars (optional, once)

    pip install lightkurve numpy
    python scripts/fetch_targets.py

Then restart `npm run dev`. Real stars appear next to the simulated ones.

## Layout

- `src/lib/` detrend (Savitzky-Golay), BLS period search, folding, physics, simulated stars, CSV parsing
- `src/components/` Plot (canvas) and the guided App
- `scripts/fetch_targets.py` downloads real light curves into `public/data/`

## Five ways to find a planet
Learn tab: transit, radial velocity (wobble), direct imaging (photo), microlensing (flash), astrometry (position). Each is a four-step practice lab with simulated data modeled on a real planet.

## Star catalog
`public/sky/hosts.json` holds about 85 hand-entered stars (approximate values). To load the whole NASA Exoplanet Archive (about 6,000 stars):

    pip install requests
    python scripts/fetch_archive.py

`python scripts/build_hosts.py` rebuilds the small built-in list.

## Live data (no scripts needed)
`npm run dev` starts a small server. It does two things:
- `/api/catalog` pulls every known planet host from the NASA Exoplanet Archive (refreshed every 6 hours on the server, once a day in your browser). Stars added since your last visit are marked NEW.
- `/api/lightcurve` finds real TESS or Kepler brightness data for a star on MAST and converts it. Stars with no such data keep the labelled stand-in curve.

If NASA cannot be reached, the app falls back to your last saved copy, then to the small built-in sample. Because of the server, the app can no longer be hosted as plain static files; use `npm run build && npm start`, or a host such as Vercel.
Optional: set `NASA_TAP_URL` or `MAST_URL` to point at a mirror.
