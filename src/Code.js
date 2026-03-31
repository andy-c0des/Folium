/* PlantOS — Code.gs v2.0 */

const PLANTOS_BACKEND_CFG = {
  INVENTORY_SHEET: 'Plant Care Tracking + Inventory',
  SETTINGS_SHEET: 'PlantOS Settings',

  SETTINGS_KEYS: {
    ACTIVE_WEBAPP_URL: 'ACTIVE_WEBAPP_URL',
    REBUILD_CURSOR: 'REBUILD_CURSOR',
    DRIVE_ROOT_ID: 'DRIVE_ROOT_ID',
    DRIVE_PLANTS_ID: 'DRIVE_PLANTS_ID',
    DRIVE_QR_ID: 'DRIVE_QR_ID',
  },

  DRIVE_NAMES: {
    ROOT: 'PlantOS',
    PLANTS: 'Plants',
    QR: 'QR - Plant Pages',
  },

  CANONICAL_PLANT_FOLDER_PREFIX: 'UID_',
  PHOTOS_SUBFOLDER: 'Photos',
  REBUILD_CHUNK: 35,

  QR: {
    SIZE: '320x320',
    API: 'https://api.qrserver.com/v1/create-qr-code/',
  },

  HEADERS: {
    UID: 'Plant UID',
    NICKNAME: 'Nick-name',
    GENUS: 'Genus',
    TAXON: 'Taxon Raw',
    LOCATION: 'Location',
    PLANT_ID: 'Plant ID',

    FOLDER_ID: 'Folder ID',
    FOLDER_URL: 'Folder URL',
    CARE_DOC_ID: 'Care Doc ID',
    CARE_DOC_URL: 'Care Doc URL',
    QR_FILE_ID: 'QR File ID',
    QR_URL: 'QR URL',
    PLANT_PAGE_URL: 'Plant Page URL',
    QR_SCRIPT_URL: 'QR Script URL',
    QR_IMAGE: 'QR Image',

    LAST_WATERED: 'Last Watered',
    WATER_EVERY_DAYS: 'Water Every Days',       // FIX #14: fallback alias below
    WATER_EVERY_DAYS_ALT: 'Water Every (Days)', // FIX #14: actual sheet header
    WATERED: 'Watered',

    LAST_FERTILIZED: 'Last Fertilized',
    FERT_EVERY_DAYS: 'Fertilize Every Days',
    FERTILIZED: 'Fertilized',

    POT_SIZE: 'Pot Size',
    POT_MATERIAL: 'Pot Material',   // FIX #12
    POT_SHAPE: 'Pot Shape',         // FIX #12
    MEDIUM: 'Medium',
    GROWING_METHOD: 'Growing Method',
    SEMIHYDRO_FERT_MODE: 'SH Fert Mode',
    FLUSH_EVERY_N: 'Flush Every N',
    BIRTHDAY: 'Birthday',
    LAST_REPOTTED: 'Last Repot',    // FIX #15
    CULTIVAR: 'Cultivar',           // FIX #15
    HYBRID_NOTE: 'Hybrid Note',     // FIX #15
    INFRA_RANK: 'Infra Rank',       // FIX #15
    INFRA_EPITHET: 'Infra Epithet', // FIX #15

    LATEST_PHOTO_ID: 'Latest Photo ID',
    LATEST_PHOTO_THUMB: 'Latest Photo Thumb',
    LATEST_PHOTO_VIEW: 'Latest Photo View',
    LATEST_PHOTO_UPDATED: 'Latest Photo Updated',
    PURCHASE_PRICE: 'Purchase Price',
    LAST_PROGRESS_UPDATE: 'Last Progress Update',
    PROGRESS_STATUS: 'Progress Status',
  }
};

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
  const desired = [H.POT_MATERIAL, H.POT_SHAPE, H.CULTIVAR, H.HYBRID_NOTE, H.INFRA_RANK, H.INFRA_EPITHET, H.LAST_REPOTTED, H.PURCHASE_PRICE];
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

/* ===================== DRIVE RESILIENCE ===================== */

function plantosDriveRetry_(label, fn, attempts) {
  const max = attempts || 3;
  let lastErr = null;
  for (let i = 0; i < max; i++) {
    try { return fn(); } catch (e) { lastErr = e; try { Utilities.sleep(250 * Math.pow(2, i)); } catch (_) {} }
  }
  throw new Error(`${label} failed after ${max} attempts: ${lastErr && lastErr.message ? lastErr.message : String(lastErr)}`);
}

function plantosGetOrCreateRootFolder_() {
  const key = PLANTOS_BACKEND_CFG.SETTINGS_KEYS.DRIVE_ROOT_ID;
  const existingId = plantosGetSetting_(key);
  if (existingId) { try { return plantosDriveRetry_('getFolderById(root)', () => DriveApp.getFolderById(existingId), 2); } catch (e) {} }
  const name = PLANTOS_BACKEND_CFG.DRIVE_NAMES.ROOT;
  const folder = plantosDriveRetry_('createFolder(root)', () => { const it = DriveApp.getFoldersByName(name); return it.hasNext() ? it.next() : DriveApp.createFolder(name); });
  plantosSetSetting_(key, folder.getId());
  return folder;
}

function plantosGetOrCreateChildFolder_(parent, name, settingsKey) {
  if (settingsKey) {
    const existingId = plantosGetSetting_(settingsKey);
    if (existingId) { try { return plantosDriveRetry_(`getFolderById(${name})`, () => DriveApp.getFolderById(existingId), 2); } catch (e) {} }
  }
  const folder = plantosDriveRetry_(`createFolder(${name})`, () => { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); });
  if (settingsKey) plantosSetSetting_(settingsKey, folder.getId());
  return folder;
}

function plantosGetPlantsRoot_() { return plantosGetOrCreateChildFolder_(plantosGetOrCreateRootFolder_(), PLANTOS_BACKEND_CFG.DRIVE_NAMES.PLANTS, PLANTOS_BACKEND_CFG.SETTINGS_KEYS.DRIVE_PLANTS_ID); }
function plantosGetQrRoot_()     { return plantosGetOrCreateChildFolder_(plantosGetOrCreateRootFolder_(), PLANTOS_BACKEND_CFG.DRIVE_NAMES.QR, PLANTOS_BACKEND_CFG.SETTINGS_KEYS.DRIVE_QR_ID); }

function plantosEnsureSubfolder_(folder, name) {
  return plantosDriveRetry_(`ensureSubfolder(${name})`, () => { const it = folder.getFoldersByName(name); return it.hasNext() ? it.next() : folder.createFolder(name); });
}

function plantosCanonicalFolderName_(uid) { return PLANTOS_BACKEND_CFG.CANONICAL_PLANT_FOLDER_PREFIX + String(uid || '').trim(); }

function plantosResolveOrCreatePlantFolder_(plantsRootFolder, uid) {
  const canonicalName = plantosCanonicalFolderName_(uid);
  let it = plantsRootFolder.getFoldersByName(canonicalName);
  if (it.hasNext()) return it.next();
  const uidStr = String(uid || '').trim();
  const all = plantsRootFolder.getFolders();
  while (all.hasNext()) {
    const f = all.next();
    const n = String(f.getName() || '');
    if (n === uidStr || n.startsWith(uidStr + ' —') || n.startsWith(uidStr + ' -') || n.startsWith(uidStr + '—') || n.startsWith(uidStr + '-')) {
      try { f.setName(canonicalName); } catch (e) {}
      return f;
    }
  }
  return plantsRootFolder.createFolder(canonicalName);
}

/* ===================== DEPLOYMENT REBUILD ===================== */

function plantosRebuildDeploymentAssets_(opts) {
  opts = opts || {};
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) return { ok: false, message: 'Another PlantOS job is running. Try again in a moment.' };
  try {
    const baseUrl = plantosGetSetting_(PLANTOS_BACKEND_CFG.SETTINGS_KEYS.ACTIVE_WEBAPP_URL);
    const ok = plantosValidateWebAppUrl_(baseUrl);
    if (!ok.ok) return { ok: false, message: 'ACTIVE_WEBAPP_URL not set or invalid.\n' + ok.reason };
    const plantsRoot = plantosGetPlantsRoot_();
    const qrRoot = plantosGetQrRoot_();
    try { plantosEnsureInventoryQrColumns_(); } catch (e) {}
    const { sh, headers, hmap } = plantosReadInventory_();
    const H = PLANTOS_BACKEND_CFG.HEADERS;
    const uidCol = plantosCol_(hmap, H.UID);
    if (uidCol < 0) return { ok: false, message: `Missing required header: "${H.UID}"` };
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return { ok: true, message: 'No plants to rebuild.' };
    let cursor = 2;
    if (opts.resume) { const c = Number(plantosGetSetting_(PLANTOS_BACKEND_CFG.SETTINGS_KEYS.REBUILD_CURSOR) || ''); if (c >= 2) cursor = c; }
    if (cursor > lastRow) { plantosSetSetting_(PLANTOS_BACKEND_CFG.SETTINGS_KEYS.REBUILD_CURSOR, ''); return { ok: true, message: 'Nothing to do. Cursor already past end.' }; }
    const start = cursor, end = Math.min(lastRow, start + PLANTOS_BACKEND_CFG.REBUILD_CHUNK - 1);
    const range = sh.getRange(start, 1, end - start + 1, headers.length);
    const block = range.getValues();
    const folderIdCol = plantosCol_(hmap, H.FOLDER_ID), folderUrlCol = plantosCol_(hmap, H.FOLDER_URL);
    const careDocIdCol = plantosCol_(hmap, H.CARE_DOC_ID), careDocUrlCol = plantosCol_(hmap, H.CARE_DOC_URL);
    const qrFileIdCol = plantosCol_(hmap, H.QR_FILE_ID), qrUrlCol = plantosCol_(hmap, H.QR_URL);
    const plantPageUrlCol = plantosCol_(hmap, H.PLANT_PAGE_URL), qrScriptUrlCol = plantosCol_(hmap, H.QR_SCRIPT_URL), qrImageCol = plantosCol_(hmap, H.QR_IMAGE);
    const totalPlants = lastRow - 1;
    for (let i = 0; i < block.length; i++) {
      const row = block[i];
      const uid = plantosSafeStr_(row[uidCol]).trim();
      if (!uid) continue;
      Logger.log('[PlantOS] Rebuilding ' + (start + i - 1) + '/' + totalPlants + ': ' + uid);
      const primary = plantosComputePrimaryLabel_(hmap, row);
      const plantPageUrl = plantosBuildPlantPageUrl_(baseUrl, uid);
      if (plantPageUrlCol >= 0 && !plantosSafeStr_(row[plantPageUrlCol]).trim()) row[plantPageUrlCol] = plantPageUrl;
      const qrScriptUrl = plantosBuildQrScriptUrl_(plantPageUrl);
      if (qrScriptUrlCol >= 0 && !plantosSafeStr_(row[qrScriptUrlCol]).trim()) row[qrScriptUrlCol] = qrScriptUrl;
      if (qrImageCol >= 0 && !plantosSafeStr_(row[qrImageCol]).trim()) {
        const colLetter = plantosColToA1_(qrScriptUrlCol + 1);
        row[qrImageCol] = `=IF(LEN(${colLetter}${start + i})=0,"",IMAGE(${colLetter}${start + i}))`;
      }
      let plantFolder = null;
      if (folderIdCol >= 0) { const fid = plantosSafeStr_(row[folderIdCol]).trim(); if (fid) try { plantFolder = DriveApp.getFolderById(fid); } catch (e) { plantFolder = null; } }
      if (!plantFolder) {
        plantFolder = plantosResolveOrCreatePlantFolder_(plantsRoot, uid);
        try { const cn = plantosCanonicalFolderName_(uid); if (plantFolder.getName() !== cn) plantFolder.setName(cn); } catch (e) {}
        if (folderIdCol >= 0) row[folderIdCol] = plantFolder.getId();
        if (folderUrlCol >= 0) row[folderUrlCol] = plantFolder.getUrl();
      } else {
        try { const cn = plantosCanonicalFolderName_(uid); if (plantFolder.getName() !== cn) plantFolder.setName(cn); } catch (e) {}
        if (folderUrlCol >= 0 && !plantosSafeStr_(row[folderUrlCol]).trim()) row[folderUrlCol] = plantFolder.getUrl();
      }
      plantosEnsureSubfolder_(plantFolder, PLANTOS_BACKEND_CFG.PHOTOS_SUBFOLDER);
      if (careDocIdCol >= 0 && !plantosSafeStr_(row[careDocIdCol]).trim()) {
        const docFile = plantosEnsureCareDoc_(plantFolder, uid, primary);
        row[careDocIdCol] = docFile.getId();
        if (careDocUrlCol >= 0) row[careDocUrlCol] = docFile.getUrl();
      } else if (careDocUrlCol >= 0 && careDocIdCol >= 0 && plantosSafeStr_(row[careDocIdCol]).trim() && !plantosSafeStr_(row[careDocUrlCol]).trim()) {
        try { row[careDocUrlCol] = DriveApp.getFileById(String(row[careDocIdCol])).getUrl(); } catch (e) {}
      }
      if (qrFileIdCol >= 0 && !plantosSafeStr_(row[qrFileIdCol]).trim()) {
        try { const qrFile = plantosEnsurePlantQr_(qrRoot, uid, primary, plantPageUrl); row[qrFileIdCol] = qrFile.getId(); if (qrUrlCol >= 0) row[qrUrlCol] = qrFile.getUrl(); } catch (e) {}
      } else if (qrUrlCol >= 0 && qrFileIdCol >= 0 && plantosSafeStr_(row[qrFileIdCol]).trim() && !plantosSafeStr_(row[qrUrlCol]).trim()) {
        try { row[qrUrlCol] = plantosDriveRetry_('getUrl(QR)', () => DriveApp.getFileById(String(row[qrFileIdCol])).getUrl(), 2); } catch (e) {}
      }
      block[i] = row;
    }
    range.setValues(block);
    const nextCursor = end + 1;
    if (nextCursor <= lastRow) { plantosSetSetting_(PLANTOS_BACKEND_CFG.SETTINGS_KEYS.REBUILD_CURSOR, nextCursor); return { ok: true, message: `Rebuilt rows ${start}–${end}.\nRun "Continue Rebuild" to finish.` }; }
    plantosSetSetting_(PLANTOS_BACKEND_CFG.SETTINGS_KEYS.REBUILD_CURSOR, '');
    return { ok: true, message: `Rebuilt rows ${start}–${end}.\nAll done ✅` };
  } catch (e) {
    return { ok: false, message: 'Rebuild failed: ' + (e && e.message ? e.message : e) };
  } finally {
    lock.releaseLock();
  }
}

function plantosComputePrimaryLabel_(hmap, row) {
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const nn = plantosCol_(hmap, H.NICKNAME) >= 0 ? plantosSafeStr_(row[plantosCol_(hmap, H.NICKNAME)]).trim() : '';
  if (nn) return nn;
  const genus = plantosCol_(hmap, H.GENUS) >= 0 ? plantosSafeStr_(row[plantosCol_(hmap, H.GENUS)]).trim() : '';
  const taxon = plantosCol_(hmap, H.TAXON) >= 0 ? plantosSafeStr_(row[plantosCol_(hmap, H.TAXON)]).trim() : '';
  const combo = [genus, taxon].filter(Boolean).join(' ').trim();
  if (combo) return combo;
  const pid = plantosCol_(hmap, H.PLANT_ID) >= 0 ? plantosSafeStr_(row[plantosCol_(hmap, H.PLANT_ID)]).trim() : '';
  return pid ? `Plant ${pid}` : 'Plant';
}

function plantosEnsureCareDoc_(plantFolder, uid, primary) {
  const canonical = plantosCanonicalFolderName_(uid);
  const desiredPrefix = `Care Log — ${canonical}`;
  const files = plantFolder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getMimeType && f.getMimeType() === MimeType.GOOGLE_DOCS) {
      const name = String(f.getName() || '');
      if (name.startsWith(desiredPrefix) || name.includes(canonical) || name.startsWith('Care Log')) return f;
    }
  }
  const title = `${desiredPrefix} — ${primary}`.substring(0, 180);
  const doc = DocumentApp.create(title);
  const body = doc.getBody();
  body.appendParagraph('PlantOS Care Log').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(`UID: ${uid}`);
  body.appendParagraph(`Primary: ${primary}`);
  body.appendParagraph('');
  body.appendParagraph('Entries:').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  doc.saveAndClose();
  const file = plantosDriveRetry_('getFileById(careDoc)', () => DriveApp.getFileById(doc.getId()), 3);
  plantosDriveRetry_('addFile(careDoc)', () => plantFolder.addFile(file), 3);
  try { plantosDriveRetry_('removeFile(careDoc)', () => DriveApp.getRootFolder().removeFile(file), 2); } catch (e) {}
  return file;
}

function plantosEnsurePlantQr_(qrRootFolder, uid, primary, plantPageUrl) {
  const canonical = plantosCanonicalFolderName_(uid);
  const filename = `QR_${canonical}.png`;
  const desiredDesc = `PlantOS QR for ${primary} (${uid})\nurl=${plantPageUrl}`;
  let existing = null;
  try { existing = plantosDriveRetry_('getFilesByName', () => { const it = qrRootFolder.getFilesByName(filename); return it.hasNext() ? it.next() : null; }, 2); } catch (e) {}
  if (existing) {
    try { const desc = String(existing.getDescription() || ''); if (desc.includes(`url=${plantPageUrl}`)) return existing; } catch (e) {}
    try {
      const archiveFolder = plantosEnsureSubfolder_(qrRootFolder, 'Archive');
      const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
      plantosDriveRetry_('archiveQR(move)', () => existing.moveTo(archiveFolder), 2);
      plantosDriveRetry_('archiveQR(rename)', () => existing.setName(`QR_${canonical}__${stamp}.png`), 2);
    } catch (e) {}
  }
  const url = `${PLANTOS_BACKEND_CFG.QR.API}?size=${encodeURIComponent(PLANTOS_BACKEND_CFG.QR.SIZE)}&data=${encodeURIComponent(plantPageUrl)}`;
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const code = resp.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('QR fetch failed: ' + code);
  const f = plantosDriveRetry_('createFile(QR)', () => qrRootFolder.createFile(resp.getBlob().setName(filename)), 3);
  try { f.setDescription(desiredDesc); } catch (e) {}
  try { plantosDriveRetry_('setSharing(QR)', () => f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW), 2); } catch (e) {}
  return f;
}

/* ===================== DIAGNOSTICS ===================== */

