/* ===================== PLANT GIFTS / TRANSFERS =====================
   Gift a plant to a friend:
   - Full row data is copied into the recipient's inventory sheet (new UID)
   - All Drive photos are copied into the recipient's plant photo folder
   - Latest-photo thumb/view cells are stamped on the new row
   - A timeline entry is written under the new UID ("🎁 Gifted by @X ...")
   - The original plant is archived on the giver's side with type='gifted'
   A best-effort Supabase log is written to `plant_gifts` if the table exists.
*/

function plantosGiftPlant(plantUid, recipientUserId, message) {
  var me = plantosSocialUserId_();
  var rcpt = String(recipientUserId || '').trim().toLowerCase();
  var uid = String(plantUid || '').trim();
  var msg = String(message || '').trim();
  if (!uid) return { ok: false, error: 'plantId required' };
  if (!rcpt) return { ok: false, error: 'recipientId required' };
  if (rcpt === me) return { ok: false, error: 'You cannot gift a plant to yourself.' };
  plantosEnsureFriends_(rcpt);

  // 1. Read the full plant from the giver's sheet (while _currentUser is still me).
  var plantRes = plantosGetPlant(uid);
  if (!plantRes || !plantRes.ok) return { ok: false, error: (plantRes && plantRes.reason) || 'Plant not found' };
  var plant = plantRes.plant;

  // 2. List all Drive photos on the giver's side.
  var photos = [];
  try {
    var photosRes = plantosGetAllPhotos(uid);
    photos = (photosRes && photosRes.photos) || [];
  } catch (e) { photos = []; }

  // 3. Look up recipient user record.
  var rcptUser = plantosGetUserById_(rcpt);
  if (!rcptUser) return { ok: false, error: 'Recipient user not found' };

  // 4. Build the create-payload from the plant (strip UID & anything user-specific).
  var payload = {
    nickname:          plant.nickname || '',
    genus:             plant.genus || '',
    taxon:             plant.taxon || plant.species || '',
    taxonRaw:          plant.taxonRaw || plant.taxon || plant.species || '',
    location:          plant.location || '',
    substrate:         plant.substrate || plant.medium || '',
    medium:            plant.medium || plant.substrate || '',
    growingMethod:     plant.growingMethod || '',
    semiHydroFertMode: plant.semiHydroFertMode || '',
    flushEveryN:       plant.flushEveryN || '',
    birthday:          plant.birthday || '',
    potSize:           plant.potSize || '',
    potMaterial:       plant.potMaterial || '',
    potShape:          plant.potShape || '',
    waterEveryDays:    plant.waterEveryDays || plant.everyDays || '',
    fertEveryDays:     plant.fertEveryDays || plant.fertilizeEveryDays || '',
    purchasePrice:     plant.purchasePrice || '',
    cultivar:          plant.cultivar || '',
    hybridNote:        plant.hybridNote || '',
    infraRank:         plant.infraRank || '',
    infraEpithet:      plant.infraEpithet || ''
  };

  // 5. Switch context to recipient, create plant + copy photos.
  var meBackup = _currentUser;
  var newUid = null;
  var copiedPhotoCount = 0;
  var latestThumbUrl = '';
  var latestViewUrl = '';
  var createErr = null;
  try {
    _currentUser = {
      username: rcptUser.username,
      isAdmin: !!rcptUser.isAdmin,
      inventorySheet: rcptUser.inventorySheet || (rcptUser.isAdmin ? PLANTOS_BACKEND_CFG.INVENTORY_SHEET : rcptUser.username + ' - ' + PLANTOS_BACKEND_CFG.INVENTORY_SHEET)
    };

    var created = plantosCreatePlant(payload);
    if (!created || !created.uid) throw new Error('Could not create plant in recipient sheet.');
    newUid = created.uid;

    // Copy photos into the recipient's new plant folder
    if (photos.length) {
      var plantsRoot = plantosGetPlantsRoot_();
      var newPlantFolder = plantosResolveOrCreatePlantFolder_(plantsRoot, newUid);
      var newPhotosFolder = plantosEnsureSubfolder_(newPlantFolder, PLANTOS_BACKEND_CFG.PHOTOS_SUBFOLDER);
      var copies = [];
      photos.forEach(function(ph) {
        try {
          var srcFile = DriveApp.getFileById(ph.fileId);
          var copyName = srcFile.getName();
          var cp = srcFile.makeCopy(copyName, newPhotosFolder);
          // Copies do NOT inherit sharing — explicitly make publicly viewable so
          // drive.google.com/thumbnail renders in any browser session.
          try { cp.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (esh) {}
          copies.push({ file: cp, fileId: cp.getId(), name: copyName, updated: (cp.getLastUpdated ? cp.getLastUpdated() : new Date()).toISOString() });
          copiedPhotoCount++;
        } catch (ep) {
          Logger.log('[Gift] photo copy failed: ' + (ep && ep.message ? ep.message : String(ep)));
        }
      });
      // Stamp the Latest Photo columns on the new row to the most-recent copy
      if (copies.length) {
        copies.sort(function(a, b) { return b.updated < a.updated ? -1 : b.updated > a.updated ? 1 : 0; });
        var primary = copies[0];
        latestViewUrl  = primary.file.getUrl();
        latestThumbUrl = plantosDriveThumbUrl_(primary.fileId, 300);
        try {
          plantosWriteLatestPhotoToSheet_(newUid, { fileId: primary.fileId, viewUrl: latestViewUrl, thumbUrl: latestThumbUrl, name: primary.name, updated: primary.updated });
        } catch (ew) {}
      }
    }

    // Timeline entry on the new plant ("Gifted by @me [message]")
    try {
      plantosTimelineAppend_(newUid, {
        notes: '🎁 Gifted by @' + me + (msg ? ' — ' + msg : '')
      }, new Date());
    } catch (et) {}

  } catch (e) {
    createErr = e && e.message ? e.message : String(e);
  } finally {
    _currentUser = meBackup;
  }
  if (createErr) return { ok: false, error: createErr };

  // 6. Archive the plant on the giver's side (deletes the row + saves to archive).
  try {
    plantosArchivePlant(uid, 'gifted', 'Gifted to friend',
      '@' + (rcptUser.username || rcpt) + (msg ? ': ' + msg : ''),
      { rehomeDate: plantosFmtDate_(plantosNow_()), note: '🎁 Gifted to @' + (rcptUser.username || rcpt) + (msg ? '\n\n' + msg : '') });
  } catch (ea) {
    // If archive fails, we still return success for the transfer — but include a warning.
    return {
      ok: true, newUid: newUid, photoCount: copiedPhotoCount,
      recipientUsername: rcptUser.username || rcpt,
      warning: 'Plant was transferred but could not be archived on your side: ' + (ea && ea.message ? ea.message : String(ea))
    };
  }

  // 7. Best-effort Supabase gift log (no-op if table missing).
  try {
    plantosSupabaseRequest_('post', 'plant_gifts', {
      giver_id: me,
      recipient_id: rcpt,
      original_uid: uid,
      new_uid: newUid,
      plant_name: plant.nickname || plant.primary || uid,
      message: msg,
      photo_count: copiedPhotoCount
    });
  } catch (elog) { /* non-fatal */ }

  return {
    ok: true,
    newUid: newUid,
    photoCount: copiedPhotoCount,
    recipientUsername: rcptUser.username || rcpt
  };
}

/* ===================== PHOTO SHARING REPAIR =====================
   Walks every plant + prop + graft photo folder under the Drive root and sets
   ANYONE_WITH_LINK view sharing on each image. Run once from the Apps Script
   editor (or via the Dev Tools button below) to fix historic photos that
   weren't made public at upload time — those are why friend gardens show
   broken thumbnails for viewers who aren't logged into the owner Google account.

   Idempotent. Limited to 6 minutes of Apps Script execution — if you have a huge
   Drive, you may need to run it more than once.
*/
function plantosRepairPhotoSharing(cursor) {
  // Paginated: each invocation runs at most ~20s (well under the 30s client
  // gasCall timeout). First call (empty cursor) builds the folder list and
  // caches it; subsequent calls resume from the cached list at `nextCursor`.
  // Client loops until result.done === true.
  cursor = String(cursor || '');
  var CACHE_KEY = 'folium_repair_folder_list_v1';
  var scriptCache = CacheService.getScriptCache();
  var folderIds = null;

  var diagRootName = '', diagRootId = '', diagSampleNames = [];

  // On fresh start, (re)build the folder list.
  if (!cursor || cursor === 'restart') {
    folderIds = [];
    var root = plantosGetPlantsRoot_();
    diagRootId = root.getId();
    diagRootName = root.getName();
    var it = root.getFolders();
    while (it.hasNext()) {
      var f = it.next();
      folderIds.push(f.getId());
      if (diagSampleNames.length < 5) diagSampleNames.push(f.getName());
    }
    try {
      // Split across multiple keys if > ~90KB (cache value limit 100KB)
      var ser = JSON.stringify(folderIds);
      scriptCache.put(CACHE_KEY, ser.length < 95000 ? ser : '', 1800); // 30-min TTL
    } catch (e) {}
    cursor = '0';
  } else {
    var cached = scriptCache.get(CACHE_KEY);
    if (cached) { try { folderIds = JSON.parse(cached); } catch (e) { folderIds = null; } }
    if (!folderIds) {
      // Cache expired or unsaved — rebuild (one-time extra work).
      folderIds = [];
      var root2 = plantosGetPlantsRoot_();
      var it2 = root2.getFolders();
      while (it2.hasNext()) folderIds.push(it2.next().getId());
      try {
        var ser2 = JSON.stringify(folderIds);
        scriptCache.put(CACHE_KEY, ser2.length < 95000 ? ser2 : '', 1800);
      } catch (e) {}
    }
  }

  var startMs = Date.now();
  var softStop = 20 * 1000; // leave margin under client's 30s timeout
  var startIdx = parseInt(cursor, 10) || 0;
  var fixed = 0, skipped = 0, errors = 0, foldersScanned = 0;
  var i = startIdx;
  for (; i < folderIds.length; i++) {
    if (Date.now() - startMs > softStop) break;
    try {
      var plantFolder = DriveApp.getFolderById(folderIds[i]);
      var photosIter = plantFolder.getFoldersByName(PLANTOS_BACKEND_CFG.PHOTOS_SUBFOLDER);
      while (photosIter.hasNext()) {
        if (Date.now() - startMs > softStop) break;
        var photosFolder = photosIter.next();
        var files = photosFolder.getFiles();
        while (files.hasNext()) {
          if (Date.now() - startMs > softStop) break;
          var f = files.next();
          try {
            var mt = f.getMimeType ? f.getMimeType() : '';
            if (mt && mt.indexOf('image/') !== 0) { skipped++; continue; }
            var access = f.getSharingAccess();
            if (access === DriveApp.Access.ANYONE_WITH_LINK || access === DriveApp.Access.ANYONE) {
              skipped++;
            } else {
              f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
              fixed++;
            }
          } catch (e) { errors++; }
        }
      }
      foldersScanned++;
    } catch (e) {
      errors++;
      Logger.log('[repair] folder err idx=' + i + ': ' + (e && e.message));
    }
  }

  var done = i >= folderIds.length;
  return {
    ok: true,
    fixed: fixed,
    skipped: skipped,
    errors: errors,
    foldersScanned: foldersScanned,
    totalFolders: folderIds.length,
    nextCursor: done ? '' : String(i),
    done: done,
    ms: Date.now() - startMs,
    // Diagnostics for when totalFolders is surprisingly 0
    diagRootId: diagRootId,
    diagRootName: diagRootName,
    diagSampleNames: diagSampleNames
  };
}

/* Diagnostic helper — lists the Drive hierarchy to trace where photos actually
   live. Run from Dev Tools. Returns root + up to 10 subfolder names + for one
   of them, up to 10 of its contents. */
function plantosDiagnosePhotoStorage() {
  try {
    var root = plantosGetPlantsRoot_();
    var out = {
      ok: true,
      plantsRootId: root.getId(),
      plantsRootName: root.getName(),
      plantsRootUrl: root.getUrl(),
      parents: [],
      childFolders: [],
      firstChildPhotos: null
    };
    try {
      var pit = root.getParents();
      while (pit.hasNext()) { var p = pit.next(); out.parents.push({ id: p.getId(), name: p.getName() }); }
    } catch (e) {}
    var fit = root.getFolders();
    var first = null;
    while (fit.hasNext()) {
      var f = fit.next();
      if (out.childFolders.length < 10) out.childFolders.push({ id: f.getId(), name: f.getName() });
      if (!first) first = f;
    }
    if (first) {
      out.firstChildName = first.getName();
      out.firstChildId = first.getId();
      var photoSubs = first.getFoldersByName(PLANTOS_BACKEND_CFG.PHOTOS_SUBFOLDER);
      if (photoSubs.hasNext()) {
        var ph = photoSubs.next();
        out.firstChildPhotos = { id: ph.getId(), name: ph.getName(), files: [] };
        var files = ph.getFiles();
        while (files.hasNext() && out.firstChildPhotos.files.length < 5) {
          var fl = files.next();
          out.firstChildPhotos.files.push({ name: fl.getName(), mime: fl.getMimeType(), access: String(fl.getSharingAccess()) });
        }
      } else {
        out.firstChildPhotos = 'No "' + PLANTOS_BACKEND_CFG.PHOTOS_SUBFOLDER + '" subfolder';
      }
    }
    // Also try searching Drive by filename pattern to find photos anywhere
    try {
      var res = DriveApp.searchFiles("title contains '_UID' and mimeType contains 'image/'");
      var found = [];
      while (res.hasNext() && found.length < 5) {
        var fl = res.next();
        var par = [];
        try { var piter = fl.getParents(); while (piter.hasNext() && par.length < 2) { var pp = piter.next(); par.push({ id: pp.getId(), name: pp.getName() }); } } catch (e) {}
        found.push({ name: fl.getName(), access: String(fl.getSharingAccess()), parents: par });
      }
      out.searchFoundPhotos = found;
    } catch (e) { out.searchError = e.message; }
    return out;
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

/* List gifts I've received (read the Supabase log; empty array if table missing). */
function plantosGetGiftsReceived() {
  var me = plantosSocialUserId_();
  try {
    var rows = plantosSupabaseRequest_('get',
      'plant_gifts?recipient_id=eq.' + encodeURIComponent(me) + '&order=created_at.desc',
      undefined) || [];
    return { ok: true, gifts: rows };
  } catch (e) {
    return { ok: true, gifts: [] };
  }
}

/* List gifts I've sent. */
function plantosGetGiftsSent() {
  var me = plantosSocialUserId_();
  try {
    var rows = plantosSupabaseRequest_('get',
      'plant_gifts?giver_id=eq.' + encodeURIComponent(me) + '&order=created_at.desc',
      undefined) || [];
    return { ok: true, gifts: rows };
  } catch (e) {
    return { ok: true, gifts: [] };
  }
}
