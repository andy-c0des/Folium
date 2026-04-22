/* ===================== WEB APP ROUTING ===================== */

/* ── Multi-user context (set per doPost request) ── */
var _currentUser = null;

function plantosUserKey_(baseKey) {
  if (!_currentUser || _currentUser.isAdmin) return baseKey;
  return baseKey + '_USR_' + _currentUser.username.toUpperCase();
}

function plantosHashPassword_(password, salt) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + salt);
  return digest.map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function plantosGenerateSalt_() { return Utilities.getUuid().replace(/-/g, ''); }

var PLANTOS_USERS_KEY     = 'PLANTOS_USERS_V2';
var PLANTOS_SESSIONS_KEY  = 'PLANTOS_SESSIONS_V2';

function plantosGetUsers_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(PLANTOS_USERS_KEY) || '[]'); } catch(e) { return []; }
}

function plantosGetSessions_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(PLANTOS_SESSIONS_KEY) || '{}'); } catch(e) { return {}; }
}

/* Public: called from doPost without auth (login endpoint) */
function plantosLogin(username, password) {
  var users = plantosGetUsers_();
  var user = null;
  for (var i = 0; i < users.length; i++) {
    if ((users[i].username || '').toLowerCase() === (username || '').toLowerCase()) { user = users[i]; break; }
  }
  if (!user) return { ok: false, error: 'Invalid username or password' };
  var hash = plantosHashPassword_(password || '', user.salt || '');
  if (hash !== user.passwordHash) return { ok: false, error: 'Invalid username or password' };
  var token = Utilities.getUuid();
  var sessions = plantosGetSessions_();
  var now = Date.now();
  var pruned = {};
  Object.keys(sessions).forEach(function(t) { if (now - sessions[t].created < 30 * 24 * 3600 * 1000) pruned[t] = sessions[t]; });
  pruned[token] = { username: user.username, isAdmin: !!user.isAdmin, inventorySheet: user.inventorySheet || null, created: now };
  PropertiesService.getScriptProperties().setProperty(PLANTOS_SESSIONS_KEY, JSON.stringify(pruned));
  return { ok: true, token: token, username: user.username };
}

/* Run once from the GAS editor to create/update a user account */
function plantosSetupUser(username, password, isAdmin) {
  var users = plantosGetUsers_().filter(function(u) { return (u.username || '').toLowerCase() !== (username || '').toLowerCase(); });
  var salt = plantosGenerateSalt_();
  users.push({
    username: username,
    passwordHash: plantosHashPassword_(password, salt),
    salt: salt,
    isAdmin: !!isAdmin,
    inventorySheet: isAdmin ? PLANTOS_BACKEND_CFG.INVENTORY_SHEET : username + ' - ' + PLANTOS_BACKEND_CFG.INVENTORY_SHEET
  });
  PropertiesService.getScriptProperties().setProperty(PLANTOS_USERS_KEY, JSON.stringify(users));
  return { ok: true, message: 'User ' + username + ' set up successfully' };
}

