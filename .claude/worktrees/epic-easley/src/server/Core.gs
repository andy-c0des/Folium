/* ===================== MENU ===================== */

function plantosBuildMenu_() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('PlantOS')
    .addItem('Set Web App URL (manual)', 'plantosMenuSetWebAppUrlManual')
    .addItem('Confirm Web App URL (auto)', 'plantosMenuConfirmWebAppUrlAuto')
    .addSeparator()
    .addItem('Wipe Previous Deployments (IDs/URLs)', 'plantosMenuWipeDeploymentFields')
    .addItem('Rebuild Deployments (links/folders/docs/QR)', 'plantosMenuRebuildStart')
    .addItem('Continue Rebuild (resume)', 'plantosMenuRebuildContinue')
    .addItem('Fix QR Columns / Links', 'plantosMenuFixQrColumnsLinks')
    .addSeparator()
    .addItem('STOP (clear rebuild cursor)', 'plantosMenuStop')
    .addSeparator()
    .addItem('Backfill Missing Plant UIDs', 'plantosMenuBackfillUids')
    .addItem('Diagnostics (sanity check)', 'plantosMenuDiagnostics')
    .addToUi();
}

function plantosMenuSetWebAppUrlManual() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('Set ACTIVE_WEBAPP_URL', 'Paste your deployed Web App URL (ending in /exec).', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const url = String(resp.getResponseText() || '').trim();
  const ok = plantosValidateWebAppUrl_(url);
  if (!ok.ok) { ui.alert('Nope.\n' + ok.reason); return; }
  plantosSetSetting_(PLANTOS_BACKEND_CFG.SETTINGS_KEYS.ACTIVE_WEBAPP_URL, url);
  ui.alert('Saved ACTIVE_WEBAPP_URL:\n' + url);
}

function plantosMenuConfirmWebAppUrlAuto() {
  const ui = SpreadsheetApp.getUi();
  const url = plantosGetCurrentWebAppUrl_();
  if (!url) { ui.alert('Could not detect current Web App URL.\nUse "Set Web App URL (manual)" instead.'); return; }
  const ok = plantosValidateWebAppUrl_(url);
  if (!ok.ok) { ui.alert('Auto-detected URL does not look like a deployed /exec URL.\nDetected:\n' + url); return; }
  plantosSetSetting_(PLANTOS_BACKEND_CFG.SETTINGS_KEYS.ACTIVE_WEBAPP_URL, url);
  ui.alert('Saved ACTIVE_WEBAPP_URL:\n' + url);
}

function plantosMenuWipeDeploymentFields() {
  plantosWipeDeploymentFields_();
  SpreadsheetApp.getUi().alert('Done.\nDeployment IDs/URLs cleared.\n(Drive folders/files NOT deleted.)');
}
function plantosMenuRebuildStart()    { SpreadsheetApp.getUi().alert(plantosRebuildDeploymentAssets_({ resume: false }).message); }
function plantosMenuRebuildContinue() { SpreadsheetApp.getUi().alert(plantosRebuildDeploymentAssets_({ resume: true }).message); }
function plantosMenuStop() {
  plantosSetSetting_(PLANTOS_BACKEND_CFG.SETTINGS_KEYS.REBUILD_CURSOR, '');
  SpreadsheetApp.getUi().alert('Stopped. Rebuild cursor cleared.');
}
function plantosMenuDiagnostics() { SpreadsheetApp.getUi().alert(plantosDiagnostics_()); }

/* ===================== SETTINGS ===================== */

function plantosGetSetting_(key) {
  const sh = plantosGetSheet_(PLANTOS_BACKEND_CFG.SETTINGS_SHEET);
  const values = sh.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (plantosNorm_(values[r][0]) === plantosNorm_(key)) return String(values[r][1] || '').trim();
  }
  return '';
}

function plantosSetSetting_(key, value) {
  const sh = plantosGetSheet_(PLANTOS_BACKEND_CFG.SETTINGS_SHEET);
  const values = sh.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (plantosNorm_(values[r][0]) === plantosNorm_(key)) { sh.getRange(r + 1, 2).setValue(value); return; }
  }
  sh.appendRow([key, value]);
}

/* ===================== SHEET HELPERS ===================== */

function plantosGetSS_()              { return SpreadsheetApp.getActiveSpreadsheet(); }
function plantosGetSheet_(name)       { const sh = plantosGetSS_().getSheetByName(name); if (!sh) throw new Error('Missing sheet: ' + name); return sh; }
function plantosGetInventorySheet_()  { return plantosGetSheet_(PLANTOS_BACKEND_CFG.INVENTORY_SHEET); }

