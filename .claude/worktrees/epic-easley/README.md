# PLANTOS-v2

PlantOS — Google Apps Script web app for plant care tracking.

## Project Structure

```
src/
  server/                    # Apps Script server-side (.gs)
    Config.gs                # PLANTOS_BACKEND_CFG constant & header definitions
    Core.gs                  # Menu, settings, sheet helpers, utilities, URL validation
    Drive.gs                 # Drive folder ops, deployment rebuild, diagnostics
    Plants.gs                # List locations, home dashboard, get plants by location
    PlantCRUD.gs             # Get/create/update plant, quick log, batch ops, search, photos
    Features.gs              # Web app routing (doGet), locations, environments, archive, propagation
    AI.gs                    # Anthropic API proxy, Carl learning engine
    Import.gs                # QR master sheet, blank row cleanup, onOpen menu, import engine
    Chat.gs                  # Chat persistence, character stubs, relationships, lore system

  client/                    # Apps Script client-side (served as HTML)
    App.html                 # Main React SPA (Tailwind + React 18, ~16k lines)
    PlantOS-Data-Engine.html # Plant knowledge base / care logic engine (JS)
    carl.html                # Carl character system, NPC panel, offline conversation (JS)
```

## Apps Script Deployment

All `.gs` files in `src/server/` share the same global namespace — functions can call
each other across files. The `.html` files in `src/client/` are loaded via
`HtmlService.createHtmlOutputFromFile()`.

If using [clasp](https://github.com/nicell/clasp), point `rootDir` to `src/` and
flatten the structure, or adjust your `.claspignore` accordingly.
