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
    plantosTimelineAppend_(uid, label ? { fertilize: true, notes: label } : { fertilize: true }, now);
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
  };
}

/* ===================== TIMELINE STORAGE ===================== */

function plantosTimelineAppend_(uid, payload, when) {
  const key = 'PLANT_TIMELINE::' + uid;
  let items = [];
  try { items = JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || '[]'); } catch (e) {}
  const ts = Utilities.formatDate(when, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const action = payload.repot ? 'REPOT' : payload.water && payload.fertilize ? 'WATERED+FERTILIZED' : payload.water ? 'WATERED' : payload.fertilize ? 'FERTILIZED' : 'UPDATE';
  let details = '';
  if (payload.repot) details = `Pot: ${payload.potSize || ''} • Substrate: ${payload.substrate || ''}`;
  if (payload.notes) details = (details ? details + ' • ' : '') + payload.notes;
  items.unshift({ uid, ts, action, details });
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(items.slice(0, 120)));
}
