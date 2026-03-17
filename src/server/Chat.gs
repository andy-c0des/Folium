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
