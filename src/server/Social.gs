/* ===================== SOCIAL / FRIENDS (Supabase-backed) ===================== */

var PLANTOS_SUPABASE_URL_KEY = 'PLANTOS_SUPABASE_URL';
var PLANTOS_SUPABASE_SERVICE_KEY = 'PLANTOS_SUPABASE_SERVICE_ROLE_KEY';

function plantosSocialUserId_() {
  var uname = (_currentUser && _currentUser.username) ? String(_currentUser.username) : '';
  if (!uname) throw new Error('Not signed in');
  return uname.toLowerCase();
}

function plantosGetSupabaseConfig_() {
  var props = PropertiesService.getScriptProperties();
  var url = String(props.getProperty(PLANTOS_SUPABASE_URL_KEY) || '').replace(/\/+$/, '');
  var key = String(props.getProperty(PLANTOS_SUPABASE_SERVICE_KEY) || '');
  if (!url || !key) throw new Error('Supabase is not configured. Set PLANTOS_SUPABASE_URL and PLANTOS_SUPABASE_SERVICE_ROLE_KEY in Script Properties.');
  return { url: url, key: key };
}

function plantosSupabaseRequest_(method, path, payload) {
  var cfg = plantosGetSupabaseConfig_();
  var options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      apikey: cfg.key,
      Authorization: 'Bearer ' + cfg.key,
      Prefer: 'return=representation'
    }
  };
  if (payload !== undefined) options.payload = JSON.stringify(payload);
  var res = UrlFetchApp.fetch(cfg.url + '/rest/v1/' + path, options);
  var code = res.getResponseCode();
  var text = res.getContentText() || '';
  var json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
  if (code >= 200 && code < 300) return json;
  var msg = (json && (json.message || json.error_description || json.error)) || text || ('HTTP ' + code);
  throw new Error('Supabase error (' + code + '): ' + msg);
}

function plantosListPublicUsers(searchTerm) {
  var q = String(searchTerm || '').trim().toLowerCase();
  var me = plantosSocialUserId_();
  var users = plantosGetUsers_() || [];
  var out = [];
  users.forEach(function(u) {
    var username = String(u.username || '').trim();
    if (!username) return;
    var userId = username.toLowerCase();
    if (userId === me) return;
    var email = String(u.email || '').trim();
    var hay = (username + ' ' + email).toLowerCase();
    if (q && hay.indexOf(q) < 0) return;
    out.push({ userId: userId, username: username, email: email });
  });
  out.sort(function(a, b) { return a.username.localeCompare(b.username); });
  return { ok: true, users: out.slice(0, 30) };
}

function plantosGetFriendships() {
  var me = plantosSocialUserId_();
  var rows = plantosSupabaseRequest_('get', 'friendships?or=(user_id.eq.' + encodeURIComponent(me) + ',friend_id.eq.' + encodeURIComponent(me) + ')&order=created_at.desc', undefined) || [];
  return { ok: true, friendships: rows };
}

function plantosSendFriendRequest(friendUserId) {
  var me = plantosSocialUserId_();
  var other = String(friendUserId || '').trim().toLowerCase();
  if (!other) return { ok: false, error: 'friendUserId required' };
  if (other === me) return { ok: false, error: 'You cannot friend yourself.' };

  var pairA = me < other ? me : other;
  var pairB = me < other ? other : me;
  var existing = plantosSupabaseRequest_('get', 'friendships?user_id=eq.' + encodeURIComponent(pairA) + '&friend_id=eq.' + encodeURIComponent(pairB) + '&limit=1', undefined) || [];
  if (existing.length) {
    var status = String(existing[0].status || 'pending');
    return { ok: false, error: status === 'accepted' ? 'You are already friends.' : 'A request already exists.' };
  }

  var inserted = plantosSupabaseRequest_('post', 'friendships', {
    user_id: pairA,
    friend_id: pairB,
    status: 'pending',
    requested_by: me
  }) || [];
  return { ok: true, friendship: inserted[0] || null };
}

