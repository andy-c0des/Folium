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
    const t = HtmlService.createTemplateFromFile('App')
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

/* ===================== REST API (doPost) ===================== */

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
  if (extraFields.salePrice) entry.salePrice = extraFields.salePrice;
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
  const allowed = ['genus','species','propType','type','substrate','startDate','notes','parentUID','siblingPropIds',
                   'nothospecies','nothospeciesEpithet','nothogenus','generation','hybridType',
                   'isIntrageneric','generationConfirmed',
                   'motherUid','motherUID','fatherUid','fatherUID','pollinationMethod',
                   'crossDate','motherGenus','motherSpecies','motherFreetext',
                   'fatherGenus','fatherSpecies','fatherFreetext'];
  var boolFields = { hybridType: true, isIntrageneric: true, generationConfirmed: true };
  allowed.forEach(function(k) {
    if (k in patch && patch[k] !== null && patch[k] !== undefined) {
      props[idx][k] = boolFields[k] ? !!(patch[k]) : plantosSafeStr_(patch[k]).trim();
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