function plantosDiagnostics_() {
  const lines = [];
  lines.push('ACTIVE_WEBAPP_URL: ' + (plantosGetSetting_(PLANTOS_BACKEND_CFG.SETTINGS_KEYS.ACTIVE_WEBAPP_URL) || '(not set)'));
  lines.push('REBUILD_CURSOR: ' + (plantosGetSetting_(PLANTOS_BACKEND_CFG.SETTINGS_KEYS.REBUILD_CURSOR) || '(none)'));
  try {
    lines.push('Drive ROOT: OK (' + plantosGetOrCreateRootFolder_().getName() + ')');
    lines.push('Drive Plants: OK (' + plantosGetPlantsRoot_().getName() + ')');
    lines.push('Drive QR: OK (' + plantosGetQrRoot_().getName() + ')');
  } catch (e) { lines.push('Drive Roots: ERROR: ' + (e && e.message ? e.message : e)); }
  try {
    const { sh, hmap } = plantosReadInventory_();
    const H = PLANTOS_BACKEND_CFG.HEADERS;
    lines.push('Inventory Sheet: OK (' + sh.getName() + ')');
    lines.push('Plant UID col: ' + (plantosCol_(hmap, H.UID) >= 0 ? 'OK' : 'MISSING'));
    lines.push('Last Watered col: ' + (plantosCol_(hmap, H.LAST_WATERED) >= 0 ? 'OK' : 'MISSING'));
    lines.push('Last Fertilized col: ' + (plantosCol_(hmap, H.LAST_FERTILIZED) >= 0 ? 'OK' : 'MISSING'));
    lines.push('Water Every Days col: ' + (plantosColMulti_(hmap, H.WATER_EVERY_DAYS, H.WATER_EVERY_DAYS_ALT) >= 0 ? 'OK' : 'MISSING — need "Water Every Days" or "Water Every (Days)"')); // FIX #14
    lines.push('Fertilize Every Days col: ' + (plantosCol_(hmap, H.FERT_EVERY_DAYS) >= 0 ? 'OK' : 'MISSING'));
    lines.push('Pot Material col: ' + (plantosCol_(hmap, H.POT_MATERIAL) >= 0 ? 'OK' : 'MISSING — add column "Pot Material" to sheet'));
    lines.push('Pot Shape col: ' + (plantosCol_(hmap, H.POT_SHAPE) >= 0 ? 'OK' : 'MISSING — add column "Pot Shape" to sheet'));
    const uidCol = plantosCol_(hmap, H.UID);
    if (uidCol >= 0) {
      const lastRow = sh.getLastRow();
      const data = (lastRow >= 2) ? sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues() : [];
      let total = 0, missingFolder = 0, missingPage = 0, missingQr = 0;
      const fidCol = plantosCol_(hmap, H.FOLDER_ID), ppCol = plantosCol_(hmap, H.PLANT_PAGE_URL), qrCol = plantosCol_(hmap, H.QR_FILE_ID);
      data.forEach(row => {
        if (!plantosSafeStr_(row[uidCol]).trim()) return;
        total++;
        if (fidCol >= 0 && !plantosSafeStr_(row[fidCol]).trim()) missingFolder++;
        if (ppCol >= 0 && !plantosSafeStr_(row[ppCol]).trim()) missingPage++;
        if (qrCol >= 0 && !plantosSafeStr_(row[qrCol]).trim()) missingQr++;
      });
      lines.push('Rows w/UID: ' + total);
      if (fidCol >= 0) lines.push('Missing Folder ID: ' + missingFolder);
      if (ppCol >= 0) lines.push('Missing Plant Page URL: ' + missingPage);
      if (qrCol >= 0) lines.push('Missing QR File ID: ' + missingQr);
    }
  } catch (e) { lines.push('Inventory: ERROR: ' + (e && e.message ? e.message : e)); }
  return lines.join('\n');
}

/* ===================== PUBLIC API ===================== */

function plantosListLocations() {
  const { values, hmap } = plantosReadInventory_();
  const locCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.LOCATION);
  if (locCol < 0) return [];
  const set = {};
  for (let r = 1; r < values.length; r++) { const loc = plantosSafeStr_(values[r][locCol]).trim(); if (loc) set[loc] = true; }
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('PLANTOS_CUSTOM_LOCATIONS') || '[]';
    JSON.parse(raw).forEach(n => { if (n) set[n] = true; });
  } catch(e) {}
  return Object.keys(set).sort((a, b) => a.localeCompare(b));
}

function plantosHome() {
  const { values, hmap } = plantosReadInventory_();
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const uidCol = plantosCol_(hmap, H.UID), nicknameCol = plantosCol_(hmap, H.NICKNAME);
  const genusCol = plantosCol_(hmap, H.GENUS), taxonCol = plantosCol_(hmap, H.TAXON);
  const lastWateredCol = plantosCol_(hmap, H.LAST_WATERED), everyDaysCol = plantosColMulti_(hmap, H.WATER_EVERY_DAYS, H.WATER_EVERY_DAYS_ALT); // FIX #14
  const birthdayCol = plantosCol_(hmap, H.BIRTHDAY), lastFertCol = plantosCol_(hmap, H.LAST_FERTILIZED);
  const fertEveryCol = plantosCol_(hmap, H.FERT_EVERY_DAYS);
  const lpuCol = plantosCol_(hmap, H.LAST_PROGRESS_UPDATE);
  const now = plantosNow_(), tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(now, tz, 'MM/dd');
  const dueNow = [], upcoming = [], fertDueNow = [], fertUpcoming = [], bothDueNow = [], bothUpcoming = [], birthdays = [], progressDueNow = [];
  let totalCount = 0;
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const uid = uidCol >= 0 ? plantosSafeStr_(row[uidCol]).trim() : '';
    if (!uid) continue;
    totalCount++;
    const nn = nicknameCol >= 0 ? plantosSafeStr_(row[nicknameCol]).trim() : '';
    const genus = genusCol >= 0 ? plantosSafeStr_(row[genusCol]).trim() : '';
    const taxon = taxonCol >= 0 ? plantosSafeStr_(row[taxonCol]).trim() : '';
    const primary = nn || [genus, taxon].filter(Boolean).join(' ') || uid;
    if (birthdayCol >= 0) { const bd = plantosAsDate_(row[birthdayCol]); if (bd && Utilities.formatDate(bd, tz, 'MM/dd') === today) birthdays.push(primary); }
    const waterEvery = everyDaysCol >= 0 ? Number(row[everyDaysCol]) : NaN;
    const lw = lastWateredCol >= 0 ? plantosAsDate_(row[lastWateredCol]) : null;
    let waterBucket = null, waterDue = null;
    if (!isNaN(waterEvery) && waterEvery > 0) {
      if (!lw) { waterBucket = 'now'; waterDue = 'unknown'; }
      else {
        const dueDate = plantosAddDays_(lw, waterEvery);
        const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (24 * 3600 * 1000));
        if (dueDate <= now) { waterBucket = 'now'; waterDue = plantosFmtDate_(dueDate); }
        else if (diffDays >= 1 && diffDays <= 7) { waterBucket = 'upcoming'; waterDue = plantosFmtDate_(dueDate); }
      }
    }
    const fertEvery = fertEveryCol >= 0 ? Number(row[fertEveryCol]) : NaN;
    const lf = lastFertCol >= 0 ? plantosAsDate_(row[lastFertCol]) : null;
    let fertBucket = null, fertDue = null;
    if (!isNaN(fertEvery) && fertEvery > 0) {
      if (!lf) { fertBucket = 'now'; fertDue = 'unknown'; }
      else {
        const dueDate = plantosAddDays_(lf, fertEvery);
        const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (24 * 3600 * 1000));
        if (dueDate <= now) { fertBucket = 'now'; fertDue = plantosFmtDate_(dueDate); }
        else if (diffDays >= 1 && diffDays <= 7) { fertBucket = 'upcoming'; fertDue = plantosFmtDate_(dueDate); }
      }
    }
    if (waterBucket === 'now') dueNow.push({ uid, primary, due: waterDue });
    if (waterBucket === 'upcoming') upcoming.push({ uid, primary, due: waterDue });
    if (fertBucket === 'now') fertDueNow.push({ uid, primary, due: fertDue });
    if (fertBucket === 'upcoming') fertUpcoming.push({ uid, primary, due: fertDue });
    if (waterBucket === 'now' && fertBucket === 'now') bothDueNow.push({ uid, primary, due: waterDue, fertDue });
    else if ((waterBucket === 'now' || waterBucket === 'upcoming') && (fertBucket === 'now' || fertBucket === 'upcoming')) bothUpcoming.push({ uid, primary, due: waterDue, fertDue });
    const lpu = lpuCol >= 0 ? plantosAsDate_(row[lpuCol]) : null;
    const bd2 = birthdayCol >= 0 ? plantosAsDate_(row[birthdayCol]) : null;
    const progBaseline = lpu || bd2;
    if (progBaseline) {
      const progDue = plantosAddDays_(progBaseline, 14);
      if (progDue <= now) progressDueNow.push({ uid, primary, lastUpdate: lpu ? plantosFmtDate_(lpu) : '' });
    }
  }
  const byDue = (a, b) => String(a.due || '').localeCompare(String(b.due || ''));
  [dueNow, upcoming, fertDueNow, fertUpcoming, bothDueNow, bothUpcoming].forEach(a => a.sort(byDue));
  return { dueNow, upcoming, fertDueNow, fertUpcoming, bothDueNow, bothUpcoming, birthdays, totalCount, progressDueNow };
}

/* ===================== FIX #5: Case-insensitive location matching ===================== */
/* FIX #14: Returns { ok, plants, errors, meta } envelope instead of raw array.
   Errors are surfaced, never swallowed. Silent return [] eliminated. */
function plantosGetPlantsByLocation(location) {
  const t0 = Date.now();
  const locLower = plantosSafeStr_(location).trim().toLowerCase();
  const inv = plantosReadInventory_();
  const values = inv.values, hmap = inv.hmap;
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const uidCol = plantosCol_(hmap, H.UID);
  const locCol = plantosCol_(hmap, H.LOCATION);

  // Guard: surface missing columns explicitly
  if (uidCol < 0 || locCol < 0) {
    const missing = [];
    if (uidCol < 0) missing.push('"' + H.UID + '"');
    if (locCol < 0) missing.push('"' + H.LOCATION + '"');
    return {
      ok: false, plants: [],
      errors: ['Missing column(s): ' + missing.join(', ') + '. Sheet headers: ' + JSON.stringify(Object.keys(hmap))],
      meta: { sheetRows: values.length - 1, location: location, ms: Date.now() - t0 }
    };
  }
  const out = [], errors = [];
  let matched = 0, skipped = 0;
  for (let r = 1; r < values.length; r++) {
    try {
      const row = values[r];
      if (plantosSafeStr_(row[locCol]).trim().toLowerCase() !== locLower) continue;
      matched++;
      if (!plantosSafeStr_(row[uidCol]).trim()) { skipped++; continue; }
      out.push(plantosRowToPlant_(hmap, row));
    } catch(e) {
      let uid = '';
      try { uid = plantosSafeStr_(values[r][uidCol]).trim(); } catch(x) {}
      const msg = 'Row ' + (r+1) + (uid ? ' (UID ' + uid + ')' : '') + ': ' + (e && e.message ? e.message : String(e));
      errors.push(msg);
      Logger.log('[PlantOS] getByLocation ' + msg);
    }
  }
  return {
    ok: errors.length === 0,
    plants: out,
    errors: errors,
    meta: { sheetRows: values.length - 1, location: location, matched: matched, returned: out.length, skipped: skipped, errored: errors.length, ms: Date.now() - t0 }
  };
}

/* FIX #14: Returns { ok, plants, errors, meta } envelope.
   NOTE: For large inventories (500+ plants), prefer plantosGetAllPlantsLite(). */
function plantosGetPlantsByLocationLite(location) {
  const t0 = Date.now();
  const locLower = plantosSafeStr_(location).trim().toLowerCase();
  const inv = plantosReadInventory_();
  const values = inv.values, hmap = inv.hmap;
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const uidCol    = plantosCol_(hmap, H.UID);
  const locCol    = plantosCol_(hmap, H.LOCATION);
  if (uidCol < 0 || locCol < 0) {
    return { ok: false, plants: [], errors: ['Missing column(s)'], meta: { location: location, ms: Date.now()-t0 } };
  }
  const nickCol  = plantosCol_(hmap, H.NICKNAME);
  const genusCol = plantosCol_(hmap, H.GENUS);
  const taxonCol = plantosCol_(hmap, H.TAXON);
  const lwCol    = plantosCol_(hmap, H.LAST_WATERED);
  const evCol    = plantosColMulti_(hmap, H.WATER_EVERY_DAYS, H.WATER_EVERY_DAYS_ALT);
  const bdCol    = plantosCol_(hmap, H.BIRTHDAY);
  const lfCol    = plantosCol_(hmap, H.LAST_FERTILIZED);
  const feCol    = plantosCol_(hmap, H.FERT_EVERY_DAYS);
  const medCol   = plantosCol_(hmap, H.MEDIUM);
  const potCol    = plantosCol_(hmap, H.POT_SIZE);
  const potMatCol = plantosCol_(hmap, H.POT_MATERIAL);
  const potShpCol = plantosCol_(hmap, H.POT_SHAPE);
  const cultivarCol  = plantosCol_(hmap, H.CULTIVAR);
  const pidCol   = plantosCol_(hmap, H.PLANT_ID);
  const ppCol    = plantosCol_(hmap, H.PLANT_PAGE_URL);

  const out = [], errors = [];
  let matched = 0, skipped = 0;
  for (let r = 1; r < values.length; r++) {
    try {
      const row = values[r];
      const rowLoc = plantosSafeStr_(row[locCol]).trim();
      if (rowLoc.toLowerCase() !== locLower) continue;
      matched++;
      const uid = plantosSafeStr_(row[uidCol]).trim();
      if (!uid) { skipped++; continue; }

      const nick  = nickCol >= 0  ? plantosSafeStr_(row[nickCol]).trim()  : '';
      const genus = genusCol >= 0 ? plantosSafeStr_(row[genusCol]).trim() : '';
      const taxon = taxonCol >= 0 ? plantosSafeStr_(row[taxonCol]).trim() : '';
      const gs    = [genus, taxon].filter(Boolean).join(' ');
      const inferredGenus = genus || (taxon && /^[A-Z]/.test(taxon) ? taxon.split(/\s+/)[0] : '');
      const primary = nick || gs || uid;

      const lw  = lwCol >= 0 ? plantosAsDate_(row[lwCol]) : null;
      const ev  = evCol >= 0 ? Number(row[evCol]) : NaN;
      let due = '';
      if (lw && !isNaN(ev) && ev > 0) due = plantosFmtDate_(plantosAddDays_(lw, ev));
      const bd  = bdCol >= 0 ? plantosAsDate_(row[bdCol]) : null;

      out.push({
        uid: uid,
        nickname: nick,
        primary: primary,
        genus: inferredGenus,
        species: taxon,
        taxon: taxon,
        gs: gs,
        classification: gs,
        location: rowLoc,
        lastWatered: lw ? plantosFmtDate_(lw) : '',
        waterEveryDays: evCol >= 0 ? plantosSafeStr_(row[evCol]) : '',
        everyDays:      evCol >= 0 ? plantosSafeStr_(row[evCol]) : '',
        due: due,
        birthday: bd ? plantosFmtDate_(bd) : '',
        medium:    medCol >= 0 ? plantosSafeStr_(row[medCol]).trim() : '',
        substrate: medCol >= 0 ? plantosSafeStr_(row[medCol]).trim() : '',
        potSize:   potCol >= 0 ? plantosSafeStr_(row[potCol]).trim() : '',
        humanPlantId: pidCol >= 0 ? plantosSafeStr_(row[pidCol]).trim() : '',
        plantPageUrl: ppCol >= 0 ? plantosSafeStr_(row[ppCol]).trim() : '',
        lastFertilized: lfCol >= 0 && plantosAsDate_(row[lfCol]) ? plantosFmtDate_(plantosAsDate_(row[lfCol])) : '',
        fertEveryDays: feCol >= 0 ? plantosSafeStr_(row[feCol]) : '',
        fertilizeEveryDays: feCol >= 0 ? plantosSafeStr_(row[feCol]) : '',
        // Lite: heavy URL fields omitted
        folderId: '', folderUrl: '', careDocUrl: '',
        potMaterial: potMatCol >= 0 ? plantosSafeStr_(row[potMatCol]).trim() : '',  // FIX #15
        potShape:    potShpCol >= 0 ? plantosSafeStr_(row[potShpCol]).trim() : '',    // FIX #15
        cultivar:    cultivarCol >= 0 ? plantosSafeStr_(row[cultivarCol]).trim() : '', // FIX #15
      });
    } catch(e) {
      let failUid = '';
      try { failUid = plantosSafeStr_(values[r][uidCol]).trim(); } catch(x) {}
      const msg = 'Row ' + (r+1) + (failUid ? ' (UID ' + failUid + ')' : '') + ': ' + (e && e.message ? e.message : String(e));
      errors.push(msg);
      Logger.log('[PlantOS] getByLocationLite ' + msg);
    }
  }
  return {
    ok: errors.length === 0,
    plants: out,
    errors: errors,
    meta: { sheetRows: values.length - 1, location: location, matched: matched, returned: out.length, skipped: skipped, errored: errors.length, ms: Date.now() - t0, lite: true }
  };
}


function plantosGetAllPlants() {
  const t0 = Date.now();
  const inv = plantosReadInventory_();
  const values = inv.values, hmap = inv.hmap;
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const uidCol = plantosCol_(hmap, H.UID);
  if (uidCol < 0) {
    return {
      ok: false, plants: [],
      errors: ['UID column "' + H.UID + '" not found. Sheet headers: ' + JSON.stringify(Object.keys(hmap))],
      meta: { sheetRows: values.length - 1, ms: Date.now() - t0 }
    };
  }
  const out = [], errors = [];
  let skipped = 0;
  for (let r = 1; r < values.length; r++) {
    try {
      if (!plantosSafeStr_(values[r][uidCol]).trim()) { skipped++; continue; }
      out.push(plantosRowToPlant_(hmap, values[r]));
    } catch(e) {
      let uid = '';
      try { uid = plantosSafeStr_(values[r][uidCol]).trim(); } catch(x) {}
      const msg = 'Row ' + (r+1) + (uid ? ' (UID ' + uid + ')' : '') + ': ' + (e && e.message ? e.message : String(e));
      errors.push(msg);
      Logger.log('[PlantOS] getAllPlants ' + msg);
    }
  }
  return {
    ok: errors.length === 0,
    plants: out,
    errors: errors,
    meta: { sheetRows: values.length - 1, returned: out.length, skipped: skipped, errored: errors.length, ms: Date.now() - t0 }
  };
}