function plantosRespondFriendRequest(friendshipId, action) {
  var me = plantosSocialUserId_();
  var id = String(friendshipId || '').trim();
  var act = String(action || '').trim().toLowerCase();
  if (!id) return { ok: false, error: 'friendshipId required' };
  if (act !== 'accept' && act !== 'decline') return { ok: false, error: 'action must be accept or decline' };

  var rows = plantosSupabaseRequest_('get', 'friendships?id=eq.' + encodeURIComponent(id) + '&limit=1', undefined) || [];
  if (!rows.length) return { ok: false, error: 'Friend request not found' };
  var fr = rows[0];
  if (!(fr.user_id === me || fr.friend_id === me)) return { ok: false, error: 'Unauthorized' };

  if (act === 'accept') {
    var up = plantosSupabaseRequest_('patch', 'friendships?id=eq.' + encodeURIComponent(id), { status: 'accepted', responded_at: new Date().toISOString() }) || [];
    return { ok: true, friendship: up[0] || fr };
  }

  // decline => delete row (keeps schema simple)
  plantosSupabaseRequest_('delete', 'friendships?id=eq.' + encodeURIComponent(id), undefined);
  return { ok: true };
}

function plantosRemoveFriend(friendUserId) {
  var me = plantosSocialUserId_();
  var other = String(friendUserId || '').trim().toLowerCase();
  if (!other) return { ok: false, error: 'friendUserId required' };
  var a = me < other ? me : other;
  var b = me < other ? other : me;
  plantosSupabaseRequest_('delete', 'friendships?user_id=eq.' + encodeURIComponent(a) + '&friend_id=eq.' + encodeURIComponent(b), undefined);
  return { ok: true };
}

function plantosBuildFriendSummaries_(rows) {
  var users = plantosGetUsers_() || [];
  var map = {};
  users.forEach(function(u) { if (u && u.username) map[String(u.username).toLowerCase()] = u; });
  return (rows || []).map(function(fr) {
    var me = plantosSocialUserId_();
    var otherId = fr.user_id === me ? fr.friend_id : fr.user_id;
    var profile = map[otherId] || {};
    return {
      id: fr.id,
      status: fr.status,
      requestedBy: fr.requested_by,
      userId: otherId,
      username: profile.username || otherId,
      email: profile.email || '',
      createdAt: fr.created_at || '',
      respondedAt: fr.responded_at || ''
    };
  });
}

function plantosGetFriendsOverview() {
  var me = plantosSocialUserId_();
  var rows = plantosSupabaseRequest_('get', 'friendships?or=(user_id.eq.' + encodeURIComponent(me) + ',friend_id.eq.' + encodeURIComponent(me) + ')&order=created_at.desc', undefined) || [];
  var friends = [], incoming = [], outgoing = [];
  rows.forEach(function(fr) {
    if (fr.status === 'accepted') friends.push(fr);
    else if (fr.status === 'pending') {
      if (fr.requested_by && String(fr.requested_by).toLowerCase() === me) outgoing.push(fr);
      else incoming.push(fr);
    }
  });
  return {
    ok: true,
    friends: plantosBuildFriendSummaries_(friends),
    incoming: plantosBuildFriendSummaries_(incoming),
    outgoing: plantosBuildFriendSummaries_(outgoing)
  };
}

function plantosGetUserById_(userId) {
  var needle = String(userId || '').trim().toLowerCase();
  var users = plantosGetUsers_() || [];
  for (var i = 0; i < users.length; i++) {
    var uname = String(users[i].username || '').trim();
    if (uname && uname.toLowerCase() === needle) return users[i];
  }
  return null;
}

function plantosEnsureFriends_(otherId) {
  var me = plantosSocialUserId_();
  var a = me < otherId ? me : otherId;
  var b = me < otherId ? otherId : me;
  var rows = plantosSupabaseRequest_('get', 'friendships?user_id=eq.' + encodeURIComponent(a) + '&friend_id=eq.' + encodeURIComponent(b) + '&status=eq.accepted&limit=1', undefined) || [];
  if (!rows.length) throw new Error('You are not friends with this user.');
}

