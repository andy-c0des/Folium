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