/* Run once to create Tony's inventory sheet tab (copy headers from Andy's) */
function plantosSetupUserSheet(username) {
  var targetName = username + ' - ' + PLANTOS_BACKEND_CFG.INVENTORY_SHEET;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(targetName)) return { ok: true, message: 'Sheet already exists: ' + targetName };
  var src = ss.getSheetByName(PLANTOS_BACKEND_CFG.INVENTORY_SHEET);
  if (!src) return { ok: false, error: 'Source sheet not found' };
  var newSh = ss.insertSheet(targetName);
  var headers = src.getRange(1, 1, 1, src.getLastColumn()).getValues();
  newSh.getRange(1, 1, 1, headers[0].length).setValues(headers);
  return { ok: true, message: 'Created sheet: ' + targetName };
}

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

    // Login — no auth required
    if (fn === 'plantosLogin') {
      var loginResult = plantosLogin(args[0], args[1]);
      return ContentService.createTextOutput(JSON.stringify(loginResult)).setMimeType(ContentService.MimeType.JSON);
    }

    // Validate session token and set user context
    var sessions = plantosGetSessions_();
    var session = sessions[token];
    if (!session) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
    }
    _currentUser = session;

    // Dispatch map
    var dispatch = {
      plantosHome: plantosHome,
      plantosDashboard: plantosDashboard,
      plantosGetSales: plantosGetSales,
      plantosCreateSale: plantosCreateSale,
      plantosUpdateSale: plantosUpdateSale,
      plantosUpdateSaleStatus: plantosUpdateSaleStatus,
      plantosDeleteSale: plantosDeleteSale,
      plantosBackfillSalesFromArchive: plantosBackfillSalesFromArchive,
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
      plantosUploadPropPhoto: plantosUploadPropPhoto,
      plantosGraduateProp: plantosGraduateProp,
      plantosSellProp: plantosSellProp,
      plantosGetGrafts: plantosGetGrafts,
      plantosGetGraftTimeline: plantosGetGraftTimeline,
      plantosCreateGraft: plantosCreateGraft,
      plantosUpdateGraftStatus: plantosUpdateGraftStatus,
      plantosUpdateGraft: plantosUpdateGraft,
      plantosAddGraftNote: plantosAddGraftNote,
      plantosUploadGraftPhoto: plantosUploadGraftPhoto,
      plantosGraduateGraft: plantosGraduateGraft,
      plantosSellGraft: plantosSellGraft,
      plantosMigrateGraftsFromProps: plantosMigrateGraftsFromProps,
      plantosLogin: plantosLogin,
      plantosGetWishlist: plantosGetWishlist,
      plantosAddToWishlist: plantosAddToWishlist,
      plantosRemoveFromWishlist: plantosRemoveFromWishlist,
      plantosUpdateWishlistItem: plantosUpdateWishlistItem,
      plantosListPublicUsers: plantosListPublicUsers,
      plantosGetFriendships: plantosGetFriendships,
      plantosSendFriendRequest: plantosSendFriendRequest,
      plantosRespondFriendRequest: plantosRespondFriendRequest,
      plantosRemoveFriend: plantosRemoveFriend,
      plantosGetFriendsOverview: plantosGetFriendsOverview,
      plantosGetFriendGarden: plantosGetFriendGarden,
      plantosGetFriendPlantDetail: plantosGetFriendPlantDetail,
      plantosGetPlantNotesForGarden: plantosGetPlantNotesForGarden,
      plantosAddPlantNote: plantosAddPlantNote,
      plantosGetNotesOnMyPlants: plantosGetNotesOnMyPlants,
      plantosGetFriendsFeed: plantosGetFriendsFeed,
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
  const key = plantosUserKey_('PLANTOS_CUSTOM_LOCATIONS');
  let list = [];
  try { list = JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || '[]'); } catch(e) {}
  if (!list.includes(n)) { list.push(n); list.sort((a, b) => a.localeCompare(b)); PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(list)); }
  return { ok: true };
}

/* ===================== ENVIRONMENTS ===================== */

const PLANTOS_ENVS_KEY = 'PLANTOS_ENVIRONMENTS';
const PLANTOS_LOC_ENV_MAP_KEY = 'PLANTOS_LOC_ENV_MAP';
const PLANTOS_LOC_CONDITIONS_KEY = 'PLANTOS_LOC_CONDITIONS';

function plantosGetEnvironments() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(plantosUserKey_(PLANTOS_ENVS_KEY)) || '[]'); } catch(e) { return []; } }

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
  PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_ENVS_KEY), JSON.stringify(list));
  return { ok: true, envId: env.envId };
}

function plantosDeleteEnvironment(envId) {
  const id = plantosSafeStr_(envId).trim();
  if (!id) return { ok: false, error: 'envId required' };
  let list = plantosGetEnvironments().filter(e => e.envId !== id);
  PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_ENVS_KEY), JSON.stringify(list));
  const locMap = plantosGetLocationEnvMap();
  Object.keys(locMap).forEach(loc => { if (locMap[loc] === id) delete locMap[loc]; });
  PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_LOC_ENV_MAP_KEY), JSON.stringify(locMap));
  return { ok: true };
}

