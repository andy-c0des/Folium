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
        try { const qrFile = plantosEnsurePlantQr_(qrRoot, uid, primary, plantPageUrl); row[qrFileIdCol] = qrFile.getId(); } catch (e) {}
      }
      if (qrUrlCol >= 0 && !plantosSafeStr_(row[qrUrlCol]).trim()) row[qrUrlCol] = plantPageUrl;
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