/* FIX #14: Lightweight variant for inventory list. Returns only the fields
   the list UI needs. Payload is ~4x smaller than plantosGetAllPlants.
   Returns the same { ok, plants, errors, meta } envelope. */
function plantosGetAllPlantsLite() {
  const t0 = Date.now();
  const inv = plantosReadInventory_();
  const values = inv.values, hmap = inv.hmap;
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const uidCol = plantosCol_(hmap, H.UID);
  if (uidCol < 0) {
    return {
      ok: false, plants: [],
      errors: ['UID column "' + H.UID + '" not found. Sheet headers: ' + JSON.stringify(Object.keys(hmap))],
      meta: { sheetRows: values.length - 1, ms: Date.now() - t0 }
    };
  }
  const nickCol = plantosCol_(hmap, H.NICKNAME);
  const genusCol = plantosCol_(hmap, H.GENUS);
  const taxonCol = plantosCol_(hmap, H.TAXON);
  const locCol = plantosCol_(hmap, H.LOCATION);
  const lwCol = plantosCol_(hmap, H.LAST_WATERED);
  const evCol = plantosColMulti_(hmap, H.WATER_EVERY_DAYS, H.WATER_EVERY_DAYS_ALT);
  const bdCol = plantosCol_(hmap, H.BIRTHDAY);
  const lfCol = plantosCol_(hmap, H.LAST_FERTILIZED);
  const feCol = plantosCol_(hmap, H.FERT_EVERY_DAYS);
  const medCol = plantosCol_(hmap, H.MEDIUM);
  const potCol   = plantosCol_(hmap, H.POT_SIZE);
  const potMatCol = plantosCol_(hmap, H.POT_MATERIAL);
  const potShpCol = plantosCol_(hmap, H.POT_SHAPE);
  const cultivarCol = plantosCol_(hmap, H.CULTIVAR);
  const pidCol = plantosCol_(hmap, H.PLANT_ID);
  const ppCol = plantosCol_(hmap, H.PLANT_PAGE_URL);

  const out = [], errors = [];
  let skipped = 0;
  for (let r = 1; r < values.length; r++) {
    try {
      const row = values[r];
      const uid = plantosSafeStr_(row[uidCol]).trim();
      if (!uid) { skipped++; continue; }
      const nick = nickCol >= 0 ? plantosSafeStr_(row[nickCol]).trim() : '';
      const genus = genusCol >= 0 ? plantosSafeStr_(row[genusCol]).trim() : '';
      const taxon = taxonCol >= 0 ? plantosSafeStr_(row[taxonCol]).trim() : '';
      const loc = locCol >= 0 ? plantosSafeStr_(row[locCol]).trim() : '';
      const gs = [genus, taxon].filter(Boolean).join(' ');
      const inferredGenus = genus || (taxon && /^[A-Z]/.test(taxon) ? taxon.split(/\s+/)[0] : '');
      const primary = nick || gs || uid;

      const lw = lwCol >= 0 ? plantosAsDate_(row[lwCol]) : null;
      const ev = evCol >= 0 ? Number(row[evCol]) : NaN;
      let due = '';
      if (lw && !isNaN(ev) && ev > 0) due = plantosFmtDate_(plantosAddDays_(lw, ev));

      const bd = bdCol >= 0 ? plantosAsDate_(row[bdCol]) : null;

      out.push({
        uid: uid,
        nickname: nick,
        primary: primary,
        genus: inferredGenus,
        species: taxon,
        taxon: taxon,
        gs: gs,
        classification: gs,
        location: loc,
        lastWatered: lw ? plantosFmtDate_(lw) : '',
        waterEveryDays: evCol >= 0 ? plantosSafeStr_(row[evCol]) : '',
        everyDays: evCol >= 0 ? plantosSafeStr_(row[evCol]) : '',
        due: due,
        birthday: bd ? plantosFmtDate_(bd) : '',
        medium: medCol >= 0 ? plantosSafeStr_(row[medCol]).trim() : '',
        substrate: medCol >= 0 ? plantosSafeStr_(row[medCol]).trim() : '',
        potSize: potCol >= 0 ? plantosSafeStr_(row[potCol]).trim() : '',
        humanPlantId: pidCol >= 0 ? plantosSafeStr_(row[pidCol]).trim() : '',
        plantPageUrl: ppCol >= 0 ? plantosSafeStr_(row[ppCol]).trim() : '',
        // Lite: these fields omitted to reduce payload. Full data via plantosGetPlant(uid).
        folderId: '', folderUrl: '', careDocUrl: '',
        lastFertilized: lfCol >= 0 && plantosAsDate_(row[lfCol]) ? plantosFmtDate_(plantosAsDate_(row[lfCol])) : '',
        fertEveryDays: feCol >= 0 ? plantosSafeStr_(row[feCol]) : '',
        fertilizeEveryDays: feCol >= 0 ? plantosSafeStr_(row[feCol]) : '',
        potMaterial: potMatCol >= 0 ? plantosSafeStr_(row[potMatCol]).trim() : '', // FIX #15
        potShape:    potShpCol >= 0 ? plantosSafeStr_(row[potShpCol]).trim() : '', // FIX #15
        cultivar:    cultivarCol >= 0 ? plantosSafeStr_(row[cultivarCol]).trim() : '', // FIX #15
      });
    } catch(e) {
      let failUid = '';
      try { failUid = plantosSafeStr_(values[r][uidCol]).trim(); } catch(x) {}
      const msg = 'Row ' + (r+1) + (failUid ? ' (UID ' + failUid + ')' : '') + ': ' + (e && e.message ? e.message : String(e));
      errors.push(msg);
      Logger.log('[PlantOS] getAllPlantsLite ' + msg);
    }
  }
  return {
    ok: errors.length === 0,
    plants: out,
    errors: errors,
    meta: { sheetRows: values.length - 1, returned: out.length, skipped: skipped, errored: errors.length, ms: Date.now() - t0, lite: true }
  };
}

function plantosGetPlant(uid) {
  const needle = plantosSafeStr_(uid).trim();
  if (!needle) return { ok: false, reason: 'Missing uid' };
  const { values, hmap } = plantosReadInventory_();
  const uidCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.UID);
  if (uidCol < 0) return { ok: false, reason: 'Missing Plant UID column' };
  for (let r = 1; r < values.length; r++) {
    if (plantosSafeStr_(values[r][uidCol]).trim() === needle) {
      const plant = plantosRowToPlant_(hmap, values[r]);
      plant._rowNumber = r + 1;
      return { ok: true, plant };
    }
  }
  return { ok: false, reason: 'Not found' };
}

function plantosSetNickname(uid, nickname) {
  const needle = plantosSafeStr_(uid).trim();
  if (!needle) throw new Error('Missing uid');
  const { sh, values, hmap } = plantosReadInventory_();
  const uidCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.UID);
  const nicknameCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.NICKNAME);
  if (uidCol < 0 || nicknameCol < 0) throw new Error('Missing columns');
  for (let r = 1; r < values.length; r++) {
    if (plantosSafeStr_(values[r][uidCol]).trim() === needle) { sh.getRange(r + 1, nicknameCol + 1).setValue(plantosSafeStr_(nickname).trim()); return { ok: true }; }
  }
  throw new Error('Plant not found');
}

/* ===================== FIX #1/#3/#9/#11/#12/#15: plantosUpdatePlant ===================== */
function plantosUpdatePlant(uid, patch) {
  const needle = plantosSafeStr_(uid).trim();
  if (!needle) throw new Error('Missing uid');
  patch = patch || {};
  const { sh, values, hmap } = plantosReadInventory_();
  const uidCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.UID);
  if (uidCol < 0) throw new Error('Missing Plant UID');

  const H = PLANTOS_BACKEND_CFG.HEADERS;

  // FIX #15: No auto-create here — column creation belongs in setup, not on every save.
  // Missing columns are silently skipped (existing behaviour). Run plantosEnsureOptionalColumns()
  // from the Apps Script menu once to add Pot Material / Pot Shape to the sheet.

  const writable = {
    nickname:          H.NICKNAME,
    potSize:           H.POT_SIZE,
    potMaterial:       H.POT_MATERIAL,   // FIX #12
    potShape:          H.POT_SHAPE,      // FIX #12
    substrate:         H.MEDIUM,  // canonical substrate col
    medium:            H.MEDIUM,
    growingMethod:     H.GROWING_METHOD,
    semiHydroFertMode: H.SEMIHYDRO_FERT_MODE,
    flushEveryN:       H.FLUSH_EVERY_N,
    location:          H.LOCATION,
    birthday:          H.BIRTHDAY,
    waterEveryDays:    H.WATER_EVERY_DAYS,
    fertEveryDays:     H.FERT_EVERY_DAYS,
    fertilizeEveryDays: H.FERT_EVERY_DAYS, // FIX #15: alias
    genus:             H.GENUS,
    taxon:             H.TAXON,
    species:           H.TAXON,
    taxonRaw:          H.TAXON,
    cultivar:          H.CULTIVAR,         // FIX #15
    hybridNote:        H.HYBRID_NOTE,      // FIX #15
    infraRank:         H.INFRA_RANK,       // FIX #15
    infraEpithet:      H.INFRA_EPITHET,    // FIX #15
    lastRepotted:      H.LAST_REPOTTED,    // FIX #15
    purchasePrice:     H.PURCHASE_PRICE,
  };

  // FIX #14: waterEveryDays needs multi-header lookup since sheet may use either name
  const waterEveryDaysCol_ = plantosColMulti_(hmap, H.WATER_EVERY_DAYS, H.WATER_EVERY_DAYS_ALT);

  for (let r = 1; r < values.length; r++) {
    if (plantosSafeStr_(values[r][uidCol]).trim() !== needle) continue;
    Object.keys(writable).forEach(k => {
      if (!(k in patch)) return;
      const val = patch[k];
      if (val === null || val === undefined) return;
      let c;
      if (k === 'waterEveryDays') {
        c = waterEveryDaysCol_;
      } else {
        c = plantosCol_(hmap, writable[k]);
      }
      if (c >= 0) {
        const cell = sh.getRange(r + 1, c + 1);
        cell.clearDataValidations(); // remove dropdown lock so app values always save
        cell.setValue(val);
      }
    });
    return { ok: true };
  }
  throw new Error('Plant not found: uid=' + needle);
}

/* ===================== FIX #8: plantosCreatePlant ===================== */
function plantosCreatePlant(payload) {
  payload = payload || {};
  const hasNickname = plantosSafeStr_(payload.nickname).trim().length > 0;
  const hasTaxon    = plantosSafeStr_(payload.taxonRaw || payload.taxon || '').trim().length > 0;
  const hasGenus    = plantosSafeStr_(payload.genus || '').trim().length > 0;
  if (!hasNickname && !hasTaxon && !hasGenus) throw new Error('Cannot create plant: at least a Nickname, Taxon Raw, or Genus must be provided.');
  const { sh, headers, hmap } = plantosReadInventory_();
  const uidCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.UID);
  if (uidCol < 0) throw new Error('Missing Plant UID');
  const uid = plantosGenerateNextUid_();
  const row = new Array(headers.length).fill('');
  row[uidCol] = uid;
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const setIf = (colName, val) => { const c = plantosCol_(hmap, colName); if (c >= 0) row[c] = val; };
  // FIX #14: also try alt header names
  const setIfMulti = (val, ...colNames) => { for (let i = 0; i < colNames.length; i++) { const c = plantosCol_(hmap, colNames[i]); if (c >= 0) { row[c] = val; return; } } };
  setIf(H.GENUS,            payload.genus || '');
  setIf(H.TAXON,            payload.taxonRaw || payload.taxon || '');
  setIf(H.LOCATION,         payload.location || '');
  setIf(H.NICKNAME,         payload.nickname || '');
  setIf(H.MEDIUM,           payload.substrate || payload.medium || '');
  setIf(H.GROWING_METHOD,   payload.growingMethod || '');
  setIf(H.SEMIHYDRO_FERT_MODE, payload.semiHydroFertMode || '');
  setIf(H.FLUSH_EVERY_N,    payload.flushEveryN != null ? String(payload.flushEveryN) : '');
  setIf(H.BIRTHDAY,         payload.birthday || '');
  setIf(H.POT_SIZE,         payload.potSize || '');
  setIf(H.POT_MATERIAL,     payload.potMaterial || '');    // FIX #12
  setIf(H.POT_SHAPE,        payload.potShape || '');       // FIX #12
  setIfMulti(payload.waterEveryDays || payload.everyDays || '', H.WATER_EVERY_DAYS, H.WATER_EVERY_DAYS_ALT); // FIX #14
  setIf(H.FERT_EVERY_DAYS,  payload.fertEveryDays || payload.fertilizeEveryDays || '');
  sh.appendRow(row);
  return { ok: true, uid };
}

function plantosGenerateNextUid_() {
  const { values, hmap } = plantosReadInventory_();
  const uidCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.UID);
  const nickCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.NICKNAME);
  const taxonCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.TAXON);
  let max = 0;
  for (let r = 1; r < values.length; r++) {
    const nick  = nickCol  >= 0 ? plantosSafeStr_(values[r][nickCol]).trim()  : '';
    const taxon = taxonCol >= 0 ? plantosSafeStr_(values[r][taxonCol]).trim() : '';
    if (!nick && !taxon) continue;
    const n = Number(plantosSafeStr_(values[r][uidCol]).trim());
    if (!isNaN(n) && n > 0) max = Math.max(max, n);
  }
  return max > 0 ? String(max + 1) : String(Date.now());
}

/* ===================== FIX #10: plantosQuickLog ===================== */
function plantosQuickLog(uid, payload) {
  const needle = plantosSafeStr_(uid).trim();
  payload = payload || {};
  if (!needle) throw new Error('Missing uid');
  const { sh, values, hmap } = plantosReadInventory_();
  const uidCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.UID);
  if (uidCol < 0) throw new Error('Missing Plant UID');
  const wateredCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.WATERED);
  const lastWateredCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.LAST_WATERED);
  const fertilizedCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.FERTILIZED);
  const lastFertCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.LAST_FERTILIZED);
  if (payload.water === true && lastWateredCol < 0) Logger.log('[PlantOS] WARNING: "Last Watered" column not found.');
  if (payload.fertilize === true && lastFertCol < 0) { Logger.log('[PlantOS] WARNING: "Last Fertilized" column not found.'); Logger.log('[PlantOS] Headers: ' + Object.keys(hmap).join(', ')); }
  const now = plantosNow_();
  for (let r = 1; r < values.length; r++) {
    if (plantosSafeStr_(values[r][uidCol]).trim() !== needle) continue;
    if (payload.water === true) {
      if (wateredCol >= 0) sh.getRange(r + 1, wateredCol + 1).setValue(true);
      if (lastWateredCol >= 0) sh.getRange(r + 1, lastWateredCol + 1).setValue(now);
    }
    if (payload.fertilize === true) {
      if (fertilizedCol >= 0) sh.getRange(r + 1, fertilizedCol + 1).setValue(true);
      if (lastFertCol >= 0) sh.getRange(r + 1, lastFertCol + 1).setValue(now);
    }
    if (payload.progressUpdate === true) {
      let lastProgressCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.LAST_PROGRESS_UPDATE);
      if (lastProgressCol < 0) {
        const newColIdx = sh.getLastColumn();
        sh.getRange(1, newColIdx + 1).setValue(PLANTOS_BACKEND_CFG.HEADERS.LAST_PROGRESS_UPDATE);
        SpreadsheetApp.flush();
        lastProgressCol = newColIdx;
      }
      sh.getRange(r + 1, lastProgressCol + 1).setValue(now);
      if (payload.progressStatus) {
        const progStatusCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.PROGRESS_STATUS);
        if (progStatusCol >= 0) sh.getRange(r + 1, progStatusCol + 1).setValue(payload.progressStatus);
      }
    }
    plantosTimelineAppend_(needle, payload, now);
    return { ok: true };
  }
  throw new Error('Plant not found');
}

function plantosBatchWater(uids, actionLabel) {
  uids = uids || [];
  if (!Array.isArray(uids) || !uids.length) return { ok: true, count: 0 };
  const { sh, values, hmap } = plantosReadInventory_();
  const uidCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.UID);
  const wateredCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.WATERED);
  const lastWateredCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.LAST_WATERED);
  if (uidCol < 0) throw new Error('Missing Plant UID');
  const set = {};
  uids.forEach(u => { const k = plantosSafeStr_(u).trim(); if (k) set[k] = true; });
  const now = plantosNow_();
  let count = 0;
  const label = plantosSafeStr_(actionLabel).trim();
  for (let r = 1; r < values.length; r++) {
    const uid = plantosSafeStr_(values[r][uidCol]).trim();
    if (!uid || !set[uid]) continue;
    if (wateredCol >= 0) sh.getRange(r + 1, wateredCol + 1).setValue(true);
    if (lastWateredCol >= 0) sh.getRange(r + 1, lastWateredCol + 1).setValue(now);
    plantosTimelineAppend_(uid, label ? { water: true, notes: label } : { water: true }, now);
    count++;
  }
  return { ok: true, count };
}

function plantosBatchFertilize(uids, actionLabel) {
  uids = uids || [];
  if (!Array.isArray(uids) || !uids.length) return { ok: true, count: 0 };
  const { sh, values, hmap } = plantosReadInventory_();
  const uidCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.UID);
  const fertilizedCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.FERTILIZED);
  const lastFertilizedCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.LAST_FERTILIZED);
  const wateredCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.WATERED);
  const lastWateredCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.LAST_WATERED);
  if (uidCol < 0) throw new Error('Missing Plant UID');
  const set = {};
  uids.forEach(u => { const k = plantosSafeStr_(u).trim(); if (k) set[k] = true; });
  const now = plantosNow_();
  let count = 0;
  const label = plantosSafeStr_(actionLabel).trim();
  for (let r = 1; r < values.length; r++) {
    const uid = plantosSafeStr_(values[r][uidCol]).trim();
    if (!uid || !set[uid]) continue;
    if (fertilizedCol >= 0) sh.getRange(r + 1, fertilizedCol + 1).setValue(true);
    if (lastFertilizedCol >= 0) sh.getRange(r + 1, lastFertilizedCol + 1).setValue(now);
    if (wateredCol >= 0) sh.getRange(r + 1, wateredCol + 1).setValue(true);
    if (lastWateredCol >= 0) sh.getRange(r + 1, lastWateredCol + 1).setValue(now);
    plantosTimelineAppend_(uid, label ? { water: true, fertilize: true, notes: label } : { water: true, fertilize: true }, now);
    count++;
  }
  return { ok: true, count };
}

/* ===================== SEARCH ===================== */