function plantosGetLocationEnvMap() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(plantosUserKey_(PLANTOS_LOC_ENV_MAP_KEY)) || '{}'); } catch(e) { return {}; } }

function plantosSetLocationEnv(locationName, envId) {
  const loc = plantosSafeStr_(locationName).trim();
  if (!loc) return { ok: false, error: 'locationName required' };
  const map = plantosGetLocationEnvMap();
  if (envId) map[loc] = plantosSafeStr_(envId).trim(); else delete map[loc];
  PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_LOC_ENV_MAP_KEY), JSON.stringify(map));
  return { ok: true };
}

/* ===================== FIX #4: Location conditions ===================== */
function plantosGetLocationConditions() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(plantosUserKey_(PLANTOS_LOC_CONDITIONS_KEY)) || '{}'); } catch(e) { return {}; } }

function plantosSetLocationCondition(locationName, vals) {
  const loc = plantosSafeStr_(locationName).trim();
  if (!loc) return { ok: false, error: 'locationName required' };
  const conditions = plantosGetLocationConditions();
  conditions[loc] = Object.assign(conditions[loc] || {}, vals || {});
  PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_LOC_CONDITIONS_KEY), JSON.stringify(conditions));
  return { ok: true };
}

/* ===================== ARCHIVE ===================== */

const PLANTOS_ARCHIVE_KEY = 'PLANTOS_ARCHIVE';

function plantosGetArchive() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(plantosUserKey_(PLANTOS_ARCHIVE_KEY)) || '[]'); } catch(e) { return []; } }

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
  PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_ARCHIVE_KEY), JSON.stringify(archive));
  if (rowIdx >= 0) sh.deleteRow(rowIdx + 1);
  return { ok: true };
}

function plantosUpdateArchiveNote(id, note) {
  const archive = plantosGetArchive();
  const idx = archive.findIndex(e => e.id === plantosSafeStr_(id).trim());
  if (idx < 0) return { ok: false, error: 'Not found' };
  archive[idx].note = plantosSafeStr_(note).trim();
  PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_ARCHIVE_KEY), JSON.stringify(archive));
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

function plantosGetProps() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(plantosUserKey_(PLANTOS_PROPS_KEY)) || '[]'); } catch(e) { return []; } }

function plantosGetPropTimeline(propId) {
  const key = plantosUserKey_(PLANTOS_PROP_TIMELINES_KEY) + '::' + plantosSafeStr_(propId).trim();
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
    isGraft: !!(payload.isGraft),
    scionGenus: plantosSafeStr_(payload.scionGenus || '').trim(),
    scionSpecies: plantosSafeStr_(payload.scionSpecies || '').trim(),
    rootstockGenus: plantosSafeStr_(payload.rootstockGenus || '').trim(),
    rootstockSpecies: plantosSafeStr_(payload.rootstockSpecies || '').trim(),
    graftTechnique: plantosSafeStr_(payload.graftTechnique || '').trim(),
  };
  props.unshift(prop);
  PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_PROPS_KEY), JSON.stringify(props));
  var createDetail = prop.isGraft ? ('Graft started — ' + (prop.graftTechnique || 'Graft')) : (propType || 'Prop') + ' started';
  plantosPropTimelineAppend_(propId, { action: 'CREATED', details: createDetail });
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
  PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_PROPS_KEY), JSON.stringify(props));
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
  PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_PROPS_KEY), JSON.stringify(props));
  plantosPropTimelineAppend_(id, { action: 'STATUS', details: 'Graduated → UID ' + result.uid });
  return { ok: true, uid: result.uid };
}