function plantosReadInventory_() {
  const sh = plantosGetInventorySheet_();
  const values = sh.getDataRange().getValues();
  const headers = values[0] || [];
  return { sh, values, headers, hmap: plantosHeaderMap_(headers) };
}

/* ===================== FIX #15: One-time setup for optional columns ===================== */
function plantosEnsureOptionalColumns() {
  const sh = plantosGetInventorySheet_();
  const headerRow = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] || [];
  const hmap = plantosHeaderMap_(headerRow);
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const desired = [H.POT_MATERIAL, H.POT_SHAPE, H.CULTIVAR, H.HYBRID_NOTE, H.INFRA_RANK, H.INFRA_EPITHET, H.LAST_REPOTTED];
  const added = [];
  desired.forEach(function(col) {
    if (plantosCol_(hmap, col) < 0) {
      const lastCol = sh.getLastColumn();
      sh.getRange(1, lastCol + 1).setValue(col);
      added.push(col);
    }
  });
  const msg = added.length > 0
    ? 'Added ' + added.length + ' column(s): ' + added.join(', ')
    : 'All optional columns already present.';
  try { SpreadsheetApp.getUi().alert('PlantOS – Column Setup', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch(e) {}
  Logger.log('[PlantOS] ensureOptionalColumns: ' + msg);
  return { ok: true, added };
}

/* ===================== QR COLUMN MANAGEMENT ===================== */

function plantosEnsureInventoryQrColumns_() {
  const sh = plantosGetInventorySheet_();
  const headerRow = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] || [];
  const hmap = plantosHeaderMap_(headerRow);
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const uidIdx = plantosCol_(hmap, H.UID);
  if (uidIdx < 0) throw new Error(`Missing required header: "${H.UID}"`);
  const desired = [H.PLANT_PAGE_URL, H.QR_SCRIPT_URL, H.QR_IMAGE];
  const added = [];
  let insertAfterCol = uidIdx + 1;
  for (let k = 0; k < desired.length; k++) {
    const name = desired[k];
    const curHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] || [];
    if (plantosCol_(plantosHeaderMap_(curHeaders), name) >= 0) continue;
    sh.insertColumnAfter(insertAfterCol);
    sh.getRange(1, insertAfterCol + 1).setValue(name);
    try { sh.setColumnWidth(insertAfterCol + 1, name === H.QR_IMAGE ? 140 : 240); } catch (e) {}
    added.push(name);
    insertAfterCol++;
  }
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] || [];
  return { added, sh, headers, hmap: plantosHeaderMap_(headers) };
}

function plantosMenuFixQrColumnsLinks() {
  const ui = SpreadsheetApp.getUi();
  try {
    plantosEnsureInventoryQrColumns_();
    const res = plantosBackfillQrScriptLinks_();
    ui.alert('✅ QR columns/links repaired.\n\n' + res.message);
  } catch (e) { ui.alert('Fix failed:\n' + (e && e.message ? e.message : String(e))); }
}

function plantosBackfillQrScriptLinks_() {
  const baseUrl = plantosGetSetting_(PLANTOS_BACKEND_CFG.SETTINGS_KEYS.ACTIVE_WEBAPP_URL);
  const ok = plantosValidateWebAppUrl_(baseUrl);
  if (!ok.ok) return { ok: false, message: 'ACTIVE_WEBAPP_URL not set or invalid.\n' + ok.reason };
  const { sh, headers, hmap } = plantosReadInventory_();
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const uidCol = plantosCol_(hmap, H.UID);
  const plantPageUrlCol = plantosCol_(hmap, H.PLANT_PAGE_URL);
  const qrScriptUrlCol = plantosCol_(hmap, H.QR_SCRIPT_URL);
  const qrImageCol = plantosCol_(hmap, H.QR_IMAGE);
  if (uidCol < 0) return { ok: false, message: `Missing required header: "${H.UID}"` };
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: true, message: 'No rows to update.' };
  const range = sh.getRange(2, 1, lastRow - 1, headers.length);
  const values = range.getValues();
  let updated = 0;
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const uid = plantosSafeStr_(row[uidCol]).trim();
    if (!uid) continue;
    const plantPageUrl = plantosBuildPlantPageUrl_(baseUrl, uid);
    const qrScriptUrl = plantosBuildQrScriptUrl_(plantPageUrl);
    if (plantPageUrlCol >= 0 && !plantosSafeStr_(row[plantPageUrlCol]).trim()) { row[plantPageUrlCol] = plantPageUrl; updated++; }
    if (qrScriptUrlCol >= 0 && !plantosSafeStr_(row[qrScriptUrlCol]).trim()) { row[qrScriptUrlCol] = qrScriptUrl; updated++; }
    if (qrImageCol >= 0 && !plantosSafeStr_(row[qrImageCol]).trim()) {
      const colLetter = plantosColToA1_(qrScriptUrlCol + 1);
      row[qrImageCol] = `=IF(LEN(${colLetter}${i + 2})=0,"",IMAGE(${colLetter}${i + 2}))`;
      updated++;
    }
    values[i] = row;
  }
  range.setValues(values);
  return { ok: true, message: `Updated ${updated} cells across ${values.length} rows.` };
}