function plantosSearch(query, limit) {
  const q = plantosNorm_(plantosSafeStr_(query)).trim();
  const max = Number(limit) > 0 ? Number(limit) : 25;
  if (!q) return [];
  const { values, hmap } = plantosReadInventory_();
  const uidCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.UID);
  if (uidCol < 0) throw new Error('[PlantOS] UID column not found. Looking for: "' + PLANTOS_BACKEND_CFG.HEADERS.UID + '". Sheet headers: ' + JSON.stringify(Object.keys(hmap)));
  const results = [];
  for (let r = 1; r < values.length; r++) {
    const plant = plantosRowToPlant_(hmap, values[r]);
    if (!plant.uid) continue;
    const hay = plantosNorm_([plant.uid, plant.nickname, plant.primary, plant.classification, plant.location, plant.genus, plant.taxon, plant.gs].join(' '));
    if (hay.includes(q)) { results.push(plant); if (results.length >= max) break; }
  }
  return results;
}

function plantosGetRecentLog(limit) {
  limit = Number(limit || 25);
  const props = PropertiesService.getScriptProperties().getProperties();
  const all = [];
  Object.keys(props).forEach(k => { if (!k.startsWith('PLANT_TIMELINE::')) return; try { JSON.parse(props[k] || '[]').forEach(it => all.push(it)); } catch (e) {} });
  all.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  return all.slice(0, limit);
}

function plantosGetTimeline(uid, limit) {
  limit = Number(limit || 30);
  const key = 'PLANT_TIMELINE::' + plantosSafeStr_(uid).trim();
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || '[]').slice(0, limit); } catch (e) { return []; }
}

/* ===================== PHOTO BACKEND ===================== */

function plantosUploadPlantPhoto(uid, dataUrl, originalName) {
  uid = String(uid || '').trim();
  if (!uid) return { ok: false, reason: 'Missing uid' };
  const parsed = plantosParseDataUrl_(dataUrl);
  if (!parsed || !parsed.bytes) return { ok: false, reason: 'Bad image data' };
  const plantsRoot = plantosGetPlantsRoot_();
  const plantFolder = plantosResolveOrCreatePlantFolder_(plantsRoot, uid);
  try { const cn = plantosCanonicalFolderName_(uid); if (plantFolder.getName() !== cn) plantFolder.setName(cn); } catch (e) {}
  const photosFolder = plantosEnsureSubfolder_(plantFolder, PLANTOS_BACKEND_CFG.PHOTOS_SUBFOLDER);
  const safeName = (originalName && String(originalName).trim()) ? String(originalName).trim() : 'photo.jpg';
  const ext = safeName.toLowerCase().endsWith('.png') || parsed.mime === 'image/png' ? 'png' : 'jpg';
  const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm-ss');
  const filename = `${ts}_UID${uid}.${ext}`;
  const blob = Utilities.newBlob(parsed.bytes, parsed.mime || (ext === 'png' ? 'image/png' : 'image/jpeg'), filename);
  const file = photosFolder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  const fileId = file.getId();
  const viewUrl = file.getUrl();
  const thumbUrl = plantosDriveThumbUrl_(fileId, 300);
  const photo = { fileId, viewUrl, thumbUrl, name: filename, updated: new Date().toISOString() };
  plantosWriteLatestPhotoToSheet_(uid, photo);
  return { ok: true, photo };
}

function plantosGetLatestPhoto(uid) {
  uid = String(uid || '').trim();
  if (!uid) return { ok: false, reason: 'Missing uid' };
  const fromSheet = plantosReadLatestPhotoFromSheet_(uid);
  if (fromSheet) return { ok: true, photo: fromSheet };
  const plantsRoot = plantosGetPlantsRoot_();
  const photosFolder = plantosEnsureSubfolder_(plantosResolveOrCreatePlantFolder_(plantsRoot, uid), PLANTOS_BACKEND_CFG.PHOTOS_SUBFOLDER);
  const files = photosFolder.getFiles();
  let newest = null;
  while (files.hasNext()) {
    const f = files.next();
    const mt = f.getMimeType ? f.getMimeType() : '';
    if (mt && !mt.startsWith('image/')) continue;
    const t = f.getLastUpdated ? f.getLastUpdated() : new Date(0);
    if (!newest || t > newest.t) newest = { f, t };
  }
  if (!newest) return { ok: true, photo: null };
  const fileId = newest.f.getId();
  return { ok: true, photo: { fileId, viewUrl: newest.f.getUrl(), thumbUrl: plantosDriveThumbUrl_(fileId, 300), name: newest.f.getName(), updated: newest.t.toISOString() } };
}

function plantosParseDataUrl_(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], bytes: Utilities.base64Decode(m[2]) };
}