function plantosSellProp(propId, priceSold) {
  const id = plantosSafeStr_(propId).trim();
  const props = plantosGetProps();
  const idx = props.findIndex(p => p.propId === id);
  if (idx < 0) return { ok: false, error: 'Prop not found' };
  props[idx].status = 'Sold';
  props[idx].priceSold = plantosSafeStr_(String(priceSold || '')).trim();
  props[idx].soldDate = Utilities.formatDate(plantosNow_(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_PROPS_KEY), JSON.stringify(props));
  const priceStr = props[idx].priceSold ? ` for ${props[idx].priceSold}` : '';
  plantosPropTimelineAppend_(id, { action: 'SOLD', details: `Prop sold${priceStr}.` });
  // Mirror into Sales Tracker (idempotent — skips if already exists for this propId)
  try { if (typeof salesCreateFromProp_ === 'function') salesCreateFromProp_(props[idx]); } catch(e) { /* Sales.gs may be absent */ }
  return { ok: true };
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
                   'fatherGenus','fatherSpecies','fatherFreetext',
                   'isGraft','scionGenus','scionSpecies','rootstockGenus','rootstockSpecies','graftTechnique'];
  var boolFields = { hybridType: true, isIntrageneric: true, generationConfirmed: true };
  allowed.forEach(function(k) {
    if (k in patch && patch[k] !== null && patch[k] !== undefined) {
      props[idx][k] = boolFields[k] ? !!(patch[k]) : plantosSafeStr_(patch[k]).trim();
    }
  });
  PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_PROPS_KEY), JSON.stringify(props));
  plantosPropTimelineAppend_(id, { action: 'UPDATE', details: 'Edited: ' + Object.keys(patch).filter(k => allowed.includes(k)).join(', ') });
  return { ok: true };
}

function plantosPropTimelineAppend_(propId, entry) {
  const key = plantosUserKey_(PLANTOS_PROP_TIMELINES_KEY) + '::' + propId;
  let items = [];
  try { items = JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || '[]'); } catch(e) {}
  const ts = Utilities.formatDate(plantosNow_(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  items.unshift(Object.assign({ ts }, entry));
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(items.slice(0, 100)));
}

/* ===================== GRAFTS (siloed from Props) ===================== */

const PLANTOS_GRAFTS_KEY = 'PLANTOS_GRAFTS';
const PLANTOS_GRAFT_TIMELINES_KEY = 'PLANTOS_GRAFT_TIMELINES';

function plantosGetGrafts() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(plantosUserKey_(PLANTOS_GRAFTS_KEY)) || '[]'); } catch(e) { return []; }
}

function plantosGetGraftTimeline(graftId) {
  const key = plantosUserKey_(PLANTOS_GRAFT_TIMELINES_KEY) + '::' + plantosSafeStr_(graftId).trim();
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || '[]'); } catch(e) { return []; }
}

function plantosCreateGraft(payload) {
  payload = payload || {};
  const grafts = plantosGetGrafts();
  const graftId = 'GRAFT_' + Date.now();
  var startDate = plantosSafeStr_(payload.startDate || '').trim() || plantosFmtDate_(plantosNow_());
  const graft = {
    graftId,
    scionGenus:       plantosSafeStr_(payload.scionGenus || '').trim(),
    scionSpecies:     plantosSafeStr_(payload.scionSpecies || '').trim(),
    rootstockGenus:   plantosSafeStr_(payload.rootstockGenus || '').trim(),
    rootstockSpecies: plantosSafeStr_(payload.rootstockSpecies || '').trim(),
    graftTechnique:   plantosSafeStr_(payload.graftTechnique || '').trim(),
    scionUID:         plantosSafeStr_(payload.scionUID || '').trim(),
    rootstockUID:     plantosSafeStr_(payload.rootstockUID || '').trim(),
    notes:            plantosSafeStr_(payload.notes || '').trim(),
    status: 'Trying',
    createdAt: plantosFmtDate_(plantosNow_()),
    startDate: startDate,
  };
  grafts.unshift(graft);
  PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_GRAFTS_KEY), JSON.stringify(grafts));
  plantosGraftTimelineAppend_(graftId, { action: 'CREATED', details: 'Graft started — ' + (graft.graftTechnique || 'Graft') });
  return { ok: true, graftId };
}