function plantosGetFriendGarden(friendUserId) {
  var targetId = String(friendUserId || '').trim().toLowerCase();
  if (!targetId) return { ok: false, error: 'friendUserId required' };
  plantosEnsureFriends_(targetId);

  var me = plantosSocialUserId_();
  var myPlantsRes = plantosGetAllPlantsLite();
  var myPlants = (myPlantsRes && myPlantsRes.plants) ? myPlantsRes.plants : [];
  var wishlistRes = plantosGetWishlist();
  var myWishlist = (wishlistRes && wishlistRes.wishlist) ? wishlistRes.wishlist : [];

  var meBackup = _currentUser;
  var targetUser = plantosGetUserById_(targetId);
  if (!targetUser) return { ok: false, error: 'User not found' };

  _currentUser = {
    username: targetUser.username,
    isAdmin: !!targetUser.isAdmin,
    inventorySheet: targetUser.inventorySheet || (targetUser.isAdmin ? PLANTOS_BACKEND_CFG.INVENTORY_SHEET : targetUser.username + ' - ' + PLANTOS_BACKEND_CFG.INVENTORY_SHEET)
  };
  var friendPlantsRes = plantosGetAllPlantsLite();
  _currentUser = meBackup;

  var myCollectionKeys = {};
  myPlants.forEach(function(p) {
    var key = ((p.genus || '') + '|' + (p.taxon || p.species || '')).toLowerCase().trim();
    if (key && key !== '|') myCollectionKeys[key] = true;
  });
  var myWishKeys = {};
  myWishlist.forEach(function(w) {
    var key = ((w.genus || '') + '|' + (w.taxon || '')).toLowerCase().trim();
    if (key && key !== '|') myWishKeys[key] = true;
  });

  var friendPlants = ((friendPlantsRes && friendPlantsRes.plants) ? friendPlantsRes.plants : []).map(function(p) {
    var key = ((p.genus || '') + '|' + (p.taxon || p.species || '')).toLowerCase().trim();
    return Object.assign({}, p, {
      overlapInCollection: !!myCollectionKeys[key],
      overlapInWishlist: !!myWishKeys[key],
      ownerUserId: targetId,
      ownerUsername: targetUser.username || targetId
    });
  });

  // --- friendStats: plantCount, genusCount, topGenera, photoCount ---
  var genusTally = {};
  var photoCount = 0;
  friendPlants.forEach(function(p) {
    var g = String(p.genus || '').trim();
    if (g) genusTally[g] = (genusTally[g] || 0) + 1;
    if (p.thumbUrl) photoCount++;
  });
  var topGenera = Object.keys(genusTally)
    .map(function(k) { return { genus: k, count: genusTally[k] }; })
    .sort(function(a, b) { return b.count - a.count; })
    .slice(0, 5);
  var friendStats = {
    plantCount: friendPlants.length,
    genusCount: Object.keys(genusTally).length,
    photoCount: photoCount,
    topGenera: topGenera
  };

  var notes = plantosSupabaseRequest_('get', 'plant_notes?recipient_id=eq.' + encodeURIComponent(targetId) + '&author_id=eq.' + encodeURIComponent(me) + '&order=created_at.desc', undefined) || [];
  return {
    ok: true,
    friend: { userId: targetId, username: targetUser.username || targetId, email: targetUser.email || '' },
    plants: friendPlants,
    notes: notes,
    friendStats: friendStats
  };
}

/* Read-only deep-dive on a single friend's plant. Returns full plant, all photos, and
   all notes I've left on it. Mirrors the user-switching pattern from plantosGetFriendGarden. */
function plantosGetFriendPlantDetail(friendUserId, plantUid) {
  var targetId = String(friendUserId || '').trim().toLowerCase();
  var uid = String(plantUid || '').trim();
  if (!targetId) return { ok: false, error: 'friendUserId required' };
  if (!uid) return { ok: false, error: 'plantId required' };
  plantosEnsureFriends_(targetId);

  var me = plantosSocialUserId_();
  var targetUser = plantosGetUserById_(targetId);
  if (!targetUser) return { ok: false, error: 'User not found' };

  var meBackup = _currentUser;
  _currentUser = {
    username: targetUser.username,
    isAdmin: !!targetUser.isAdmin,
    inventorySheet: targetUser.inventorySheet || (targetUser.isAdmin ? PLANTOS_BACKEND_CFG.INVENTORY_SHEET : targetUser.username + ' - ' + PLANTOS_BACKEND_CFG.INVENTORY_SHEET)
  };
  var plantRes = null, photosRes = null, err = null;
  try {
    plantRes = plantosGetPlant(uid);
    try { photosRes = plantosGetAllPhotos(uid); } catch (ep) { photosRes = { ok: false, photos: [] }; }
  } catch (e) {
    err = e && e.message ? e.message : String(e);
  } finally {
    _currentUser = meBackup;
  }
  if (err) return { ok: false, error: err };
  if (!plantRes || !plantRes.ok) return { ok: false, error: (plantRes && plantRes.reason) || 'Plant not found' };

  // Notes left by me on this specific plant, for this recipient
  var notes = plantosSupabaseRequest_(
    'get',
    'plant_notes?plant_id=eq.' + encodeURIComponent(uid) +
      '&recipient_id=eq.' + encodeURIComponent(targetId) +
      '&order=created_at.desc',
    undefined
  ) || [];

  return {
    ok: true,
    plant: plantRes.plant,
    photos: (photosRes && photosRes.photos) || [],
    notes: notes,
    friend: { userId: targetId, username: targetUser.username || targetId }
  };
}