function plantosBuildQrScriptUrl_(plantPageUrl) {
  return `${PLANTOS_BACKEND_CFG.QR.API}?size=${encodeURIComponent(PLANTOS_BACKEND_CFG.QR.SIZE)}&data=${encodeURIComponent(String(plantPageUrl||''))}`;
}

function plantosColToA1_(col) {
  let n = Number(col || 0), s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s || 'A';
}

/* ===================== UTILITY ===================== */

function plantosNorm_(s)     { return String(s == null ? '' : s).trim().toLowerCase(); }
/* ===================== DIAGNOSTIC ===================== */
function plantosDebug() {
  try {
    const ss = plantosGetSS_();
    if (!ss) return { ok: false, error: 'getActiveSpreadsheet() returned null' };
    const sheetNames = ss.getSheets().map(s => s.getName());
    const invName = PLANTOS_BACKEND_CFG.INVENTORY_SHEET;
    const sh = ss.getSheetByName(invName);
    if (!sh) return { ok: false, error: 'Sheet not found: ' + invName, sheets: sheetNames };
    const range = sh.getDataRange();
    const values = range.getValues();
    const headers = values[0] || [];
    const hmap = plantosHeaderMap_(headers);
    const uidCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.UID);
    const locCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.LOCATION);
    const firstRows = values.slice(1, 4).map(r => ({
      uid: String(r[uidCol] || ''),
      loc: String(r[locCol] || ''),
      nick: String(r[plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.NICKNAME)] || ''),
    }));
    return {
      ok: true,
      spreadsheetName: ss.getName(),
      sheetFound: invName,
      rowCount: values.length - 1,
      colCount: headers.length,
      uidCol,
      locCol,
      headers: headers.map(h => String(h)),
      firstRows,
      hmapKeys: Object.keys(hmap),
    };
  } catch(e) {
    return { ok: false, error: e.message, stack: e.stack };
  }
}


function plantosDebugLocations() {
  const inv = plantosReadInventory_();
  const values = inv.values, hmap = inv.hmap;
  const locCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.LOCATION);
  const uidCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.UID);
  if (locCol < 0) return { ok: false, error: 'locCol not found', locCol: locCol };
  const counts = {};
  const samples = {};
  for (let r = 1; r < values.length; r++) {
    const uid = uidCol >= 0 ? plantosSafeStr_(values[r][uidCol]).trim() : '';
    if (!uid) continue;
    const raw = values[r][locCol];
    const loc = String(raw == null ? '' : raw);
    const key = JSON.stringify(loc); // show exact string including whitespace/encoding
    counts[key] = (counts[key] || 0) + 1;
    if (!samples[key]) samples[key] = uid;
  }
  return { ok: true, locCol: locCol, locationCounts: counts, sampleUids: samples };
}


function plantosSafeStr_(v)  { return (v == null) ? '' : String(v); }

function plantosHeaderMap_(headers) {
  const map = {};
  headers.forEach((h, i) => { const k = plantosNorm_(h); if (k && !(k in map)) map[k] = i; });
  return map;
}

function plantosCol_(hmap, headerName) {
  const idx = hmap[plantosNorm_(headerName)];
  return (typeof idx === 'number') ? idx : -1;
}

// FIX #14: Try multiple header names, return first match
function plantosColMulti_(hmap, ...names) {
  for (let i = 0; i < names.length; i++) {
    const idx = hmap[plantosNorm_(names[i])];
    if (typeof idx === 'number') return idx;
  }
  return -1;
}

function plantosAsDate_(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) return v;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

function plantosFmtDate_(d) {
  if (!d) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function plantosAddDays_(d, days) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + days);
  return x;
}

function plantosNow_() { return new Date(); }

/* ===================== URL ===================== */

function plantosGetCurrentWebAppUrl_() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}

function plantosValidateWebAppUrl_(url) {
  const u = String(url || '').trim();
  if (!u) return { ok: false, reason: 'Empty URL.' };
  if (!u.startsWith('https://script.google.com/macros/s/')) return { ok: false, reason: 'URL must start with https://script.google.com/macros/s/' };
  if (!(u.includes('/exec') || u.includes('/dev'))) return { ok: false, reason: 'URL should contain /exec (or /dev for test).' };
  return { ok: true };
}