function plantosUpdateGraftStatus(graftId, status, failCause, failCauseDetail) {
  const id = plantosSafeStr_(graftId).trim();
  const grafts = plantosGetGrafts();
  const idx = grafts.findIndex(g => g.graftId === id);
  if (idx < 0) return { ok: false, error: 'Graft not found' };
  grafts[idx].status = plantosSafeStr_(status).trim();
  if (failCause) grafts[idx].failCause = plantosSafeStr_(failCause).trim();
  if (failCauseDetail) grafts[idx].failCauseDetail = plantosSafeStr_(failCauseDetail).trim();
  PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_GRAFTS_KEY), JSON.stringify(grafts));
  var details = failCause ? `${status} — ${failCause}` : status;
  if (failCauseDetail) details += ': ' + failCauseDetail;
  plantosGraftTimelineAppend_(id, { action: 'STATUS', details });
  return { ok: true };
}

function plantosAddGraftNote(graftId, note, photoUrl) {
  const id = plantosSafeStr_(graftId).trim();
  const grafts = plantosGetGrafts();
  const idx = grafts.findIndex(g => g.graftId === id);
  if (idx < 0) return { ok: false, error: 'Graft not found' };
  plantosGraftTimelineAppend_(id, { action: photoUrl ? 'PHOTO' : 'NOTE', details: plantosSafeStr_(note || '').trim(), photoUrl: photoUrl || '' });
  return { ok: true };
}

function plantosUploadGraftPhoto(graftId, dataUrl, originalName) {
  // Reuse the same Drive upload logic as prop photos, stored under graft folder
  const id = plantosSafeStr_(graftId).trim();
  const grafts = plantosGetGrafts();
  const idx = grafts.findIndex(g => g.graftId === id);
  if (idx < 0) return { ok: false, error: 'Graft not found' };
  try {
    var folderName = 'PlantOS Graft Photos';
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    var safeName = plantosSafeStr_(originalName || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
    var blob = Utilities.newBlob(Utilities.base64Decode(dataUrl.replace(/^data:[^;]+;base64,/, '')), 'image/jpeg', safeName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var fileId = file.getId();
    var thumbUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w600';
    var viewUrl  = 'https://drive.google.com/file/d/' + fileId + '/view';
    plantosGraftTimelineAppend_(id, { action: 'PHOTO', details: '', photoUrl: thumbUrl, viewUrl });
    return { ok: true, thumbUrl, viewUrl };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

function plantosGraduateGraft(graftId, plantPayload) {
  const id = plantosSafeStr_(graftId).trim();
  const grafts = plantosGetGrafts();
  const idx = grafts.findIndex(g => g.graftId === id);
  if (idx < 0) throw new Error('Graft not found');
  const graft = grafts[idx];
  const result = plantosCreatePlant(Object.assign({
    genus: graft.scionGenus,
    taxon: graft.scionSpecies,
    parentPropId: id
  }, plantPayload || {}));
  if (!result.ok) throw new Error('Failed to create plant from graft');
  grafts[idx].status = 'Graduated';
  grafts[idx].graduatedUID = result.uid;
  PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_GRAFTS_KEY), JSON.stringify(grafts));
  plantosGraftTimelineAppend_(id, { action: 'STATUS', details: 'Graduated → UID ' + result.uid });
  return { ok: true, uid: result.uid };
}

function plantosSellGraft(graftId, priceSold) {
  const id = plantosSafeStr_(graftId).trim();
  const grafts = plantosGetGrafts();
  const idx = grafts.findIndex(g => g.graftId === id);
  if (idx < 0) return { ok: false, error: 'Graft not found' };
  grafts[idx].status = 'Sold';
  grafts[idx].priceSold = plantosSafeStr_(String(priceSold || '')).trim();
  grafts[idx].soldDate = Utilities.formatDate(plantosNow_(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_GRAFTS_KEY), JSON.stringify(grafts));
  const priceStr = grafts[idx].priceSold ? ` for ${grafts[idx].priceSold}` : '';
  plantosGraftTimelineAppend_(id, { action: 'SOLD', details: `Graft sold${priceStr}.` });
  // Mirror into Sales Tracker (idempotent — skips if already exists for this graftId)
  try { if (typeof salesCreateFromGraft_ === 'function') salesCreateFromGraft_(grafts[idx]); } catch(e) { /* Sales.gs may be absent */ }
  return { ok: true };
}

function plantosUpdateGraft(graftId, patch) {
  const id = plantosSafeStr_(graftId).trim();
  if (!id) throw new Error('Missing graftId');
  patch = patch || {};
  const grafts = plantosGetGrafts();
  const idx = grafts.findIndex(g => g.graftId === id);
  if (idx < 0) return { ok: false, error: 'Graft not found' };
  const allowed = ['scionGenus','scionSpecies','rootstockGenus','rootstockSpecies','graftTechnique','scionUID','rootstockUID','notes','startDate'];
  allowed.forEach(function(k) {
    if (k in patch && patch[k] !== null && patch[k] !== undefined) {
      grafts[idx][k] = plantosSafeStr_(patch[k]).trim();
    }
  });
  PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_GRAFTS_KEY), JSON.stringify(grafts));
  plantosGraftTimelineAppend_(id, { action: 'UPDATE', details: 'Edited: ' + Object.keys(patch).filter(k => allowed.includes(k)).join(', ') });
  return { ok: true };
}

