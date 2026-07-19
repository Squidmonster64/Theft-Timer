# Theft Timer / Stolen Minutes

A one-button Progressive Web App for recording where time disappears.

## Core use

1. Press the red button.
2. Say or type the activity.
3. Press again when finished.
4. The app records start time, finish time, elapsed time, and today's cumulative total.

Data is stored locally on the device. Export a JSON backup periodically.

## Deploy on Railway

1. Push this folder to `Squidmonster64/Theft-Timer`.
2. In Railway, choose **New Project → Deploy from GitHub repo**.
3. Select `Theft-Timer`.
4. Railway detects `package.json` and runs `npm start`.
5. Generate a Railway domain.
6. Open that HTTPS address in Safari on iPhone.
7. Use **Share → Add to Home Screen**.

## Local test

From this folder:

```bash
npm install
npm start
```

Then open the local address printed in Terminal.

## Files

- `index.html` — complete application
- `manifest.json` — PWA metadata
- `sw.js` — offline cache
- `icons/` — Home Screen icons
- `package.json` — static server for Railway
- `railway.json` — Railway deployment configuration

## Notes

Speech recognition availability varies by browser and iOS version. Typed activity entry remains available as a fallback.