function plantosBuildPlantPageUrl_(baseUrl, uid) {
  const u = String(baseUrl || '').trim();
  const safeUid = String(uid || '').trim().replace(/[^A-Za-z0-9]/g, '');
  if (!u || !safeUid) return '';
  return `${u.split('?')[0].split('#')[0]}?uid=${encodeURIComponent(safeUid)}`;
}

/* ===================== WIPE DEPLOYMENT FIELDS ===================== */

function plantosWipeDeploymentFields_() {
  const { sh, hmap } = plantosReadInventory_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  [H.FOLDER_ID, H.FOLDER_URL, H.CARE_DOC_ID, H.CARE_DOC_URL, H.QR_FILE_ID, H.QR_URL, H.PLANT_PAGE_URL]
    .map(h => plantosCol_(hmap, h)).filter(i => i >= 0)
    .forEach(ci => sh.getRange(2, ci + 1, lastRow - 1, 1).clearContent());
  plantosSetSetting_(PLANTOS_BACKEND_CFG.SETTINGS_KEYS.REBUILD_CURSOR, '');
}

/* ===================== AUTO-ASSIGN UID ON SHEET EDIT ===================== */

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sh = e.range.getSheet();
    if (sh.getName() !== PLANTOS_BACKEND_CFG.INVENTORY_SHEET) return;

    const editedRow = e.range.getRow();
    if (editedRow < 2) return; // ignore header row

    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] || [];
    const hmap = plantosHeaderMap_(headers);
    const H = PLANTOS_BACKEND_CFG.HEADERS;
    const uidCol = plantosCol_(hmap, H.UID);
    const nickCol = plantosCol_(hmap, H.NICKNAME);
    const genusCol = plantosCol_(hmap, H.GENUS);
    const taxonCol = plantosCol_(hmap, H.TAXON);
    if (uidCol < 0) return;

    // Check if this row already has a UID
    const existingUid = String(sh.getRange(editedRow, uidCol + 1).getValue() || '').trim();
    if (existingUid) return;

    // Check if the row now has a nickname, genus, or taxon
    const nick  = nickCol  >= 0 ? String(sh.getRange(editedRow, nickCol + 1).getValue() || '').trim()  : '';
    const genus = genusCol >= 0 ? String(sh.getRange(editedRow, genusCol + 1).getValue() || '').trim() : '';
    const taxon = taxonCol >= 0 ? String(sh.getRange(editedRow, taxonCol + 1).getValue() || '').trim() : '';
    if (!nick && !genus && !taxon) return;

    // Auto-assign the next UID
    const uid = plantosGenerateNextUid_();
    sh.getRange(editedRow, uidCol + 1).setValue(uid);
  } catch (err) {
    // Silent fail — onEdit must not throw or it blocks user edits
    Logger.log('[PlantOS] onEdit auto-UID error: ' + (err && err.message ? err.message : String(err)));
  }
}

/* ===================== BACKFILL MISSING UIDs ===================== */

function plantosMenuBackfillUids() {
  const ui = SpreadsheetApp.getUi();
  const result = plantosBackfillMissingUids_();
  ui.alert('Backfill UIDs', result.message, ui.ButtonSet.OK);
}

function plantosBackfillMissingUids_() {
  const { sh, values, headers, hmap } = plantosReadInventory_();
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const uidCol   = plantosCol_(hmap, H.UID);
  const nickCol  = plantosCol_(hmap, H.NICKNAME);
  const genusCol = plantosCol_(hmap, H.GENUS);
  const taxonCol = plantosCol_(hmap, H.TAXON);
  if (uidCol < 0) return { filled: 0, message: 'Plant UID column not found.' };

  // Find current max UID
  let max = 0;
  for (let r = 1; r < values.length; r++) {
    const n = Number(plantosSafeStr_(values[r][uidCol]).trim());
    if (!isNaN(n) && n > 0) max = Math.max(max, n);
  }

  let filled = 0;
  for (let r = 1; r < values.length; r++) {
    const existingUid = plantosSafeStr_(values[r][uidCol]).trim();
    if (existingUid) continue;

    const nick  = nickCol  >= 0 ? plantosSafeStr_(values[r][nickCol]).trim()  : '';
    const genus = genusCol >= 0 ? plantosSafeStr_(values[r][genusCol]).trim() : '';
    const taxon = taxonCol >= 0 ? plantosSafeStr_(values[r][taxonCol]).trim() : '';
    if (!nick && !genus && !taxon) continue;

    max++;
    sh.getRange(r + 1, uidCol + 1).setValue(String(max));
    filled++;
  }

  const message = filled > 0
    ? 'Assigned UIDs to ' + filled + ' plant(s) that were missing one.'
    : 'All plants already have UIDs. Nothing to backfill.';
  return { filled, message };
}