function plantosDriveThumbUrl_(fileId, sizePx) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${sizePx || 300}`;
}

function plantosWriteLatestPhotoToSheet_(uid, photo) {
  try {
    const { sh, hmap } = plantosReadInventory_();
    const H = PLANTOS_BACKEND_CFG.HEADERS;
    const uidCol = plantosCol_(hmap, H.UID);
    const idCol = plantosCol_(hmap, H.LATEST_PHOTO_ID);
    if (uidCol < 0 || idCol < 0) return;
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return;
    const uids = sh.getRange(2, uidCol + 1, lastRow - 1, 1).getValues().map(r => String(r[0] || '').trim());
    const idx = uids.findIndex(x => x === uid);
    if (idx < 0) return;
    const rowNum = 2 + idx;
    sh.getRange(rowNum, idCol + 1).setValue(photo.fileId || '');
    const thCol = plantosCol_(hmap, H.LATEST_PHOTO_THUMB), vwCol = plantosCol_(hmap, H.LATEST_PHOTO_VIEW), upCol = plantosCol_(hmap, H.LATEST_PHOTO_UPDATED);
    if (thCol >= 0) sh.getRange(rowNum, thCol + 1).setValue(photo.thumbUrl || '');
    if (vwCol >= 0) sh.getRange(rowNum, vwCol + 1).setValue(photo.viewUrl || '');
    if (upCol >= 0) sh.getRange(rowNum, upCol + 1).setValue(photo.updated || '');
  } catch (e) {}
}

function plantosReadLatestPhotoFromSheet_(uid) {
  try {
    const { sh, hmap } = plantosReadInventory_();
    const H = PLANTOS_BACKEND_CFG.HEADERS;
    const uidCol = plantosCol_(hmap, H.UID), idCol = plantosCol_(hmap, H.LATEST_PHOTO_ID);
    if (uidCol < 0 || idCol < 0) return null;
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return null;
    const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (String(row[uidCol] || '').trim() !== uid) continue;
      const fileId = String(row[idCol] || '').trim();
      if (!fileId) return null;
      const thCol = plantosCol_(hmap, H.LATEST_PHOTO_THUMB), vwCol = plantosCol_(hmap, H.LATEST_PHOTO_VIEW), upCol = plantosCol_(hmap, H.LATEST_PHOTO_UPDATED);
      const thumbUrl = thCol >= 0 ? String(row[thCol] || '').trim() : plantosDriveThumbUrl_(fileId, 300);
      let viewUrl = vwCol >= 0 ? String(row[vwCol] || '').trim() : '';
      if (!viewUrl) try { viewUrl = DriveApp.getFileById(fileId).getUrl(); } catch (e) {}
      return { fileId, thumbUrl, viewUrl, updated: upCol >= 0 ? String(row[upCol] || '').trim() : '' };
    }
    return null;
  } catch (e) { return null; }
}

/* ===================== FIX #12/#13: plantosRowToPlant_ ===================== */

function plantosGetByHeader_(hmap, row, headerName) {
  const c = plantosCol_(hmap, headerName);
  if (c < 0) return '';
  const v = row[c];
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v;
  return String(v);
}

function plantosGetByHeaderDate_(hmap, row, headerName) {
  const c = plantosCol_(hmap, headerName);
  if (c < 0) return '';
  const d = plantosAsDate_(row[c]);
  return d ? d : '';
}

// FIX #14: Try multiple header names, return first match
function plantosGetByHeaderMulti_(hmap, row, ...headerNames) {
  for (let i = 0; i < headerNames.length; i++) {
    const c = plantosCol_(hmap, headerNames[i]);
    if (c >= 0) {
      const v = row[c];
      if (v === null || v === undefined) return '';
      if (v instanceof Date) return v;
      return String(v);
    }
  }
  return '';
}

function plantosRowToPlant_(hmap, row) {
  const H = PLANTOS_BACKEND_CFG.HEADERS;

  const uid          = plantosGetByHeader_(hmap, row, H.UID);
  const nickname     = plantosGetByHeader_(hmap, row, H.NICKNAME);
  const genus        = plantosGetByHeader_(hmap, row, H.GENUS);
  const taxon        = plantosGetByHeader_(hmap, row, H.TAXON);
  const location     = plantosGetByHeader_(hmap, row, H.LOCATION);
  const folderId     = plantosGetByHeader_(hmap, row, H.FOLDER_ID);
  const folderUrl    = plantosGetByHeader_(hmap, row, H.FOLDER_URL);
  const careDocUrl   = plantosGetByHeader_(hmap, row, H.CARE_DOC_URL);
  const plantPageUrl = plantosGetByHeader_(hmap, row, H.PLANT_PAGE_URL);
  const lastWatered  = plantosGetByHeaderDate_(hmap, row, H.LAST_WATERED);
  const lastFert     = plantosGetByHeaderDate_(hmap, row, H.LAST_FERTILIZED);
  const everyDays    = plantosGetByHeaderMulti_(hmap, row, H.WATER_EVERY_DAYS, H.WATER_EVERY_DAYS_ALT); // FIX #14
  const fertEvery    = plantosGetByHeader_(hmap, row, H.FERT_EVERY_DAYS);
  const potSize      = plantosGetByHeader_(hmap, row, H.POT_SIZE);
  const potMaterial  = plantosGetByHeader_(hmap, row, H.POT_MATERIAL);   // FIX #12
  const potShape     = plantosGetByHeader_(hmap, row, H.POT_SHAPE);      // FIX #12
  const medium       = plantosGetByHeader_(hmap, row, H.MEDIUM);
  const birthday     = plantosGetByHeaderDate_(hmap, row, H.BIRTHDAY);
  const cultivar     = plantosGetByHeader_(hmap, row, H.CULTIVAR);       // FIX #15
  const hybridNote   = plantosGetByHeader_(hmap, row, H.HYBRID_NOTE);    // FIX #15
  const infraRank    = plantosGetByHeader_(hmap, row, H.INFRA_RANK);     // FIX #15
  const infraEpithet = plantosGetByHeader_(hmap, row, H.INFRA_EPITHET);  // FIX #15
  const purchasePrice = plantosGetByHeader_(hmap, row, H.PURCHASE_PRICE);

  const genusStr = String(genus || '').trim();
  const taxonStr = String(taxon || '').trim();
  const gs       = [genusStr, taxonStr].filter(Boolean).join(' ').trim();
  // If genus column is blank but taxon starts with a capitalised word (e.g. "Anthurium magnificum"),
  // extract it so search on genus name still works.
  const inferredGenus = genusStr || (taxonStr && /^[A-Z]/.test(taxonStr) ? taxonStr.split(/\s+/)[0] : '');
  const primary  = String(nickname || '').trim() || gs || String(uid || '');

  let due = '';
  const lw = lastWatered ? plantosAsDate_(lastWatered) : null;
  const ev = Number(everyDays);
  if (lw && !isNaN(ev) && ev > 0) due = plantosFmtDate_(plantosAddDays_(lw, ev));

  // FIX #13: return BOTH field name variants so App.html normalizations always hit
  return {
    uid,
    nickname:    nickname  || '',
    primary,

    genus:          inferredGenus,  // FIX: inferred from taxon first word if genus col blank
    species:        taxonStr,
    taxon:          taxonStr,
    gs,
    classification: gs,

    location:    location  || '',
    folderId:    folderId  || '',
    folderUrl:   folderUrl || '',
    careDocUrl:  careDocUrl || '',
    plantPageUrl: plantPageUrl || '',

    lastWatered:  lastWatered ? plantosFmtDate_(plantosAsDate_(lastWatered)) : '',
    due,
    // FIX #13: both field names for water interval
    waterEveryDays: everyDays || '',
    everyDays:      everyDays || '',

    lastFertilized: lastFert ? plantosFmtDate_(plantosAsDate_(lastFert)) : '',
    // FIX #13: both field names for fert interval
    fertEveryDays:        fertEvery || '',
    fertilizeEveryDays:   fertEvery || '',

    potSize:      potSize     || '',
    potMaterial:  potMaterial || '',   // FIX #12
    potShape:     potShape    || '',   // FIX #12
    substrate:    medium      || '',
    medium:       medium      || '',
    growingMethod: plantosSafeStr_(plantosGetByHeader_(hmap, row, H.GROWING_METHOD)).trim() || 'substrate',
    semiHydroFertMode: plantosSafeStr_(plantosGetByHeader_(hmap, row, H.SEMIHYDRO_FERT_MODE)).trim() || 'always',
    flushEveryN: parseInt(plantosSafeStr_(plantosGetByHeader_(hmap, row, H.FLUSH_EVERY_N)).trim() || '6', 10) || 6,
    medium:       medium      || '',

    birthday:  birthday ? plantosFmtDate_(plantosAsDate_(birthday)) : '',
    humanPlantId: plantosGetByHeader_(hmap, row, H.PLANT_ID) || '',

    cultivar:      cultivar     || '',   // FIX #15
    hybridNote:    hybridNote   || '',   // FIX #15
    infraRank:     infraRank    || '',   // FIX #15
    infraEpithet:  infraEpithet || '',   // FIX #15
    purchasePrice: purchasePrice || '',
  };
}

/* ===================== TIMELINE STORAGE ===================== */

function plantosTimelineAppend_(uid, payload, when) {
  const key = 'PLANT_TIMELINE::' + uid;
  let items = [];
  try { items = JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || '[]'); } catch (e) {}
  const ts = Utilities.formatDate(when, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const action = payload.progressUpdate ? 'PROGRESS_UPDATE' : payload.repot ? 'REPOT' : payload.water && payload.fertilize ? 'WATERED+FERTILIZED' : payload.water ? 'WATERED' : payload.fertilize ? 'FERTILIZED' : 'UPDATE';
  let details = '';
  if (payload.repot) details = `Pot: ${payload.potSize || ''} • Substrate: ${payload.substrate || ''}`;
  if (payload.notes) details = (details ? details + ' • ' : '') + payload.notes;
  items.unshift({ uid, ts, action, details });
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(items.slice(0, 120)));
}

/* ===================== WEB APP ROUTING ===================== */

function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    let baseUrl = plantosGetSetting_(PLANTOS_BACKEND_CFG.SETTINGS_KEYS.ACTIVE_WEBAPP_URL);
    if (!baseUrl) try { baseUrl = ScriptApp.getService().getUrl() || ''; } catch (err) { baseUrl = ''; }
    let mode = String(params.mode || '').trim();
    let uid  = String(params.uid  || '').trim();
    const loc = String(params.loc || '').trim();
    const openAdd = String(params.openAdd || '').trim();
    if (!uid) { const m = mode.match(/^uid(\d+)$/i); if (m && m[1]) { uid = m[1]; mode = 'plant'; } }
    if (!mode && uid) mode = 'plant';
    if (!mode) mode = 'home';
    const ml = mode.toLowerCase();
    if (ml === 'locations' || ml === 'plants') mode = 'my-plants';
    const t = HtmlService.createTemplateFromFile('client/App');
    t.baseUrl = baseUrl; t.mode = mode; t.uid = uid; t.loc = loc; t.openAdd = openAdd;
    return t.evaluate().setTitle('PlantOS').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    Logger.log('[PlantOS] doGet crashed: ' + (err && err.message ? err.message : String(err)));
    const html = '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>PlantOS — Error</title></head>'
      + '<body style="font-family:monospace;background:#0E1A10;color:#C8E8A8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center">'
      + '<div><div style="font-size:48px;margin-bottom:16px">🌿</div>'
      + '<div style="font-size:18px;font-weight:bold;margin-bottom:12px">PlantOS could not load</div>'
      + '<div style="font-size:13px;color:#8A9A78;max-width:400px;line-height:1.5">'
      + 'Something went wrong during startup. Try reloading the page. '
      + 'If the problem persists, check that the spreadsheet and deployment are configured correctly.</div>'
      + '<div style="margin-top:16px;font-size:11px;color:#5A6A50;border:1px solid #2A3A20;padding:8px 12px;display:inline-block">'
      + (err && err.message ? err.message : 'Unknown error').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      + '</div></div></body></html>';
    return HtmlService.createHtmlOutput(html).setTitle('PlantOS — Error').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

function doPost(e) {
  try {
    var body = {};
    try { body = JSON.parse(e.postData.contents); } catch(parseErr) { body = {}; }
    var fn   = body.fn   || '';
    var args = Array.isArray(body.args) ? body.args : [];
    var token = body.token || '';

    // Special case: token validation — skip auth check
    if (fn === 'plantosValidateToken') {
      var stored = PropertiesService.getScriptProperties().getProperty('PLANTOS_API_PASSWORD') || '';
      var valid = args[0] === stored;
      var valResult = valid ? { ok: true } : { ok: false, error: 'Invalid password' };
      return ContentService.createTextOutput(JSON.stringify(valResult)).setMimeType(ContentService.MimeType.JSON);
    }

    // Validate token for all other functions
    var storedToken = PropertiesService.getScriptProperties().getProperty('PLANTOS_API_PASSWORD') || '';
    if (token !== storedToken) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
    }

    // Dispatch map
    var dispatch = {
      plantosHome: plantosHome,
      plantosGetAllPlantsLite: plantosGetAllPlantsLite,
      plantosGetPlant: plantosGetPlant,
      plantosCreatePlant: plantosCreatePlant,
      plantosUpdatePlant: plantosUpdatePlant,
      plantosQuickLog: plantosQuickLog,
      plantosBatchWater: plantosBatchWater,
      plantosBatchFertilize: plantosBatchFertilize,
      plantosGetRecentLog: plantosGetRecentLog,
      plantosGetTimeline: plantosGetTimeline,
      plantosSearch: plantosSearch,
      plantosGetAllPhotos: plantosGetAllPhotos,
      plantosGetLatestPhoto: plantosGetLatestPhoto,
      plantosUploadPlantPhoto: plantosUploadPlantPhoto,
      plantosCreateLocation: plantosCreateLocation,
      plantosListLocations: plantosListLocations,
      plantosGetPlantsByLocationLite: plantosGetPlantsByLocationLite,
      plantosBatchAddPlants: plantosBatchAddPlants,
      plantosGetOffspring: plantosGetOffspring,
      plantosSetNickname: plantosSetNickname,
      plantosArchivePlant: plantosArchivePlant,
      plantosUpdateArchiveNote: plantosUpdateArchiveNote,
      plantosGetArchive: plantosGetArchive,
      plantosGetEnvironments: plantosGetEnvironments,
      plantosSaveEnvironment: plantosSaveEnvironment,
      plantosDeleteEnvironment: plantosDeleteEnvironment,
      plantosGetLocationEnvMap: plantosGetLocationEnvMap,
      plantosSetLocationEnv: plantosSetLocationEnv,
      plantosGetLocationConditions: plantosGetLocationConditions,
      plantosSetLocationCondition: plantosSetLocationCondition,
      plantosGetProps: plantosGetProps,
      plantosGetPropTimeline: plantosGetPropTimeline,
      plantosCreateProp: plantosCreateProp,
      plantosUpdatePropStatus: plantosUpdatePropStatus,
      plantosUpdateProp: plantosUpdateProp,
      plantosAddPropNote: plantosAddPropNote,
      plantosGraduateProp: plantosGraduateProp,
      plantosDebug: plantosDebug,
      plantosDebugLocations: plantosDebugLocations,
      kbGetPlantFacts: kbGetPlantFacts,
      kbDump: kbDump,
      callClaude: callClaude,
      plantosCarlTrain: plantosCarlTrain,
      plantosCarlGetMisses: plantosCarlGetMisses,
      carlMigrateToKB: carlMigrateToKB,
      carlGetConversationPatterns: carlGetConversationPatterns
    };

    if (!dispatch[fn]) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Unknown function' })).setMimeType(ContentService.MimeType.JSON);
    }
    var result = dispatch[fn].apply(null, args);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err && err.message ? err.message : String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

/* ===================== LOCATIONS ===================== */

function plantosCreateLocation(name) {
  const n = plantosSafeStr_(name).trim();
  if (!n) return { ok: false, error: 'Name required' };
  const key = 'PLANTOS_CUSTOM_LOCATIONS';
  let list = [];
  try { list = JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || '[]'); } catch(e) {}
  if (!list.includes(n)) { list.push(n); list.sort((a, b) => a.localeCompare(b)); PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(list)); }
  return { ok: true };
}

/* ===================== ENVIRONMENTS ===================== */

const PLANTOS_ENVS_KEY = 'PLANTOS_ENVIRONMENTS';
const PLANTOS_LOC_ENV_MAP_KEY = 'PLANTOS_LOC_ENV_MAP';
const PLANTOS_LOC_CONDITIONS_KEY = 'PLANTOS_LOC_CONDITIONS';

function plantosGetEnvironments() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(PLANTOS_ENVS_KEY) || '[]'); } catch(e) { return []; } }

function plantosSaveEnvironment(env) {
  env = env || {};
  const list = plantosGetEnvironments();
  if (env.envId) {
    const idx = list.findIndex(e => e.envId === env.envId);
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], env); else list.push(env);
  } else {
    const maxN = list.reduce((m, e) => { const n = Number(String(e.envId || '').replace('ENV', '')); return isNaN(n) ? m : Math.max(m, n); }, 0);
    env.envId = 'ENV' + String(maxN + 1).padStart(3, '0');
    list.push(env);
  }
  PropertiesService.getScriptProperties().setProperty(PLANTOS_ENVS_KEY, JSON.stringify(list));
  return { ok: true, envId: env.envId };
}

function plantosDeleteEnvironment(envId) {
  const id = plantosSafeStr_(envId).trim();
  if (!id) return { ok: false, error: 'envId required' };
  let list = plantosGetEnvironments().filter(e => e.envId !== id);
  PropertiesService.getScriptProperties().setProperty(PLANTOS_ENVS_KEY, JSON.stringify(list));
  const locMap = plantosGetLocationEnvMap();
  Object.keys(locMap).forEach(loc => { if (locMap[loc] === id) delete locMap[loc]; });
  PropertiesService.getScriptProperties().setProperty(PLANTOS_LOC_ENV_MAP_KEY, JSON.stringify(locMap));
  return { ok: true };
}

function plantosGetLocationEnvMap() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(PLANTOS_LOC_ENV_MAP_KEY) || '{}'); } catch(e) { return {}; } }

function plantosSetLocationEnv(locationName, envId) {
  const loc = plantosSafeStr_(locationName).trim();
  if (!loc) return { ok: false, error: 'locationName required' };
  const map = plantosGetLocationEnvMap();
  if (envId) map[loc] = plantosSafeStr_(envId).trim(); else delete map[loc];
  PropertiesService.getScriptProperties().setProperty(PLANTOS_LOC_ENV_MAP_KEY, JSON.stringify(map));
  return { ok: true };
}

/* ===================== FIX #4: Location conditions ===================== */
function plantosGetLocationConditions() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(PLANTOS_LOC_CONDITIONS_KEY) || '{}'); } catch(e) { return {}; } }

function plantosSetLocationCondition(locationName, vals) {
  const loc = plantosSafeStr_(locationName).trim();
  if (!loc) return { ok: false, error: 'locationName required' };
  const conditions = plantosGetLocationConditions();
  conditions[loc] = Object.assign(conditions[loc] || {}, vals || {});
  PropertiesService.getScriptProperties().setProperty(PLANTOS_LOC_CONDITIONS_KEY, JSON.stringify(conditions));
  return { ok: true };
}

/* ===================== ARCHIVE ===================== */

const PLANTOS_ARCHIVE_KEY = 'PLANTOS_ARCHIVE';

function plantosGetArchive() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(PLANTOS_ARCHIVE_KEY) || '[]'); } catch(e) { return []; } }

function plantosArchivePlant(uid, type, cause, causeDetail, extraFields) {
  const needle = plantosSafeStr_(uid).trim();
  if (!needle) throw new Error('Missing uid');
  extraFields = extraFields || {};
  const { sh, values, hmap } = plantosReadInventory_();
  const uidCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.UID);
  let plant = null, rowIdx = -1;
  for (let r = 1; r < values.length; r++) {
    if (plantosSafeStr_(values[r][uidCol]).trim() === needle) { plant = plantosRowToPlant_(hmap, values[r]); rowIdx = r; break; }
  }
  if (!plant) throw new Error('Plant not found: ' + needle);
  const archive = plantosGetArchive();
  const entry = { id: 'ARC_' + Date.now(), uid: plant.uid, primary: plant.primary, genus: plant.genus || '', type: plantosSafeStr_(type).trim() || 'deceased', cause: plantosSafeStr_(cause).trim(), causeDetail: plantosSafeStr_(causeDetail).trim(), archivedAt: plantosFmtDate_(plantosNow_()), note: plantosSafeStr_(extraFields.note || '').trim() };
  if (extraFields.deathDate) entry.deathDate = extraFields.deathDate;
  if (extraFields.rehomeDate) entry.rehomeDate = extraFields.rehomeDate;
  archive.unshift(entry);
  PropertiesService.getScriptProperties().setProperty(PLANTOS_ARCHIVE_KEY, JSON.stringify(archive));
  if (rowIdx >= 0) sh.deleteRow(rowIdx + 1);
  return { ok: true };
}

function plantosUpdateArchiveNote(id, note) {
  const archive = plantosGetArchive();
  const idx = archive.findIndex(e => e.id === plantosSafeStr_(id).trim());
  if (idx < 0) return { ok: false, error: 'Not found' };
  archive[idx].note = plantosSafeStr_(note).trim();
  PropertiesService.getScriptProperties().setProperty(PLANTOS_ARCHIVE_KEY, JSON.stringify(archive));
  return { ok: true };
}

/* ===================== BATCH CREATE ===================== */

function plantosBatchAddPlants(plantsOrPayload, sourceType, sourceUID) {
  // Accept either (plantsArray, sourceType, sourceUID) or legacy ({plants, sourceType, sourceUID})
  let plants, sType, sUID;
  if (Array.isArray(plantsOrPayload)) {
    plants   = plantsOrPayload;
    sType    = plantosSafeStr_(sourceType || '').trim();
    sUID     = plantosSafeStr_(sourceUID  || '').trim();
  } else {
    const payload = plantsOrPayload || {};
    plants   = Array.isArray(payload.plants) ? payload.plants : [];
    sType    = plantosSafeStr_(payload.sourceType || sourceType || '').trim();
    sUID     = plantosSafeStr_(payload.sourceUID  || sourceUID  || '').trim();
  }
  if (!plants.length) return { ok: true, uids: [], batchId: '' };
  const batchId = 'BATCH_' + Date.now();
  const uids = [], errors = [];
  plants.forEach((p, i) => {
    try { const r = plantosCreatePlant(Object.assign({}, p, { batchId })); if (r && r.uid) uids.push(r.uid); }
    catch(e) { errors.push('Row ' + i + ': ' + (e && e.message ? e.message : String(e))); }
  });
  return { ok: errors.length === 0, uids, batchId, errors };
}

/* ===================== PROPAGATION ===================== */

const PLANTOS_PROPS_KEY = 'PLANTOS_PROPS';
const PLANTOS_PROP_TIMELINES_KEY = 'PLANTOS_PROP_TIMELINES';

function plantosGetProps() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(PLANTOS_PROPS_KEY) || '[]'); } catch(e) { return []; } }

function plantosGetPropTimeline(propId) {
  const key = PLANTOS_PROP_TIMELINES_KEY + '::' + plantosSafeStr_(propId).trim();
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || '[]'); } catch(e) { return []; }
}

function plantosCreateProp(payload) {
  payload = payload || {};
  const props = plantosGetProps();
  const propId = 'PROP_' + Date.now();
  var propType = plantosSafeStr_(payload.propType || payload.type || '').trim();
  var parentUID = plantosSafeStr_(payload.parentUID || payload.uid || '').trim();
  var startDate = plantosSafeStr_(payload.startDate || '').trim() || plantosFmtDate_(plantosNow_());
  var hybridType = !!(payload.hybridType);
  const prop = {
    propId, parentUID: parentUID, genus: plantosSafeStr_(payload.genus || '').trim(),
    species: plantosSafeStr_(payload.species || '').trim(), propType: propType,
    substrate: plantosSafeStr_(payload.substrate || '').trim(), status: 'Trying',
    createdAt: plantosFmtDate_(plantosNow_()), startDate: startDate,
    siblingPropIds: Array.isArray(payload.siblingPropIds) ? payload.siblingPropIds : [],
    parentPropId: plantosSafeStr_(payload.parentPropId || '').trim(),
    hybridType: hybridType,
    motherUID: plantosSafeStr_(payload.motherUID || payload.motherUid || '').trim(),
    fatherUID: plantosSafeStr_(payload.fatherUID || payload.fatherUid || '').trim(),
    motherGenus: plantosSafeStr_(payload.motherGenus || '').trim(),
    motherSpecies: plantosSafeStr_(payload.motherSpecies || '').trim(),
    fatherGenus: plantosSafeStr_(payload.fatherGenus || '').trim(),
    fatherSpecies: plantosSafeStr_(payload.fatherSpecies || '').trim(),
    pollinationMethod: plantosSafeStr_(payload.pollinationMethod || '').trim(),
    crossDate: plantosSafeStr_(payload.crossDate || '').trim(),
    isIntrageneric: !!(payload.isIntrageneric),
    nothogenus: plantosSafeStr_(payload.nothogenus || '').trim(),
    nothospeciesEpithet: plantosSafeStr_(payload.nothospeciesEpithet || '').trim(),
    generation: plantosSafeStr_(payload.generation || '').trim(),
    generationConfirmed: !!(payload.generationConfirmed),
    notes: plantosSafeStr_(payload.notes || '').trim(),
  };
  props.unshift(prop);
  PropertiesService.getScriptProperties().setProperty(PLANTOS_PROPS_KEY, JSON.stringify(props));
  plantosPropTimelineAppend_(propId, { action: 'CREATED', details: `${propType || 'Prop'} started` });
  return { ok: true, propId };
}

function plantosUpdatePropStatus(propId, status, failCause, failCauseDetail) {
  const id = plantosSafeStr_(propId).trim();
  const props = plantosGetProps();
  const idx = props.findIndex(p => p.propId === id);
  if (idx < 0) return { ok: false, error: 'Prop not found' };
  props[idx].status = plantosSafeStr_(status).trim();
  if (failCause) props[idx].failCause = plantosSafeStr_(failCause).trim();
  if (failCauseDetail) props[idx].failCauseDetail = plantosSafeStr_(failCauseDetail).trim();
  PropertiesService.getScriptProperties().setProperty(PLANTOS_PROPS_KEY, JSON.stringify(props));
  var details = failCause ? `${status} — ${failCause}` : status;
  if (failCauseDetail) details += ': ' + failCauseDetail;
  plantosPropTimelineAppend_(id, { action: 'STATUS', details: details });
  return { ok: true };
}

function plantosAddPropNote(propId, note, photoUrl) {
  const id = plantosSafeStr_(propId).trim();
  const props = plantosGetProps();
  const idx = props.findIndex(p => p.propId === id);
  if (idx < 0) return { ok: false, error: 'Prop not found' };
  plantosPropTimelineAppend_(id, { action: photoUrl ? 'PHOTO' : 'NOTE', details: plantosSafeStr_(note || '').trim(), photoUrl: photoUrl || '' });
  return { ok: true };
}

function plantosGraduateProp(propId, plantPayload) {
  const id = plantosSafeStr_(propId).trim();
  const props = plantosGetProps();
  const idx = props.findIndex(p => p.propId === id);
  if (idx < 0) throw new Error('Prop not found');
  const prop = props[idx];
  const result = plantosCreatePlant(Object.assign({ genus: prop.genus, taxon: prop.species, parentPropId: id }, plantPayload || {}));
  if (!result.ok) throw new Error('Failed to create plant from prop');
  props[idx].status = 'Graduated';
  props[idx].graduatedUID = result.uid;
  PropertiesService.getScriptProperties().setProperty(PLANTOS_PROPS_KEY, JSON.stringify(props));
  plantosPropTimelineAppend_(id, { action: 'STATUS', details: 'Graduated → UID ' + result.uid });
  return { ok: true, uid: result.uid };
}

/* ===================== FIX #15: plantosUpdateProp — was missing entirely ===================== */
function plantosUpdateProp(propId, patch) {
  const id = plantosSafeStr_(propId).trim();
  if (!id) throw new Error('Missing propId');
  patch = patch || {};
  const props = plantosGetProps();
  const idx = props.findIndex(p => p.propId === id);
  if (idx < 0) return { ok: false, error: 'Prop not found' };

  // Allowed writable fields for a prop
  const allowed = ['genus','species','type','substrate','startDate','notes','parentUID','siblingPropIds',
                   'nothospecies','generation','hybridType','motherUid','fatherUid','pollinationMethod',
                   'crossDate','motherGenus','motherSpecies','motherUID','motherFreetext',
                   'fatherGenus','fatherSpecies','fatherUID','fatherFreetext'];
  allowed.forEach(function(k) {
    if (k in patch && patch[k] !== null && patch[k] !== undefined) {
      props[idx][k] = plantosSafeStr_(patch[k]).trim();
    }
  });
  PropertiesService.getScriptProperties().setProperty(PLANTOS_PROPS_KEY, JSON.stringify(props));
  plantosPropTimelineAppend_(id, { action: 'UPDATE', details: 'Edited: ' + Object.keys(patch).filter(k => allowed.includes(k)).join(', ') });
  return { ok: true };
}

function plantosPropTimelineAppend_(propId, entry) {
  const key = PLANTOS_PROP_TIMELINES_KEY + '::' + propId;
  let items = [];
  try { items = JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || '[]'); } catch(e) {}
  const ts = Utilities.formatDate(plantosNow_(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  items.unshift(Object.assign({ ts }, entry));
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(items.slice(0, 100)));
}

/* ===================== AI PROXY ===================== */

function plantosCallAI(systemPrompt, userPrompt, maxTokens) {
  const API_KEY = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!API_KEY) throw new Error('ANTHROPIC_API_KEY not set in Script Properties.');
  const payload = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: Number(maxTokens) || 700,
    system: String(systemPrompt || ''),
    messages: [{ role: 'user', content: String(userPrompt || '') }],
  };
  const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json',
    headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  const body = resp.getContentText();
  if (code !== 200) throw new Error('Anthropic API error ' + code + ': ' + body.slice(0, 200));
  const data = JSON.parse(body);
  return { ok: true, text: (data.content && data.content[0]) ? data.content[0].text : '' };
}


/* =====================================================================
   CARL LEARNING ENGINE
   Sheet: "📚 Carl Learned"
   Columns: ID | Date | Genus | Keywords | Answer | Actions | WatchFor | Confidence | Source | Uses
   ===================================================================== */

const CARL_LEARN_SHEET = '📚 Carl Learned';
const CARL_LEARN_HEADERS = ['ID','Date','Genus','Keywords','Answer','Actions','WatchFor','Confidence','Source','Uses'];

function carlLearnGetSheet_() {
  const ss = plantosGetSS_();
  let sh = ss.getSheetByName(CARL_LEARN_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CARL_LEARN_SHEET);
    sh.setTabColor('#1565C0');
    sh.getRange(1, 1, 1, CARL_LEARN_HEADERS.length).setValues([CARL_LEARN_HEADERS])
      .setBackground('#1A3A1A').setFontColor('#FFFFFF').setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 80);   // ID
    sh.setColumnWidth(2, 100);  // Date
    sh.setColumnWidth(3, 100);  // Genus
    sh.setColumnWidth(4, 200);  // Keywords
    sh.setColumnWidth(5, 400);  // Answer
    sh.setColumnWidth(6, 300);  // Actions
    sh.setColumnWidth(7, 200);  // WatchFor
    sh.setColumnWidth(8, 80);   // Confidence
    sh.setColumnWidth(9, 80);   // Source
    sh.setColumnWidth(10, 60);  // Uses
  }
  return sh;
}

function carlLearnGetAll_() {
  const sh = carlLearnGetSheet_();
  const lr = sh.getLastRow();
  if (lr < 2) return [];
  const rows = sh.getRange(2, 1, lr - 1, CARL_LEARN_HEADERS.length).getValues();
  return rows.map(function(r) {
    return {
      id:         String(r[0] || ''),
      date:       String(r[1] || ''),
      genus:      String(r[2] || '').trim().toLowerCase(),
      keywords:   String(r[3] || '').split(',').map(function(k) { return k.trim().toLowerCase(); }).filter(Boolean),
      answer:     String(r[4] || ''),
      actions:    String(r[5] || '') ? String(r[5] || '').split('||').map(function(a) { return a.trim(); }).filter(Boolean) : [],
      watchFor:   String(r[6] || ''),
      confidence: parseFloat(r[7]) || 0.7,
      source:     String(r[8] || ''),
      uses:       parseInt(r[9]) || 0,
      _row:       0, // set below
    };
  }).map(function(e, i) { e._row = i + 2; return e; });
}

// Search learned KB — returns best matching entry or null
function plantosCarlSearch(genus, query) {
  const q = String(query || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
  if (!q) return null;
  const qWords = q.split(/\s+/).filter(function(w) { return w.length > 2; });
  const gLower = String(genus || '').toLowerCase().trim();

  // 1. Search Plant KB ai_hint entries (primary — new trained data lives here)
  try {
    const ss = plantosGetSS_();
    const plantSh = ss.getSheetByName('🌿 Plant Knowledge Base');
    if (plantSh) {
      const lr = plantSh.getLastRow();
      if (lr >= 2) {
        const rows = plantSh.getRange(2, 1, lr - 1, 11).getValues();
        let best = null, bestScore = 0;
        rows.forEach(function(r) {
          if (String(r[3]||'').trim() !== 'ai_hint') return;
          const subject = String(r[2]||'').trim().toLowerCase();
          if (subject && subject !== 'general' && gLower && subject !== gLower) return;
          const answer = String(r[4]||'').trim();
          const kws = String(r[5]||'').toLowerCase().split(',').map(function(k) { return k.trim(); }).filter(Boolean);
          const conf = String(r[6]||'').trim() === 'high' ? 0.9 : String(r[6]||'').trim() === 'medium' ? 0.7 : 0.5;
          let hits = 0;
          kws.forEach(function(kw) {
            if (q.includes(kw)) hits += 2;
            else qWords.forEach(function(w) { if (kw.includes(w) || w.includes(kw)) hits += 1; });
          });
          const score = hits * conf;
          if (score > bestScore && score >= 1.5) {
            bestScore = score;
            // Find matching observed_behavior row for actions
            const actRow = rows.find(function(ar) {
              return String(ar[3]||'') === 'observed_behavior' && String(ar[2]||'').toLowerCase() === subject && String(ar[5]||'') === String(r[5]||'');
            });
            const actions = actRow ? String(actRow[4]||'').split(' | ').filter(Boolean) : [];
            const watchFor = String(r[10]||'').trim();
            best = { answer, actions, watchFor, confidence: conf, source: 'plant-kb' };
          }
        });
        if (best) return best;
      }
    }
  } catch(e) { Logger.log('[PlantOS] carlSearch KB error: ' + e); }

  // 2. Fallback: legacy Carl Learned sheet
  const entries = carlLearnGetAll_();
  if (!entries.length) return null;
  let best2 = null, bestScore2 = 0;
  entries.forEach(function(e) {
    if (e.genus && e.genus !== '*' && e.genus !== gLower) return;
    let hits = 0;
    e.keywords.forEach(function(kw) {
      if (q.includes(kw)) hits += 2;
      else qWords.forEach(function(w) { if (kw.includes(w) || w.includes(kw)) hits += 1; });
    });
    const score = hits * e.confidence;
    if (score > bestScore2 && score >= 1.5) { bestScore2 = score; best2 = e; }
  });
  if (best2) {
    try {
      const sh = carlLearnGetSheet_();
      const uses = parseInt(sh.getRange(best2._row, 10).getValue()) || 0;
      sh.getRange(best2._row, 10).setValue(uses + 1);
    } catch(e) {}
    return { answer: best2.answer, actions: best2.actions, watchFor: best2.watchFor, confidence: best2.confidence, source: best2.source };
  }
  return null;
}

// Save a learned entry — called automatically after AI responses
function plantosCarlLearn(genus, query, answer, actions, watchFor, source) {
  const g = String(genus || '*').trim();
  const q = String(query || '').trim();
  const a = String(answer || '').trim();
  if (!q || !a) return { ok: false, reason: 'Empty query or answer' };

  // Extract keywords from query using AI to keep them clean
  const keywords = carlExtractKeywords_(q, g);

  const ss = plantosGetSS_();
  const plantSh = ss.getSheetByName('🌿 Plant Knowledge Base');
  const id = 'AI_' + Date.now().toString(36).toUpperCase();
  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const scope = (g && g !== '*') ? 'GENUS' : 'GENERAL';
  const subject = (g && g !== '*') ? g.toLowerCase() : 'general';
  if (plantSh) {
    plantSh.appendRow([
      id, scope, subject, 'ai_hint', a,
      keywords.join(','), 'medium', 'plant,carl,ai_auto',
      'carl-auto-' + date,
      Array.isArray(actions) ? actions.slice(0,3).join(' | ') : String(actions || ''),
      String(watchFor || ''),
    ]);
  } else {
    // Fallback to Carl Learned if KB sheet not set up
    const sh = carlLearnGetSheet_();
    const actStr = Array.isArray(actions) ? actions.join('||') : String(actions || '');
    sh.appendRow([id, date, g, keywords.join(', '), a, actStr, String(watchFor || ''), 0.80, String(source || 'ai-auto'), 0]);
  }
  return { ok: true, id };
}

// Bulk import training data — AI extracts entries from freeform text
function plantosCarlTrain(text, genus) {
  const API_KEY = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!API_KEY) throw new Error('ANTHROPIC_API_KEY not set');

  const g = String(genus || '*').trim();
  const systemPrompt = 
    'You are a plant knowledge extraction engine. Extract discrete plant care Q&A facts from the provided text.\n' +
    '\n' +
    'Output ONLY valid JSON — an array of objects:\n' +
    '[\n' +
    '  {\n' +
    '    "genus": "Anthurium",\n' +
    '    "keywords": ["yellow leaves","overwatering","root rot"],\n' +
    '    "answer": "Yellow leaves on Anthurium are most commonly caused by overwatering. Check roots for mushiness.",\n' +
    '    "actions": ["Remove yellow leaves","Check soil moisture","Let dry out before next watering"],\n' +
    '    "watchFor": "Mushy stems or black root tips indicate root rot",\n' +
    '    "confidence": 0.85\n' +
    '  }\n' +
    ']\n' +
    '\n' +
    'Rules:\n' +
    '- genus: the plant genus this applies to, or "*" for general plant advice\n' +
    '- keywords: 2-6 short phrases a user might type to ask this question\n' +
    '- answer: conversational, 1-3 sentences max\n' +
    '- actions: 0-4 short imperative steps\n' +
    '- watchFor: one-liner warning sign, or ""\n' +
    '- confidence: 0.5-0.95 based on how certain the information is\n' +
    '- Extract as many distinct facts as the text contains\n' +
    '- Skip vague or non-actionable text\n' +
    '- Output ONLY the JSON array, no other text';

  const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json',
    headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Extract plant care KB entries from this text:\n\n' + text.slice(0, 8000) }],
    }),
    muteHttpExceptions: true,
  });

  if (resp.getResponseCode() !== 200) throw new Error('AI error: ' + resp.getResponseCode());
  const data = JSON.parse(resp.getContentText());
  const raw = (data.content && data.content[0]) ? data.content[0].text : '[]';

  let entries;
  try { entries = JSON.parse(raw.replace(/```json|```/g, '').trim()); }
  catch(e) { throw new Error('Could not parse AI response as JSON'); }

  if (!Array.isArray(entries)) throw new Error('Expected array from AI');

  // Write to Plant KB (🌿 Plant Knowledge Base) — same sheet as structured KB
  const ss = plantosGetSS_();
  const plantSh = ss.getSheetByName('🌿 Plant Knowledge Base');
  if (!plantSh) throw new Error('Plant KB sheet not found. Run ⚙ Setup Knowledge System first.');
  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  let added = 0;
  let startOffset = Math.max(plantSh.getLastRow() - 1, 0);
  entries.forEach(function(e) {
    if (!e.keywords || !e.answer) return;
    const eGenus = String(e.genus || g || '*').trim();
    const scope = (eGenus && eGenus !== '*') ? 'GENUS' : 'GENERAL';
    const subject = (eGenus && eGenus !== '*') ? eGenus.toLowerCase() : 'general';
    const id = 'AI_' + String(startOffset + added + 1).padStart(6, '0');
    const kw = Array.isArray(e.keywords) ? e.keywords.join(',') : String(e.keywords);
    const conf = String(parseFloat(e.confidence) >= 0.85 ? 'high' : parseFloat(e.confidence) >= 0.65 ? 'medium' : 'low');
    // Write ai_hint row — answers stored as plain-English context for Carl
    plantSh.appendRow([
      id,                          // Knowledge ID
      scope,                       // Scope
      subject,                     // Subject
      'ai_hint',                   // Predicate
      String(e.answer || ''),      // Object
      kw,                          // Qualifier (keywords for matching)
      conf,                        // Confidence
      'plant,carl,ai_trained',     // Tags
      'carl-train-' + date,        // Source
      Array.isArray(e.actions) ? e.actions.slice(0,3).join(' | ') : '', // Interpretation
      String(e.watchFor || ''),    // Notes
    ]);
    // Also write actions as separate observed_behavior row if present
    if (Array.isArray(e.actions) && e.actions.length) {
      const actId = 'AI_' + String(startOffset + added + 1).padStart(6,'0') + 'a';
      plantSh.appendRow([
        actId, scope, subject, 'observed_behavior',
        e.actions.join(' | '), kw, conf,
        'plant,carl,ai_trained', 'carl-train-' + date, String(e.answer || '').slice(0,100), String(e.watchFor || ''),
      ]);
    }
    added++;
  });

  return { ok: true, added, entries };
}

// Log a miss — query Carl couldn't answer natively
function plantosCarlLogMiss(genus, query) {
  const key = 'CARL_MISSES';
  const props = PropertiesService.getScriptProperties();
  let misses = [];
  try { misses = JSON.parse(props.getProperty(key) || '[]'); } catch(e) {}
  const q = String(query || '').trim().toLowerCase();
  const g = String(genus || '').trim().toLowerCase();
  const existing = misses.find(function(m) { return m.q === q; });
  if (existing) { existing.count = (existing.count || 1) + 1; existing.last = new Date().toISOString().slice(0,10); }
  else { misses.unshift({ q, g, count: 1, last: new Date().toISOString().slice(0,10) }); }
  misses = misses.slice(0, 200); // cap at 200
  props.setProperty(key, JSON.stringify(misses));
  return { ok: true };
}

// Get miss log — so you can see what Carl doesn't know
function plantosCarlGetMisses() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('CARL_MISSES') || '[]';
    return JSON.parse(raw);
  } catch(e) { return []; }
}

function carlExtractKeywords_(query, genus) {
  // Simple local extraction — no AI call, fast
  const stop = new Set(['the','a','an','is','are','was','were','my','i','it','do','does','why','how','what','when','where','can','could','should','would','have','has','been','be','to','of','in','on','at','for','with','this','that','and','or','not','but']);
  const words = query.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(function(w) { return w.length > 2 && !stop.has(w); });
  // Also add genus if present
  if (genus && genus !== '*') words.unshift(genus.toLowerCase());
  // Dedupe and take top 6
  const seen = new Set();
  return words.filter(function(w) { if (seen.has(w)) return false; seen.add(w); return true; }).slice(0, 6);
}

/* ===================== QR MASTER / LABEL SHEET ===================== */

function plantosMenuGenerateQrLabels() {
  const ui = SpreadsheetApp.getUi();
  try { ui.alert(plantosGenerateQrMaster_().message); }
  catch (e) { ui.alert('QR Master build failed:\n' + (e && e.message ? e.message : String(e))); }
}

function plantosGenerateQrMaster_() {
  let baseUrl = plantosGetSetting_(PLANTOS_BACKEND_CFG.SETTINGS_KEYS.ACTIVE_WEBAPP_URL);
  if (!baseUrl) try { baseUrl = ScriptApp.getService().getUrl() || ''; } catch (e) { baseUrl = ''; }
  const ok = plantosValidateWebAppUrl_(baseUrl);
  if (!ok.ok) throw new Error('ACTIVE_WEBAPP_URL not set or invalid.\n\n' + ok.reason);
  try { plantosEnsureInventoryQrColumns_(); plantosBackfillQrScriptLinks_(); } catch (e) {}
  const ss = plantosGetSS_();
  let sh = ss.getSheetByName('QR Master');
  if (!sh) sh = ss.insertSheet('QR Master');
  sh.clear();
  const { hmap, values } = plantosReadInventory_();
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const uidCol = plantosCol_(hmap, H.UID);
  if (uidCol < 0) throw new Error('Missing required header: "' + H.UID + '"');
  const locCol = plantosCol_(hmap, H.LOCATION), plantIdCol = plantosCol_(hmap, H.PLANT_ID);
  const nickCol = plantosCol_(hmap, H.NICKNAME), genusCol = plantosCol_(hmap, H.GENUS), taxonCol = plantosCol_(hmap, H.TAXON);
  const birthdayCol = plantosCol_(hmap, H.BIRTHDAY), qrFileIdCol = plantosCol_(hmap, H.QR_FILE_ID);
  const aliveCol = plantosCol_(hmap, 'Alive'), inColCol = plantosCol_(hmap, 'In Collection');
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const uid = plantosSafeStr_(row[uidCol]).trim();
    if (!uid) continue;
    if (aliveCol >= 0) { const a = String(row[aliveCol] || '').toLowerCase().trim(); if (a && (a === 'false' || a === 'no' || a === 'dead' || a === '0')) continue; }
    if (inColCol >= 0) { const ic = String(row[inColCol] || '').toLowerCase().trim(); if (ic && (ic === 'false' || ic === 'no' || ic === '0')) continue; }
    const loc = locCol >= 0 ? plantosSafeStr_(row[locCol]).trim() : '';
    const pid = plantIdCol >= 0 ? plantosSafeStr_(row[plantIdCol]).trim() : '';
    const nn  = nickCol >= 0 ? plantosSafeStr_(row[nickCol]).trim() : '';
    const genus = genusCol >= 0 ? plantosSafeStr_(row[genusCol]).trim() : '';
    const taxon = taxonCol >= 0 ? plantosSafeStr_(row[taxonCol]).trim() : '';
    const classification = [genus, taxon].filter(Boolean).join(' ').trim();
    const name = nn || classification || ('UID ' + uid);
    const bd = birthdayCol >= 0 ? plantosAsDate_(row[birthdayCol]) : null;
    const clean = String(baseUrl).split('?')[0].split('#')[0];
    let qrFileUrl = '';
    if (qrFileIdCol >= 0) { const qfid = plantosSafeStr_(row[qrFileIdCol]).trim(); if (qfid) qrFileUrl = plantosDriveUcViewUrl_(qfid); }
    out.push([loc, pid, name, classification, bd ? plantosFmtDate_(bd) : '', clean + '?uid=' + encodeURIComponent(uid.replace(/[^A-Za-z0-9]/g, '')), qrFileUrl, uid]);
  }
  sh.getRange(1, 1, 1, 8).setValues([['Location','Plant ID','Name','Classification','Birthday','QR URL','QR File URL','Plant UID']]).setFontWeight('bold');
  if (out.length) sh.getRange(2, 1, out.length, 8).setValues(out);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, Math.max(1, out.length + 1), 8).createFilter();
  [130,140,200,260,110,520,520,110].forEach((w, i) => { try { sh.setColumnWidth(i + 1, w); } catch(e) {} });
  return { ok: true, message: `✅ QR Master refreshed.\nRows written: ${out.length}` };
}

function plantosDriveUcViewUrl_(fileId) {
  return 'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(String(fileId || '').trim());
}

/* ===================== BLANK ROW CLEANUP ===================== */

function plantosMenuCleanBlankRows() {
  const ui = SpreadsheetApp.getUi();
  const result = plantosCleanBlankRows_();
  ui.alert('🧹 Cleanup Complete', `Deleted ${result.deleted} blank/garbage rows.\nKept ${result.kept} real plants.\n\n` + (result.deleted > 0 ? '✅ Your inventory is now clean.' : 'Nothing to delete — already clean!'), ui.ButtonSet.OK);
}

function plantosCleanBlankRows_() {
  const { sh, hmap } = plantosReadInventory_();
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const nickCol  = plantosCol_(hmap, H.NICKNAME), taxonCol = plantosCol_(hmap, H.TAXON), genusCol = plantosCol_(hmap, H.GENUS);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { deleted: 0, kept: 0 };
  const allVals = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  const toDelete = [];
  let kept = 0;
  for (let i = 0; i < allVals.length; i++) {
    const row = allVals[i];
    const nick  = nickCol  >= 0 ? plantosSafeStr_(row[nickCol]).trim()  : '';
    const taxon = taxonCol >= 0 ? plantosSafeStr_(row[taxonCol]).trim() : '';
    const genus = genusCol >= 0 ? plantosSafeStr_(row[genusCol]).trim() : '';
    if (nick || taxon || genus) kept++; else toDelete.push(i + 2);
  }
  toDelete.reverse().forEach(rowNum => sh.deleteRow(rowNum));
  return { deleted: toDelete.length, kept };
}

/* ===================== onOpen ===================== */

function onOpen() {
  const ui   = SpreadsheetApp.getUi();
  const menu = ui.createMenu('🌿 PlantOS')
    .addItem('Set Web App URL (manual)',                'plantosMenuSetWebAppUrlManual')
    .addItem('Confirm Web App URL (auto-detect)',       'plantosMenuConfirmWebAppUrlAuto')
    .addSeparator()
    .addItem('Wipe Deployment Fields (IDs/URLs only)', 'plantosMenuWipeDeploymentFields')
    .addItem('Rebuild Deployments (folders/QR/links)', 'plantosMenuRebuildStart')
    .addItem('Continue Rebuild (resume)',               'plantosMenuRebuildContinue')
    .addSeparator()
    .addItem('🧹 Delete blank/garbage rows',           'plantosMenuCleanBlankRows')
    .addItem('⚙ Add Missing Columns (Pot Material etc)', 'plantosEnsureOptionalColumns')
    .addSeparator()
    .addItem('Generate QR Label Sheet',                'plantosMenuGenerateQrLabels')
    .addSeparator()
    .addItem('STOP (clear rebuild cursor)',             'plantosMenuStop')
    .addItem('Diagnostics',                            'plantosMenuDiagnostics')
    .addSeparator()
    .addSubMenu(
      ui.createMenu('📥 Import')
        .addItem('⚙ Create Import tab (first time setup)', 'plantosImportCreateTab')
        .addSeparator()
        .addItem('① Recognize & Preview pasted data', 'plantosImportRecognize')
        .addItem('② Commit Import to inventory',       'plantosImportCommit')
        .addSeparator()
        .addItem('Clear import zone',                  'plantosImportClear')
    )
    .addSeparator()
    .addSubMenu(
      ui.createMenu('🧠 Knowledge')
        .addItem('⚙ Setup Knowledge System',        'kbSetup')
        .addItem('⚙ Setup Name & Alias Tables',      'kbqSetupTables')
        .addSeparator()
        .addItem('① Import from Paste Zone',          'kbImport')
        .addSeparator()
        .addItem('Clear Paste Zone',                  'kbClear')
        .addSeparator()
        .addItem('Export KB to JSON (offline sync)',  'kbqExportToSheet')
    );
  menu.addToUi();
}


/* ===================== IMPORT ENGINE ===================== */

const IMPORT_SHEET_NAME  = '📥 Import Plants';
const IMPORT_PASTE_ROW   = 13;
const IMPORT_PASTE_COL   = 3;
const IMPORT_MAP_ROW     = 67;
const IMPORT_MAP_COLS    = 20;
const IMPORT_PREVIEW_ROW = 92;
const IMPORT_STATUS_ROW  = 99;

const IMPORT_SYNONYMS = {
  'Plant UID':             ['uid','id','plant id','plantid','plant_id','plant no','plant #','#','number','num','index','key','unique id','uniqueid','identifier'],
  'Nick-name':             ['nickname','nick-name','nick name','name','common name','label','tag','alias','display name','displayname','friendly name','plant name','my name','pet name','handle'],
  'Genus':                 ['genus','genera','botanical genus','plant genus','latin genus','scientific genus'],
  'Taxon Raw':             ['species','taxon','taxon raw','scientific name','latin name','botanical name','variety','cultivar','sp','spp','epithet','specific epithet','binomial','full name','classification'],
  'Location':              ['location','room','spot','area','zone','place','shelf','window','placed at','sitting at','where','environment','env','position','section','bay'],
  'Birthday':              ['birthday','dob','date acquired','acquired','date added','purchase date','purchased','got','since','acquisition date','start date','arrival date','date joined','date received','received'],
  'Last Watered':          ['last watered','watered','water date','last water','h2o','watered on','last_watered','last watering','most recent water','watering date','last h2o'],
  'Water Every Days':      ['water every','water every days','water every x days','watering freq','watering frequency','frequency','water freq','every','days between waterings','days between','watering interval','interval days','every n days','every x days','water days'],
  'Last Fertilized':       ['last fertilized','fertilized','fert date','last fert','fertilized on','last fertilizing','last fertilization','last fed','fed on','feeding date'],
  'Fertilize Every Days':  ['fertilize every','fertilize every days','fert every','fert freq','fertilize freq','feeding frequency','fert interval','days between feedings'],
  'Medium':                ['medium','substrate','soil','mix','potting mix','growing medium','media','soil type','potting soil','growing mix','substrate type','soil mix'],
  'Pot Size':              ['pot size','pot','container','size','diameter','pot diameter','vessel','pot width','container size'],
  'Pot Material':          ['pot material','material','container type','pot type','vessel type','container material'],
  'Alive':                 ['alive','living','active','alive?','status','dead?','live','is alive','is living','life status','health status'],
  'Notes':                 ['notes','note','comments','comment','observations','observation','remarks','remark','memo','additional info','info','extra','description','desc'],
  'Cause Of Death':        ['cause of death','cod','death cause','why died','died from','cause','deceased reason'],
  'Death Date':            ['death date','died','died on','date died','deceased date'],
  'Parent UID':            ['parent uid','parent','mother plant','source plant','parent plant','propagated from','cutting from','divided from'],
  'Hybrid Type':           ['hybrid','is hybrid','hybrid type','hybrid?','cross','is cross'],
  'Mother UID':            ['mother uid','mother','female parent','mom'],
  'Father UID':            ['father uid','father','pollen donor','male parent','dad','sire'],
  'Generation':            ['generation','gen','f1','f2','cross generation','filial'],
};

function _levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  const dp = Array.from({length: m+1}, (_, i) => Array.from({length: n+1}, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function _sniffColumnContent(values) {
  const nonEmpty = values.filter(v => v !== null && v !== undefined && String(v).trim() !== '').slice(0, 10);
  if (!nonEmpty.length) return null;
  let dateCount = 0, numCount = 0, longTextCount = 0, boolCount = 0;
  const PLANT_GENERA = ['philodendron','monstera','alocasia','epipremnum','scindapsus','anthurium','ficus','pothos','cactus','calathea','maranta','begonia','hoya','peperomia','tradescantia','dracaena','spathiphyllum','aglaonema','zamioculcas','sansevieria','aloe','echeveria','haworthia','gasteria','euphorbia','adenium','plumeria','orchid','phalaenopsis'];
  let genusHit = 0;
  const LOCATIONS = ['bedroom','bathroom','kitchen','living room','office','balcony','patio','greenhouse','hallway','study','windowsill','shelf'];
  let locHit = 0;
  nonEmpty.forEach(v => {
    const s = String(v).trim().toLowerCase();
    if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(s) || /^\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/.test(s) || v instanceof Date) dateCount++;
    if (/^\d+$/.test(s) || /^\d+\.\d+$/.test(s)) numCount++;
    if (['true','false','yes','no','1','0','alive','dead'].includes(s)) boolCount++;
    if (/^[a-z]+$/.test(s) && s.length >= 4 && s.length <= 20) { if (PLANT_GENERA.some(g => g.startsWith(s.slice(0,4)))) genusHit++; }
    if (LOCATIONS.some(l => s.includes(l))) locHit++;
    if (s.length > 40) longTextCount++;
  });
  const total = nonEmpty.length;
  if (dateCount / total >= 0.6) return { field: 'Last Watered', confidence: 'LOW' };
  if (boolCount / total >= 0.5) return { field: 'Alive', confidence: 'LOW' };
  if (numCount / total >= 0.7 && nonEmpty.every(v => Number(v) < 1e8)) return { field: 'Water Every Days', confidence: 'LOW' };
  if (genusHit >= 2) return { field: 'Genus', confidence: 'LOW' };
  if (locHit >= 2) return { field: 'Location', confidence: 'LOW' };
  if (longTextCount / total >= 0.5) return { field: 'Notes', confidence: 'LOW' };
  return null;
}

function _recognizeColumn(header, colValues) {
  const norm = String(header || '').trim().toLowerCase().replace(/[_\-.]/g, ' ').replace(/\s+/g, ' ');
  for (const [field, aliases] of Object.entries(IMPORT_SYNONYMS)) { if (aliases.includes(norm)) return { field, confidence: 'HIGH' }; }
  for (const [field, aliases] of Object.entries(IMPORT_SYNONYMS)) { for (const alias of aliases) { if ((norm.includes(alias) || alias.includes(norm)) && alias.length >= 3 && norm.length >= 3) return { field, confidence: 'MED' }; } }
  let bestField = null, bestDist = Infinity;
  for (const [field, aliases] of Object.entries(IMPORT_SYNONYMS)) { for (const alias of aliases) { if (Math.abs(alias.length - norm.length) > 4) continue; const d = _levenshtein(norm, alias); const threshold = norm.length <= 5 ? 1 : norm.length <= 10 ? 2 : 3; if (d <= threshold && d < bestDist) { bestDist = d; bestField = field; } } }
  if (bestField) return { field: bestField, confidence: 'LOW' };
  const sniff = _sniffColumnContent(colValues);
  if (sniff) return sniff;
  return { field: 'SKIP', confidence: 'SKIP' };
}

function plantosImportRecognize() {
  const ui = SpreadsheetApp.getUi(), ss = plantosGetSS_();
  const imp = ss.getSheetByName(IMPORT_SHEET_NAME);
  if (!imp) { ui.alert('Import sheet not found. Make sure the "📥 Import Plants" tab exists.'); return; }
  const lastRow = imp.getLastRow(), lastCol = imp.getLastColumn();
  if (lastRow < IMPORT_PASTE_ROW || lastCol < IMPORT_PASTE_COL) { ui.alert('No data found. Paste your data into cell C13 first.'); return; }
  const rawData = imp.getRange(IMPORT_PASTE_ROW, IMPORT_PASTE_COL, lastRow - IMPORT_PASTE_ROW + 1, lastCol - IMPORT_PASTE_COL + 1).getValues();
  const firstRow = rawData[0];
  const stringCells = firstRow.filter(v => typeof v === 'string' && v.trim() !== '' && isNaN(v)).length;
  const hasHeader = stringCells >= Math.ceil(firstRow.length * 0.5);
  const headers = hasHeader ? firstRow.map(v => String(v || '').trim()) : firstRow.map((_, i) => `Column ${i + 1}`);
  const dataRows = hasHeader ? rawData.slice(1) : rawData;
  const mappings = headers.map((header, ci) => Object.assign({ sourceHeader: header }, _recognizeColumn(header, dataRows.map(r => r[ci]))));
  imp.getRange(IMPORT_MAP_ROW, 2, IMPORT_MAP_COLS, 4).clearContent().setBackground('#FFFFFF');
  const CONF_BG = { HIGH: '#E8F5E9', MED: '#FFFDE7', LOW: '#FFF3E0', SKIP: '#FFEBEE' };
  const CONF_FG = { HIGH: '#1B5E20', MED: '#F57F17', LOW: '#E65100', SKIP: '#B71C1C' };
  const allFields = Object.keys(IMPORT_SYNONYMS).concat(['SKIP']);
  mappings.forEach((m, i) => {
    if (i >= IMPORT_MAP_COLS) return;
    const r = IMPORT_MAP_ROW + i, bg = CONF_BG[m.confidence] || '#FFFFFF', fg = CONF_FG[m.confidence] || '#333333';
    imp.getRange(r, 2).setValue(m.sourceHeader || `Column ${i+1}`);
    imp.getRange(r, 3).setValue(m.field).setBackground(bg).setFontColor(fg).setFontWeight('bold');
    imp.getRange(r, 4).setValue(m.confidence).setBackground(bg).setFontColor(fg);
    imp.getRange(r, 5).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(allFields, true).setAllowInvalid(true).build()).setValue('').setBackground('#F3F8FF');
  });
  imp.getRange(IMPORT_PREVIEW_ROW, 1, 5, 10).clearContent().setBackground('#FFFFFF');
  const PREVIEW_FIELDS = ['Plant UID','Nick-name','Genus','Taxon Raw','Location','Birthday','Last Watered','Medium','Pot Size','Notes'];
  dataRows.slice(0, 5).forEach((row, ri) => {
    const previewRow = {};
    mappings.forEach((m, ci) => { if (m.field !== 'SKIP') previewRow[m.field] = row[ci]; });
    PREVIEW_FIELDS.forEach((field, fi) => {
      const val = previewRow[field] !== undefined ? previewRow[field] : '';
      imp.getRange(IMPORT_PREVIEW_ROW + ri, 1 + fi).setValue(val instanceof Date ? Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd') : val).setBackground(ri % 2 === 0 ? '#FFFFFF' : '#F5F5F5');
    });
  });
  const high = mappings.filter(m => m.confidence === 'HIGH').length, med = mappings.filter(m => m.confidence === 'MED').length, skip = mappings.filter(m => m.confidence === 'SKIP').length;
  const msg = `✅ Recognized ${headers.length} columns: ${high} HIGH · ${med} MED · ${mappings.length - high - med - skip} LOW · ${skip} SKIP\n${hasHeader ? 'Header row detected.' : 'No header — auto-labeled.'} ${dataRows.length} data rows.\nFix any mapping issues using the Override column, then run Import → Commit Import.`;
  imp.getRange(IMPORT_STATUS_ROW, 1, 1, 6).merge().setValue(msg).setBackground('#E8F5E9').setFontColor('#1B5E20').setFontFamily('Arial').setFontSize(9).setVerticalAlignment('top').setWrap(true);
  imp.setRowHeight(IMPORT_STATUS_ROW, 60);
  ui.alert(`Recognized ${headers.length} columns.\n${high} high · ${med} medium · ${skip} skipped.\n\nReview the Mapping Zone and fix any mismatches.\nThen run: 🌿 PlantOS → Import → Commit Import`);
}

function plantosImportCommit() {
  const ui = SpreadsheetApp.getUi(), ss = plantosGetSS_();
  const imp = ss.getSheetByName(IMPORT_SHEET_NAME);
  if (!imp) { ui.alert('Import sheet not found.'); return; }
  const mappingRange = imp.getRange(IMPORT_MAP_ROW, 2, IMPORT_MAP_COLS, 4).getValues();
  const fieldMap = {};
  mappingRange.forEach((row, i) => {
    const sourceHeader = String(row[0] || '').trim();
    if (!sourceHeader) return;
    const override = String(row[3] || '').trim(), recognized = String(row[1] || '').trim();
    const effective = (override && override !== 'SKIP') ? override : recognized;
    if (effective && effective !== 'SKIP') fieldMap[i] = effective;
  });
  if (!Object.keys(fieldMap).length) { ui.alert('No column mapping found. Run "Recognize & Preview" first.'); return; }
  const lastRow = imp.getLastRow();
  if (lastRow < IMPORT_PASTE_ROW) { ui.alert('No pasted data found.'); return; }
  const rawData = imp.getRange(IMPORT_PASTE_ROW, IMPORT_PASTE_COL, lastRow - IMPORT_PASTE_ROW + 1, imp.getLastColumn() - IMPORT_PASTE_COL + 1).getValues();
  const firstRow = rawData[0];
  const hasHeader = firstRow.filter(v => typeof v === 'string' && v.trim() !== '' && isNaN(v)).length >= Math.ceil(firstRow.length * 0.5);
  const dataRows = hasHeader ? rawData.slice(1) : rawData;
  if (!dataRows.length) { ui.alert('No data rows to import.'); return; }
  const { sh: invSh, values: existingData, hmap } = plantosReadInventory_();
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const genusCol = plantosCol_(hmap, H.GENUS), taxonCol = plantosCol_(hmap, H.TAXON), nickCol = plantosCol_(hmap, H.NICKNAME);
  const invHeaders = invSh.getRange(1, 1, 1, invSh.getLastColumn()).getValues()[0];
  const existingFPs = new Set();
  existingData.slice(1).forEach(row => { const fp = [String(row[genusCol]||''), String(row[taxonCol]||''), String(row[nickCol]||'')].map(s => plantosNorm_(s)).join('|'); if (fp !== '||') existingFPs.add(fp); });
  let imported = 0, skipped = 0, errors = 0;
  const log = [];
  dataRows.forEach((row, ri) => {
    try {
      const record = {};
      Object.entries(fieldMap).forEach(([ci, field]) => { const val = row[Number(ci)]; if (val !== null && val !== undefined && String(val).trim() !== '') record[field] = val instanceof Date ? Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(val).trim(); });
      if (!Object.keys(record).length) { skipped++; return; }
      const fp = [record['Genus']||'', record['Taxon Raw']||'', record['Nick-name']||''].map(s => plantosNorm_(s)).join('|');
      if (fp !== '||' && existingFPs.has(fp)) { skipped++; log.push(`Row ${ri+2}: SKIPPED (duplicate) — ${record['Genus']||''} ${record['Taxon Raw']||''} ${record['Nick-name']||''}`); return; }
      if (!record['Genus'] && !record['Nick-name'] && !record['Taxon Raw']) { skipped++; log.push(`Row ${ri+2}: SKIPPED (no plant name)`); return; }
      const uid = plantosGenerateNextUid_();
      const invRow = new Array(invHeaders.length).fill('');
      const setF = (colName, val) => { const c = plantosCol_(hmap, colName); if (c >= 0 && val) invRow[c] = val; };
      setF(H.UID, uid); setF(H.NICKNAME, record['Nick-name']||''); setF(H.GENUS, record['Genus']||''); setF(H.TAXON, record['Taxon Raw']||'');
      setF(H.LOCATION, record['Location']||''); setF(H.MEDIUM, record['Medium']||''); setF(H.POT_SIZE, record['Pot Size']||'');
      setF(H.BIRTHDAY, record['Birthday']||''); setF(H.WATER_EVERY_DAYS, record['Water Every Days']||''); setF(H.LAST_WATERED, record['Last Watered']||'');
      invSh.appendRow(invRow);
      existingFPs.add(fp); imported++;
      log.push(`Row ${ri+2}: IMPORTED UID ${uid} — ${record['Genus']||''} ${record['Taxon Raw']||''} ${record['Nick-name']||''}`);
    } catch(e) { errors++; log.push(`Row ${ri+2}: ERROR — ${e && e.message ? e.message : e}`); }
  });
  const statusMsg = `✅ Import complete!\nImported: ${imported}  |  Skipped: ${skipped}  |  Errors: ${errors}\n\n` + log.slice(0, 20).join('\n') + (log.length > 20 ? `\n... and ${log.length-20} more` : '');
  imp.getRange(IMPORT_STATUS_ROW, 1, 1, 6).merge().setValue(statusMsg).setBackground(errors > 0 ? '#FFF3E0' : '#E8F5E9').setFontColor(errors > 0 ? '#E65100' : '#1B5E20').setFontFamily('Arial').setFontSize(8).setVerticalAlignment('top').setWrap(true);
  imp.setRowHeight(IMPORT_STATUS_ROW, Math.min(200, 20 + log.length * 12));
  ui.alert(`Import complete!\n\n✅ Imported: ${imported}\n⏭ Skipped:  ${skipped}\n❌ Errors:   ${errors}\n\nSee the Import Status section for details.`);
}

function plantosImportClear() {
  const ui = SpreadsheetApp.getUi(), ss = plantosGetSS_();
  const imp = ss.getSheetByName(IMPORT_SHEET_NAME);
  if (!imp) return;
  if (ui.alert('Clear Import Zone?', 'This clears pasted data, mapping, preview, and status. Your inventory is NOT affected.', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  const lr = imp.getLastRow(), lc = imp.getLastColumn();
  if (lr >= IMPORT_PASTE_ROW && lc >= IMPORT_PASTE_COL) imp.getRange(IMPORT_PASTE_ROW, IMPORT_PASTE_COL, Math.max(1, lr - IMPORT_PASTE_ROW + 1), Math.max(1, lc - IMPORT_PASTE_COL + 1)).clearContent();
  imp.getRange(IMPORT_MAP_ROW, 2, IMPORT_MAP_COLS, 4).clearContent().setBackground('#FFFFFF');
  imp.getRange(IMPORT_PREVIEW_ROW, 1, 5, 10).clearContent().setBackground('#FFFFFF');
  imp.getRange(IMPORT_STATUS_ROW, 1, 1, 6).merge().clearContent().setBackground('#E8F5E9');
  ui.alert('Import zone cleared.');
}

function plantosImportCreateTab() {
  const ui = SpreadsheetApp.getUi(), ss = plantosGetSS_();
  let imp = ss.getSheetByName(IMPORT_SHEET_NAME);
  if (imp) { ui.alert('The "' + IMPORT_SHEET_NAME + '" tab already exists.'); return; }
  imp = ss.insertSheet(IMPORT_SHEET_NAME);
  imp.setTabColor('#1565C0');
  const C = { dark_green: '#1B5E20', mid_green: '#2A5808', light_green: '#E8F5E9', white: '#FFFFFF', amber_dark: '#F57F17', blue_dark: '#1565C0', header_bg: '#2A5808' };
  imp.setColumnWidth(1, 20); imp.setColumnWidth(2, 160); imp.setColumnWidth(3, 400); imp.setColumnWidth(4, 160); imp.setColumnWidth(5, 140);
  function style(range, opts) { if (opts.bg) range.setBackground(opts.bg); if (opts.fg) range.setFontColor(opts.fg); if (opts.bold) range.setFontWeight('bold'); if (opts.italic) range.setFontStyle('italic'); if (opts.sz) range.setFontSize(opts.sz); if (opts.wrap) range.setWrap(true); if (opts.valign) range.setVerticalAlignment(opts.valign); if (opts.halign) range.setHorizontalAlignment(opts.halign); return range; }
  imp.setRowHeight(2, 38); imp.setRowHeight(3, 22);
  imp.getRange(2, 1, 1, 5).merge().setValue('📥  PLANT IMPORT — Paste & Recognize');
  style(imp.getRange(2, 1), { bg: C.dark_green, fg: C.white, bold: true, sz: 14, valign: 'middle' });
  imp.getRange(3, 1, 1, 5).merge().setValue('Paste your data below. PlantOS will recognize your columns automatically.');
  style(imp.getRange(3, 1), { bg: C.mid_green, fg: '#D7F0C7', italic: true, sz: 9, valign: 'middle' });
  imp.setRowHeight(12, 22);
  imp.getRange(12, 2, 1, 4).merge().setValue('① PASTE YOUR DATA HERE  (Ctrl+V / ⌘V into cell C13)');
  style(imp.getRange(12, 2), { bg: C.amber_dark, fg: C.white, bold: true, sz: 10, valign: 'middle' });
  imp.setRowHeight(13, 22);
  style(imp.getRange(13, 3, 1, 3).merge().setValue('← Paste here.'), { bg: '#DBEAFE', fg: C.blue_dark, bold: true, sz: 9, halign: 'center' });
  imp.setRowHeight(65, 22);
  imp.getRange(65, 2, 1, 4).merge().setValue('② COLUMN MAPPING  (auto-filled after running "Recognize & Preview")');
  style(imp.getRange(65, 2), { bg: C.blue_dark, fg: C.white, bold: true, sz: 10, valign: 'middle' });
  imp.setRowHeight(66, 20);
  ['Your Column Header', 'Recognized As (PlantOS field)', 'Confidence', 'Override (optional)'].forEach((h, i) => { style(imp.getRange(66, 2 + i).setValue(h), { bg: C.header_bg, fg: C.white, bold: true, sz: 9, halign: 'center' }); });
  imp.setRowHeight(90, 22);
  imp.getRange(90, 2, 1, 4).merge().setValue('③ PREVIEW  (first 5 rows as they\'ll appear in your inventory)');
  style(imp.getRange(90, 2), { bg: '#43A047', fg: C.white, bold: true, sz: 10, valign: 'middle' });
  imp.setRowHeight(98, 22);
  imp.getRange(98, 1, 1, 5).merge().setValue('④ IMPORT STATUS  — written here after Commit');
  style(imp.getRange(98, 1), { bg: C.mid_green, fg: C.white, bold: true, sz: 10, valign: 'middle' });
  imp.setRowHeight(99, 40);
  style(imp.getRange(99, 1, 1, 5).merge().setValue('(run "Recognize & Preview" first, then "Commit Import")'), { bg: C.light_green, fg: C.dark_green, sz: 9, italic: true, halign: 'center', valign: 'middle' });
  SpreadsheetApp.getActive().toast('Import tab created!', '📥 Import Plants', 4);
  ui.alert('✅ "📥 Import Plants" tab created!\n\nPaste your data into cell C13, then run:\n🌿 PlantOS → Import → ① Recognize & Preview');
}

/* ===================== MISSING FUNCTION STUBS ===================== */

function callClaude(payload) {
  // Proxy to Anthropic API — payload: { messages, system, model }
  payload = payload || {};
  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY') || '';
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in Script Properties');
  const body = {
    model: payload.model || 'claude-sonnet-4-20250514',
    max_tokens: payload.max_tokens || 1024,
    system: payload.system || '',
    messages: payload.messages || [],
  };
  const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  const json = JSON.parse(resp.getContentText());
  if (json.error) throw new Error(json.error.message || 'Anthropic API error');
  return json;
}

function carlLoadMessages(uid) {
  try {
    const key = 'carl_msgs_' + plantosSafeStr_(uid).trim();
    const val = PropertiesService.getUserProperties().getProperty(key);
    return val ? JSON.parse(val) : [];
  } catch(e) { return []; }
}

function carlSaveMessages(uid, messages) {
  try {
    const key = 'carl_msgs_' + plantosSafeStr_(uid).trim();
    PropertiesService.getUserProperties().setProperty(key, JSON.stringify(messages || []));
    return { ok: true };
  } catch(e) { return { ok: false, error: e.message }; }
}

function carlGetConversationPatterns(uid) {
  return { ok: true, patterns: [] };
}

function carlLearnConversation(uid, messages) {
  return { ok: true };
}

function carlMigrateToKB(uid) {
  return { ok: true, migrated: 0 };
}

function kbDump() {
  try {
    const ss = plantosGetSS_();
    const sh = ss.getSheetByName('KB');
    if (!sh) return { ok: true, rows: [] };
    const vals = sh.getDataRange().getValues();
    return { ok: true, rows: vals };
  } catch(e) { return { ok: false, error: e.message }; }
}

function kbGetPlantFacts(genus) {
  try {
    const ss = plantosGetSS_();
    const sh = ss.getSheetByName('KB');
    if (!sh) return { ok: true, facts: [] };
    const vals = sh.getDataRange().getValues();
    const g = plantosSafeStr_(genus).toLowerCase().trim();
    const facts = vals.filter(r => plantosSafeStr_(r[0]).toLowerCase().includes(g));
    return { ok: true, facts };
  } catch(e) { return { ok: false, facts: [], error: e.message }; }
}

function plantosGetOffspring(uid) {
  try {
    const needle = plantosSafeStr_(uid).trim();
    const { values, hmap } = plantosReadInventory_();
    const H = PLANTOS_BACKEND_CFG.HEADERS;
    const uidCol = plantosCol_(hmap, H.UID);
    const parentCol = plantosCol_(hmap, 'Parent UID');
    if (parentCol < 0) return { ok: true, offspring: [] };
    const offspring = [];
    for (let r = 1; r < values.length; r++) {
      const parentUID = plantosSafeStr_(values[r][parentCol]).trim();
      if (parentUID === needle) {
        const childUID = uidCol >= 0 ? plantosSafeStr_(values[r][uidCol]).trim() : '';
        offspring.push({ uid: childUID, row: r + 1 });
      }
    }
    return { ok: true, offspring };
  } catch(e) { return { ok: false, offspring: [], error: e.message }; }
}

function plantosEnsureSemiHydroColumns() {
  const sh = plantosGetInventorySheet_();
  const headerRow = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] || [];
  const hmap = plantosHeaderMap_(headerRow);
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const desired = [H.GROWING_METHOD, H.SEMIHYDRO_FERT_MODE, H.FLUSH_EVERY_N];
  const added = [];
  desired.forEach(function(col) {
    if (plantosCol_(hmap, col) < 0) {
      sh.getRange(1, sh.getLastColumn() + 1).setValue(col);
      added.push(col);
    }
  });
  Logger.log('[PlantOS] ensureSemiHydroColumns: ' + (added.length ? 'Added: ' + added.join(', ') : 'All present'));
  return { ok: true, added };
}

// ─── CHARACTER CHAT PERSISTENCE ─────────────────────────────────────────────
// Per-character / per-group message history (replaces per-plant carl_msgs_*)

function chatLoadHistory(chatId) {
  try {
    var key = 'chat_' + plantosSafeStr_(String(chatId)).trim();
    var val = PropertiesService.getUserProperties().getProperty(key);
    if (!val) return { ok: true, messages: [] };
    var msgs = JSON.parse(val);
    if (msgs.length > 20) msgs = msgs.slice(msgs.length - 20);
    return { ok: true, messages: msgs };
  } catch(e) { return { ok: true, messages: [] }; }
}

function chatSaveHistory(chatId, messagesJson) {
  try {
    var key = 'chat_' + plantosSafeStr_(String(chatId)).trim();
    var msgs = typeof messagesJson === 'string' ? JSON.parse(messagesJson) : messagesJson;
    if (msgs.length > 20) msgs = msgs.slice(msgs.length - 20);
    PropertiesService.getUserProperties().setProperty(key, JSON.stringify(msgs));
    return { ok: true };
  } catch(e) { return { ok: false, error: e.message }; }
}

function chatGetCustomGroups() {
  try {
    var val = PropertiesService.getUserProperties().getProperty('chat_custom_groups');
    return { ok: true, groups: val ? JSON.parse(val) : [] };
  } catch(e) { return { ok: true, groups: [] }; }
}

function chatSaveCustomGroups(groupsJson) {
  try {
    PropertiesService.getUserProperties().setProperty('chat_custom_groups',
      typeof groupsJson === 'string' ? groupsJson : JSON.stringify(groupsJson));
    return { ok: true };
  } catch(e) { return { ok: false, error: e.message }; }
}

function chatGetLastPreviews() {
  try {
    var val = PropertiesService.getUserProperties().getProperty('chat_previews');
    return { ok: true, previews: val ? JSON.parse(val) : {} };
  } catch(e) { return { ok: true, previews: {} }; }
}

function chatSavePreview(chatId, previewText) {
  try {
    var val = PropertiesService.getUserProperties().getProperty('chat_previews');
    var previews = val ? JSON.parse(val) : {};
    previews[String(chatId)] = { text: String(previewText).substring(0, 80), ts: new Date().toISOString() };
    PropertiesService.getUserProperties().setProperty('chat_previews', JSON.stringify(previews));
    return { ok: true };
  } catch(e) { return { ok: false }; }
}

function chatGetUnreadCounts() {
  try {
    var chatIds = ['dm_carl', 'dm_karl', 'dm_rahul', 'dm_mamta', 'group_chaos', 'group_roast', 'group_greenhouse'];
    var cgVal = PropertiesService.getUserProperties().getProperty('chat_custom_groups');
    if (cgVal) { var cgs = JSON.parse(cgVal); for (var i = 0; i < cgs.length; i++) chatIds.push(cgs[i].id); }
    var counts = {};
    for (var i = 0; i < chatIds.length; i++) {
      var val = PropertiesService.getUserProperties().getProperty('chat_' + plantosSafeStr_(chatIds[i]));
      if (val) { try { var ms = JSON.parse(val); var u = 0; for (var j = 0; j < ms.length; j++) { if (ms[j].unread) u++; } if (u > 0) counts[chatIds[i]] = u; } catch(e) {} }
    }
    return { ok: true, counts: counts };
  } catch(e) { return { ok: true, counts: {} }; }
}

function chatMarkRead(chatId) {
  try {
    var key = 'chat_' + plantosSafeStr_(String(chatId)).trim();
    var val = PropertiesService.getUserProperties().getProperty(key);
    if (!val) return { ok: true };
    var msgs = JSON.parse(val);
    var changed = false;
    for (var i = 0; i < msgs.length; i++) { if (msgs[i].unread) { delete msgs[i].unread; changed = true; } }
    if (changed) PropertiesService.getUserProperties().setProperty(key, JSON.stringify(msgs));
    return { ok: true };
  } catch(e) { return { ok: false, error: e.message }; }
}

function chatGenerateUnprompted(charId) {
  try {
    var key = PropertiesService.getUserProperties().getProperty('ANTHROPIC_API_KEY');
    if (!key) return { ok: false, skip: true };
    var tsKey = 'chat_unprompted_' + plantosSafeStr_(String(charId));
    var lastTs = PropertiesService.getUserProperties().getProperty(tsKey);
    if (lastTs) {
      var elapsed = Date.now() - Number(lastTs);
      if (elapsed < 3600000 * 4) return { ok: false, skip: true };
    }
    if (Math.random() > 0.15) return { ok: false, skip: true };

    var prompts = {
      karl: "You are Karl. You're trapped in a phone app and bored. Send the user a short unprompted message — complain about something, roast one of the other characters, or grumble about a neglected plant. 2 sentences max. Jersey wiseguy energy. Return ONLY the message text, no JSON.",
      rahul: "You are Rahul. Trapped in a plant app, homesick for Mumbai. Send the user a short unprompted message — maybe you miss chai, maybe you're worried about your mama, maybe you noticed something about their plants. 2 sentences max. Hinglish natural. Return ONLY the message text, no JSON.",
      mamta: "You are Mamta, Rahul's mother. Confused, trapped in digital void. Send a short unprompted message — ask if the user has eaten, worry about Rahul, complain about the darkness, or accidentally reference a plant while talking about something else. 2 sentences max. Hindi-English mix. Return ONLY the message text, no JSON.",
      carl: "You are Carl, a plant expert embedded in PlantOS. Send a short friendly unprompted message — a seasonal plant tip, a gentle check-in, or a fun plant fact. 2 sentences max. Warm and knowledgeable. Return ONLY the message text, no JSON."
    };
    var prompt = prompts[charId] || prompts.carl;
    var payload = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    };
    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    var body = JSON.parse(resp.getContentText());
    var text = body.content && body.content[0] && body.content[0].text;
    if (!text) return { ok: false };
    PropertiesService.getUserProperties().setProperty(tsKey, String(Date.now()));
    // Save unprompted message to chat history with unread flag
    var _dmId = 'dm_' + String(charId);
    var _histKey = 'chat_' + plantosSafeStr_(_dmId);
    var _histVal = PropertiesService.getUserProperties().getProperty(_histKey);
    var _msgs = _histVal ? JSON.parse(_histVal) : [];
    var _charNames = { carl: 'Carl', karl: 'Karl', rahul: 'Rahul', mamta: 'Mamta' };
    _msgs.push({ role: 'carl', charId: charId, charName: _charNames[charId] || 'Carl', text: text.trim(), ts: new Date().toISOString(), unread: true });
    if (_msgs.length > 20) _msgs = _msgs.slice(_msgs.length - 20);
    PropertiesService.getUserProperties().setProperty(_histKey, JSON.stringify(_msgs));
    chatSavePreview(_dmId, (_charNames[charId] || 'Carl') + ': ' + text.trim().substring(0, 60));
    return { ok: true, charId: charId, text: text.trim() };
  } catch(e) { return { ok: false, error: e.message }; }
}

// ─── RELATIONSHIP / LORE SYSTEM ─────────────────────────────────────────────

function chatGetRelationships() {
  try {
    var val = PropertiesService.getUserProperties().getProperty('chat_relationships');
    if (!val) {
      var defaults = { karl_mamta: 20, rahul_karl: 50 };
      PropertiesService.getUserProperties().setProperty('chat_relationships', JSON.stringify(defaults));
      return { ok: true, relationships: defaults };
    }
    return { ok: true, relationships: JSON.parse(val) };
  } catch(e) { return { ok: true, relationships: { karl_mamta: 20, rahul_karl: 50 } }; }
}

function chatBumpRelationship(pair, amount) {
  try {
    var val = PropertiesService.getUserProperties().getProperty('chat_relationships');
    var rels = val ? JSON.parse(val) : { karl_mamta: 20, rahul_karl: 50 };
    var oldScore = rels[pair] || 0;
    rels[pair] = Math.max(0, Math.min(100, oldScore + amount));
    PropertiesService.getUserProperties().setProperty('chat_relationships', JSON.stringify(rels));
    return { ok: true, relationships: rels, oldScore: oldScore, newScore: rels[pair] };
  } catch(e) { return { ok: false, error: e.message }; }
}

function chatGetRelScore(pair) {
  try {
    var val = PropertiesService.getScriptProperties().getProperty('chat_rel_' + plantosSafeStr_(String(pair)));
    var score = val !== null ? Number(val) : (pair === 'karl_mamta' ? 20 : 0);
    return { ok: true, pair: pair, score: score };
  } catch(e) { return { ok: true, pair: pair, score: pair === 'karl_mamta' ? 20 : 0 }; }
}

function chatSetRelScore(pair, score) {
  try {
    score = Math.max(0, Math.min(100, Number(score) || 0));
    PropertiesService.getScriptProperties().setProperty('chat_rel_' + plantosSafeStr_(String(pair)), String(score));
    return { ok: true, pair: pair, score: score };
  } catch(e) { return { ok: false, error: e.message }; }
}

function chatGenerateLatinNarration(karlText, mamtaText) {
  try {
    var key = PropertiesService.getUserProperties().getProperty('ANTHROPIC_API_KEY');
    if (!key) return { ok: false };
    var prompt = "You are Carl Linnaeus — the REAL 18th century botanist, not the app character. You have been silently watching two souls named Karl (a crude Jersey wiseguy) and Mamta (a confused Indian mother) fall for each other inside a plant app. Karl just said: \"" + String(karlText).substring(0,200) + "\" and Mamta said or was involved: \"" + String(mamtaText).substring(0,200) + "\". Write a dramatic 1-2 sentence Latin quote about love, botanical passion, or romance blooming in a digital garden — followed by the English translation in parentheses. Be theatrical, poetic, and slightly ridiculous. Example: 'Amor floret inter spinas digitales. (Love blooms among the digital thorns.)' Return ONLY the quote, nothing else.";
    var payload = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    };
    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    var body = JSON.parse(resp.getContentText());
    var text = body.content && body.content[0] && body.content[0].text;
    if (!text) return { ok: false };
    return { ok: true, text: text.trim() };
  } catch(e) { return { ok: false }; }
}

function chatGenerateLoreMessage(charId, loreContext) {
  try {
    var key = PropertiesService.getUserProperties().getProperty('ANTHROPIC_API_KEY');
    if (!key) return { ok: false, skip: true };
    var tsKey = 'chat_lore_' + plantosSafeStr_(String(charId));
    var lastTs = PropertiesService.getUserProperties().getProperty(tsKey);
    if (lastTs && (Date.now() - Number(lastTs)) < 3600000 * 6) return { ok: false, skip: true };
    if (Math.random() > 0.25) return { ok: false, skip: true };
    var prompt = String(loreContext);
    if (!prompt) return { ok: false, skip: true };
    var payload = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    };
    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    var body = JSON.parse(resp.getContentText());
    var text = body.content && body.content[0] && body.content[0].text;
    if (!text) return { ok: false };
    PropertiesService.getUserProperties().setProperty(tsKey, String(Date.now()));
    return { ok: true, charId: charId, text: text.trim() };
  } catch(e) { return { ok: false, error: e.message }; }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

