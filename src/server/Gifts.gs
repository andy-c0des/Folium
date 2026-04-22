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
function plantosRepairPhotoSharing(opts) {
  opts = opts || {};
  var root = plantosGetPlantsRoot_();
  var startMs = Date.now();
  var hardStop = 5.5 * 60 * 1000; // leave buffer before the 6-min Apps Script timeout
  var fixed = 0, skipped = 0, errors = 0, foldersScanned = 0;
  var subfolders = root.getFolders();
  while (subfolders.hasNext()) {
    if (Date.now() - startMs > hardStop) break;
    var plantFolder = subfolders.next();
    foldersScanned++;
    // Plant folder -> Photos subfolder
    try {
      var photosIter = plantFolder.getFoldersByName(PLANTOS_BACKEND_CFG.PHOTOS_SUBFOLDER);
      while (photosIter.hasNext()) {
        var photosFolder = photosIter.next();
        var files = photosFolder.getFiles();
        while (files.hasNext()) {
          if (Date.now() - startMs > hardStop) break;
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
          } catch (e) {
            errors++;
            Logger.log('[repair] file err ' + f.getName() + ': ' + (e && e.message));
          }
        }
      }
    } catch (e) {
      errors++;
      Logger.log('[repair] folder err ' + plantFolder.getName() + ': ' + (e && e.message));
    }
  }
  var ms = Date.now() - startMs;
  var result = { ok: true, fixed: fixed, skipped: skipped, errors: errors, foldersScanned: foldersScanned, ms: ms, timedOut: (ms > hardStop) };
  Logger.log('[repair] ' + JSON.stringify(result));
  return result;
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
