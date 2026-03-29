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