function plantosGraftTimelineAppend_(graftId, entry) {
  const key = plantosUserKey_(PLANTOS_GRAFT_TIMELINES_KEY) + '::' + graftId;
  let items = [];
  try { items = JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || '[]'); } catch(e) {}
  const ts = Utilities.formatDate(plantosNow_(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  items.unshift(Object.assign({ ts }, entry));
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(items.slice(0, 100)));
}

/* ── Run once from GAS editor to move existing isGraft=true props → grafts store ── */
function plantosMigrateGraftsFromProps() {
  var users = plantosGetUsers_();
  var results = [];
  users.forEach(function(user) {
    _currentUser = { username: user.username, isAdmin: !!user.isAdmin };
    var props   = plantosGetProps();
    var grafts  = plantosGetGrafts();
    var toMigrate = props.filter(function(p) { return p.isGraft || p.propType === 'Graft'; });
    var remaining = props.filter(function(p) { return !p.isGraft && p.propType !== 'Graft'; });
    toMigrate.forEach(function(p) {
      var graft = {
        graftId:         p.propId,  // keep same ID so timelines still match
        scionGenus:      p.scionGenus || p.genus || '',
        scionSpecies:    p.scionSpecies || p.species || '',
        rootstockGenus:  p.rootstockGenus || '',
        rootstockSpecies:p.rootstockSpecies || '',
        graftTechnique:  p.graftTechnique || '',
        scionUID:        p.parentUID || '',
        rootstockUID:    '',
        notes:           p.notes || '',
        status:          p.status || 'Trying',
        createdAt:       p.createdAt || '',
        startDate:       p.startDate || p.createdAt || '',
        graduatedUID:    p.graduatedUID || '',
        failCause:       p.failCause || '',
        failCauseDetail: p.failCauseDetail || '',
        priceSold:       p.priceSold || '',
        soldDate:        p.soldDate || '',
      };
      grafts.unshift(graft);
      // Migrate timeline: copy from PLANTOS_PROP_TIMELINES → PLANTOS_GRAFT_TIMELINES
      var oldTlKey = plantosUserKey_(PLANTOS_PROP_TIMELINES_KEY) + '::' + p.propId;
      var newTlKey = plantosUserKey_(PLANTOS_GRAFT_TIMELINES_KEY) + '::' + p.propId;
      var tl = PropertiesService.getScriptProperties().getProperty(oldTlKey);
      if (tl) PropertiesService.getScriptProperties().setProperty(newTlKey, tl);
    });
    PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_PROPS_KEY),   JSON.stringify(remaining));
    PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_GRAFTS_KEY), JSON.stringify(grafts));
    results.push({ user: user.username, migrated: toMigrate.length });
  });
  _currentUser = null;
  return { ok: true, results };
}
