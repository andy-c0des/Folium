# PLANTOS-v2 — Codex Agent Guide

## What is this project?

PlantOS is a plant-tracking web app. It has two parts:

1. **Frontend** — a single-page React app served via GitHub Pages at `https://andy-c0des.github.io/PLANTOS-v2/src/client/App.html`
2. **Backend** — a Google Apps Script (GAS) web app that acts as a REST API over a Google Sheets database

## Repository structure

```
src/
  client/
    App.html          # Entire frontend — React SPA (vanilla JS, no build step)
    config.js         # API URL config — update PLANTOS_API_URL here when redeploying backend
    PlantOS-Data-Engine.html  # Standalone data tool
  server/
    *.gs              # Server-side GAS file copies (for reference)
  Code.js             # Main GAS backend — plant CRUD, menus, spreadsheet logic
  Config.js           # Constants and configuration for GAS
  Features.js         # GAS doPost() entry point — API dispatch + environments/props/archive
  PlantCRUD.js        # GAS plant create/read/update operations
  Plants.js           # GAS plant listing, search, home dashboard
  appsscript.json     # Apps Script manifest

index.html            # Root redirect → src/client/App.html (for GitHub Pages)
.clasp.json           # clasp config — scriptId points to the live Apps Script project
AGENTS.md             # This file
```

## Backend API

- All API calls go to the URL in `src/client/config.js`
- The backend entry point is `doPost(e)` in `src/Features.js`
- Auth: every request sends `{ fn, args, token }` — token is validated against `PLANTOS_API_PASSWORD` in Apps Script Script Properties
- `plantosValidateToken` is handled as a special case before auth check (no token needed)

## Key patterns

### Adding a new backend function
1. Define `function plantosXxx(...)` in the appropriate `.js` file (`PlantCRUD.js`, `Features.js`, etc.)
2. Add `plantosXxx: plantosXxx` to the dispatch map in **both** `src/Features.js` AND `src/Code.js` (both have a `doPost` — Features.js wins at runtime)
3. Call it from the frontend with `gasCall('plantosXxx', ...args)`

### Frontend state
- React 18, no JSX — all `React.createElement(...)` calls
- Single file: `src/client/App.html` (16000+ lines)
- Navigation: `navigate('route', { params })` — routes: `home`, `plant`, `my-plants`, `add`, `carl`, `gallery`, `diary`, `plant-log`, `props`
- API calls: `gasCall(fnName, ...args)` returns a Promise

### Deployment workflow
```bash
# Push code to Apps Script
clasp push

# Update the live deployment to the new version
clasp deploy -i AKfycbw1EMhF1Mhqxtq6pQnM-K-1JkHw5rTesHwsBpaz6FFoNzc5vyzDMLwa8aIJsyjP5_cbyA

# Push frontend to GitHub (triggers GitHub Pages update)
git add . && git commit -m "..." && git push origin main
```

## Important constraints

- **No build step** — App.html is plain JavaScript, no TypeScript, no bundler
- **Google Apps Script limitations** — no npm, no async/await on the server side, use `PropertiesService` for key-value storage
- **CORS** — gasCall uses `Content-Type: text/plain` (simple request, no preflight) so Apps Script CORS works
- **Two doPost functions** — `Features.js` and `Code.js` both define `doPost`. Features.js is the canonical one (it loads last alphabetically). Keep both dispatch maps in sync.
- **Spreadsheet as database** — plants are rows in Google Sheets. The sheet name and column headers are defined in `Config.js` under `PLANTOS_BACKEND_CFG`

## Data model

A plant row has columns including: UID, Genus, Taxon, Nickname, Location, Medium/Substrate, Pot Size, Pot Material, Birthday, Water Every Days, Fert Every Days, Last Watered, Last Fertilized, Watered (bool), Fertilized (bool).

UIDs are sequential integers (max existing UID + 1), or timestamp if no valid UIDs exist.