function plantosAddPlantNote(plantId, recipientId, noteText) {
  var me = plantosSocialUserId_();
  var pid = String(plantId || '').trim();
  var rcpt = String(recipientId || '').trim().toLowerCase();
  var text = String(noteText || '').trim();
  if (!pid) return { ok: false, error: 'plantId required' };
  if (!rcpt) return { ok: false, error: 'recipientId required' };
  if (!text) return { ok: false, error: 'Note text required' };
  plantosEnsureFriends_(rcpt);
  var inserted = plantosSupabaseRequest_('post', 'plant_notes', {
    plant_id: pid,
    author_id: me,
    recipient_id: rcpt,
    note_text: text
  }) || [];
  return { ok: true, note: inserted[0] || null };
}

function plantosGetPlantNotesForGarden(recipientId) {
  var me = plantosSocialUserId_();
  var rcpt = String(recipientId || '').trim().toLowerCase();
  if (!rcpt) return { ok: false, error: 'recipientId required' };
  plantosEnsureFriends_(rcpt);
  var notes = plantosSupabaseRequest_('get', 'plant_notes?recipient_id=eq.' + encodeURIComponent(rcpt) + '&order=created_at.desc', undefined) || [];
  return { ok: true, notes: notes, viewerId: me };
}

function plantosGetNotesOnMyPlants() {
  var me = plantosSocialUserId_();
  var notes = plantosSupabaseRequest_('get', 'plant_notes?recipient_id=eq.' + encodeURIComponent(me) + '&order=created_at.desc', undefined) || [];
  return { ok: true, notes: notes };
}

/* Home-widget feed: for each accepted friend, return plantCount + a representative thumbnail.
   Iterates friends and switches _currentUser per friend (same pattern as plantosGetFriendGarden).
   Kept cheap: no per-plant metadata beyond first thumb + count. */
function plantosGetFriendsFeed() {
  var me = plantosSocialUserId_();
  var rows = plantosSupabaseRequest_('get',
    'friendships?or=(user_id.eq.' + encodeURIComponent(me) + ',friend_id.eq.' + encodeURIComponent(me) + ')&status=eq.accepted',
    undefined) || [];

  // Build set of unique other-user ids
  var otherIds = [];
  rows.forEach(function(fr) {
    var o = fr.user_id === me ? fr.friend_id : fr.user_id;
    if (o && otherIds.indexOf(o) < 0) otherIds.push(o);
  });

  var meBackup = _currentUser;
  var feed = [];
  for (var i = 0; i < otherIds.length; i++) {
    var otherId = otherIds[i];
    var user = plantosGetUserById_(otherId);
    if (!user) {
      feed.push({ userId: otherId, username: otherId, plantCount: 0, thumbUrl: '', latestPlantName: '', error: true });
      continue;
    }
    try {
      _currentUser = {
        username: user.username,
        isAdmin: !!user.isAdmin,
        inventorySheet: user.inventorySheet || (user.isAdmin ? PLANTOS_BACKEND_CFG.INVENTORY_SHEET : user.username + ' - ' + PLANTOS_BACKEND_CFG.INVENTORY_SHEET)
      };
      var lite = plantosGetAllPlantsLite();
      var plants = (lite && lite.plants) ? lite.plants : [];
      var withPhoto = null;
      for (var j = 0; j < plants.length; j++) { if (plants[j].thumbUrl) { withPhoto = plants[j]; break; } }
      feed.push({
        userId: otherId,
        username: user.username || otherId,
        plantCount: plants.length,
        thumbUrl: withPhoto ? withPhoto.thumbUrl : '',
        latestPlantName: withPhoto ? (withPhoto.nickname || withPhoto.primary || '') : ''
      });
    } catch (e) {
      feed.push({ userId: otherId, username: (user && user.username) || otherId, plantCount: 0, thumbUrl: '', latestPlantName: '', error: true });
    }
  }
  _currentUser = meBackup;
  feed.sort(function(a, b) { return b.plantCount - a.plantCount; });
  return { ok: true, feed: feed };
}
