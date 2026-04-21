/* ===================== PUBLIC API ===================== */

function plantosListLocations() {
  const { values, hmap } = plantosReadInventory_();
  const locCol = plantosCol_(hmap, PLANTOS_BACKEND_CFG.HEADERS.LOCATION);
  if (locCol < 0) return [];
  const set = {};
  for (let r = 1; r < values.length; r++) { const loc = plantosSafeStr_(values[r][locCol]).trim(); if (loc) set[loc] = true; }
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('PLANTOS_CUSTOM_LOCATIONS') || '[]';
    JSON.parse(raw).forEach(n => { if (n) set[n] = true; });
  } catch(e) {}
  return Object.keys(set).sort((a, b) => a.localeCompare(b));
}

function plantosHome() {
  const { values, hmap } = plantosReadInventory_();
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const uidCol = plantosCol_(hmap, H.UID), nicknameCol = plantosCol_(hmap, H.NICKNAME);
  const genusCol = plantosCol_(hmap, H.GENUS), taxonCol = plantosCol_(hmap, H.TAXON);
  const lastWateredCol = plantosCol_(hmap, H.LAST_WATERED), everyDaysCol = plantosColMulti_(hmap, H.WATER_EVERY_DAYS, H.WATER_EVERY_DAYS_ALT);
  const birthdayCol = plantosCol_(hmap, H.BIRTHDAY), lastFertCol = plantosCol_(hmap, H.LAST_FERTILIZED);
  const fertEveryCol = plantosCol_(hmap, H.FERT_EVERY_DAYS);
  const lastProgressCol = plantosCol_(hmap, H.LAST_PROGRESS_UPDATE);
  const priceCol = plantosCol_(hmap, H.PURCHASE_PRICE);
  const aliveCol = plantosCol_(hmap, 'Alive'), inColCol = plantosCol_(hmap, 'In Collection');
  const PROGRESS_INTERVAL = 14;
  const now = plantosNow_(), tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(now, tz, 'MM/dd');
  const dueNow = [], upcoming = [], fertDueNow = [], fertUpcoming = [], bothDueNow = [], bothUpcoming = [], birthdays = [];
  const progressDueNow = [], wateredToday = [], fertedToday = [];
  const todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  let totalCount = 0;
  // Dashboard accumulators (computed in same loop — no extra sheet read)
  let dashTotalPlants = 0, dashSpentCurrent = 0, dashSpentAll = 0;
  const genusCounts = {}, monthlyPurchases = {};
  let dashWaterOverdue = 0, dashFertOverdue = 0, dashProgressOverdue = 0;

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const uid = uidCol >= 0 ? plantosSafeStr_(row[uidCol]).trim() : '';
    if (!uid) continue;
    totalCount++;
    const nn = nicknameCol >= 0 ? plantosSafeStr_(row[nicknameCol]).trim() : '';
    const genus = genusCol >= 0 ? plantosSafeStr_(row[genusCol]).trim() : '';
    const taxon = taxonCol >= 0 ? plantosSafeStr_(row[taxonCol]).trim() : '';
    const primary = nn || [genus, taxon].filter(Boolean).join(' ') || uid;

    // Alive / In Collection (dashboard filtering)
    let alive = true, inCol = true;
    if (aliveCol >= 0) { const a = String(row[aliveCol] || '').toLowerCase().trim(); if (a && (a === 'false' || a === 'no' || a === 'dead' || a === '0')) alive = false; }
    if (inColCol >= 0) { const ic = String(row[inColCol] || '').toLowerCase().trim(); if (ic && (ic === 'false' || ic === 'no' || ic === '0')) inCol = false; }

    // Purchase price
    const rawPrice = priceCol >= 0 ? plantosSafeStr_(row[priceCol]).trim() : '';
    const price = rawPrice ? parseFloat(String(rawPrice).replace(/[$,]/g, '')) : NaN;
    if (!isNaN(price) && price > 0) dashSpentAll += price;

    // Monthly purchases (Birthday as purchase date)
    if (birthdayCol >= 0) {
      const bd = plantosAsDate_(row[birthdayCol]);
      if (bd) {
        if (Utilities.formatDate(bd, tz, 'MM/dd') === today) birthdays.push(primary);
        if (!isNaN(price) && price > 0) { const ym = Utilities.formatDate(bd, tz, 'yyyy-MM'); monthlyPurchases[ym] = (monthlyPurchases[ym] || 0) + price; }
      }
    }

    const waterEvery = everyDaysCol >= 0 ? Number(row[everyDaysCol]) : NaN;
    const lw = lastWateredCol >= 0 ? plantosAsDate_(row[lastWateredCol]) : null;
    let waterBucket = null, waterDue = null;
    if (!isNaN(waterEvery) && waterEvery > 0) {
      if (!lw) { waterBucket = 'now'; waterDue = 'unknown'; }
      else {
        const dueDate = plantosAddDays_(lw, waterEvery);
        const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (24 * 3600 * 1000));
        if (dueDate <= now) { waterBucket = 'now'; waterDue = plantosFmtDate_(dueDate); }
        else if (diffDays >= 1 && diffDays <= 7) { waterBucket = 'upcoming'; waterDue = plantosFmtDate_(dueDate); }
      }
    }
    const fertEvery = fertEveryCol >= 0 ? Number(row[fertEveryCol]) : NaN;
    const lf = lastFertCol >= 0 ? plantosAsDate_(row[lastFertCol]) : null;
    let fertBucket = null, fertDue = null;
    if (!isNaN(fertEvery) && fertEvery > 0) {
      if (!lf) { fertBucket = 'now'; fertDue = 'unknown'; }
      else {
        const dueDate = plantosAddDays_(lf, fertEvery);
        const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (24 * 3600 * 1000));
        if (dueDate <= now) { fertBucket = 'now'; fertDue = plantosFmtDate_(dueDate); }
        else if (diffDays >= 1 && diffDays <= 7) { fertBucket = 'upcoming'; fertDue = plantosFmtDate_(dueDate); }
      }
    }
    if (waterBucket === 'now') dueNow.push({ uid, primary, due: waterDue });
    if (waterBucket === 'upcoming') upcoming.push({ uid, primary, due: waterDue });
    if (fertBucket === 'now') fertDueNow.push({ uid, primary, due: fertDue });
    if (fertBucket === 'upcoming') fertUpcoming.push({ uid, primary, due: fertDue });
    if (waterBucket === 'now' && fertBucket === 'now') bothDueNow.push({ uid, primary, due: waterDue, fertDue });
    else if ((waterBucket === 'now' || waterBucket === 'upcoming') && (fertBucket === 'now' || fertBucket === 'upcoming')) bothUpcoming.push({ uid, primary, due: waterDue, fertDue });
    if (lw && Utilities.formatDate(lw, tz, 'yyyy-MM-dd') === todayStr) wateredToday.push({ uid, primary });
    if (lf && Utilities.formatDate(lf, tz, 'yyyy-MM-dd') === todayStr) fertedToday.push({ uid, primary });
    if (lastProgressCol >= 0) {
      const lp = plantosAsDate_(row[lastProgressCol]);
      if (!lp || plantosAddDays_(lp, PROGRESS_INTERVAL) <= now) {
        progressDueNow.push({ uid, primary, nickname: nn });
      }
    }

    // Living collection dashboard metrics
    if (alive && inCol) {
      dashTotalPlants++;
      if (!isNaN(price) && price > 0) dashSpentCurrent += price;
      if (genus) genusCounts[genus] = (genusCounts[genus] || 0) + 1;
      if (waterBucket === 'now') dashWaterOverdue++;
      if (fertBucket === 'now') dashFertOverdue++;
      if (lastProgressCol >= 0) { const lp2 = plantosAsDate_(row[lastProgressCol]); if (!lp2 || plantosAddDays_(lp2, PROGRESS_INTERVAL) <= now) dashProgressOverdue++; }
    }
  }
  const byDue = (a, b) => String(a.due || '').localeCompare(String(b.due || ''));
  [dueNow, upcoming, fertDueNow, fertUpcoming, bothDueNow, bothUpcoming].forEach(a => a.sort(byDue));
  progressDueNow.sort((a, b) => String(a.primary || '').localeCompare(String(b.primary || '')));

  // ── Props & Grafts (dashboard metrics) ──
  const props = plantosGetProps(), grafts = plantosGetGrafts();
  const TERMINAL = { Graduated: 1, Failed: 1, Sold: 1 };
  let activeProps = 0, activeGrafts = 0, totalSoldRevenue = 0;
  const propStatusCounts = {}, graftStatusCounts = {}, monthlySales = {};
  for (let i = 0; i < props.length; i++) {
    const p = props[i], st = p.status || 'Trying';
    propStatusCounts[st] = (propStatusCounts[st] || 0) + 1;
    if (!TERMINAL[st]) activeProps++;
    if (st === 'Sold' && p.priceSold) {
      const pv = parseFloat(String(p.priceSold).replace(/[$,]/g, ''));
      if (!isNaN(pv) && pv > 0) { totalSoldRevenue += pv; if (p.soldDate) { const sm = String(p.soldDate).slice(0, 7); monthlySales[sm] = (monthlySales[sm] || 0) + pv; } }
    }
  }
  for (let j = 0; j < grafts.length; j++) {
    const g = grafts[j], gs = g.status || 'Trying';
    graftStatusCounts[gs] = (graftStatusCounts[gs] || 0) + 1;
    if (!TERMINAL[gs]) activeGrafts++;
    if (gs === 'Sold' && g.priceSold) {
      const gv = parseFloat(String(g.priceSold).replace(/[$,]/g, ''));
      if (!isNaN(gv) && gv > 0) { totalSoldRevenue += gv; if (g.soldDate) { const gm = String(g.soldDate).slice(0, 7); monthlySales[gm] = (monthlySales[gm] || 0) + gv; } }
    }
  }

  // Sales listings revenue (plant-level sales via sales tracker)
  try {
    const salesSummary = plantosSalesRevenueSummary_();
    totalSoldRevenue += salesSummary.totalRevenue || 0;
    Object.keys(salesSummary.monthlySales || {}).forEach(function(ym) {
      monthlySales[ym] = (monthlySales[ym] || 0) + salesSummary.monthlySales[ym];
    });
  } catch(e) { /* Sales.gs may not be deployed yet — ignore */ }

  return {
    dueNow, upcoming, fertDueNow, fertUpcoming, bothDueNow, bothUpcoming, birthdays, totalCount, progressDueNow, wateredToday, fertedToday,
    // Dashboard fields (merged — no separate API call needed)
    totalPlants: dashTotalPlants, activeProps, activeGrafts,
    totalSpentCurrent: Math.round(dashSpentCurrent * 100) / 100,
    totalSpentAllTime: Math.round(dashSpentAll * 100) / 100,
    totalSoldRevenue: Math.round(totalSoldRevenue * 100) / 100,
    genusCounts, propStatusCounts, graftStatusCounts,
    monthlyPurchases, monthlySales,
    waterOverdue: dashWaterOverdue, fertOverdue: dashFertOverdue, progressOverdue: dashProgressOverdue
  };
}

/* ===================== FIX #5: Case-insensitive location matching ===================== */
/* FIX #14: Returns { ok, plants, errors, meta } envelope instead of raw array.
   Errors are surfaced, never swallowed. Silent return [] eliminated. */
function plantosGetPlantsByLocation(location) {
  const t0 = Date.now();
  const locLower = plantosSafeStr_(location).trim().toLowerCase();
  const inv = plantosReadInventory_();
  const values = inv.values, hmap = inv.hmap;
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const uidCol = plantosCol_(hmap, H.UID);
  const locCol = plantosCol_(hmap, H.LOCATION);

  // Guard: surface missing columns explicitly
  if (uidCol < 0 || locCol < 0) {
    const missing = [];
    if (uidCol < 0) missing.push('"' + H.UID + '"');
    if (locCol < 0) missing.push('"' + H.LOCATION + '"');
    return {
      ok: false, plants: [],
      errors: ['Missing column(s): ' + missing.join(', ') + '. Sheet headers: ' + JSON.stringify(Object.keys(hmap))],
      meta: { sheetRows: values.length - 1, location: location, ms: Date.now() - t0 }
    };
  }
  const out = [], errors = [];
  let matched = 0, skipped = 0;
  for (let r = 1; r < values.length; r++) {
    try {
      const row = values[r];
      if (plantosSafeStr_(row[locCol]).trim().toLowerCase() !== locLower) continue;
      matched++;
      if (!plantosSafeStr_(row[uidCol]).trim()) { skipped++; continue; }
      out.push(plantosRowToPlant_(hmap, row));
    } catch(e) {
      let uid = '';
      try { uid = plantosSafeStr_(values[r][uidCol]).trim(); } catch(x) {}
      const msg = 'Row ' + (r+1) + (uid ? ' (UID ' + uid + ')' : '') + ': ' + (e && e.message ? e.message : String(e));
      errors.push(msg);
      Logger.log('[PlantOS] getByLocation ' + msg);
    }
  }
  return {
    ok: errors.length === 0,
    plants: out,
    errors: errors,
    meta: { sheetRows: values.length - 1, location: location, matched: matched, returned: out.length, skipped: skipped, errored: errors.length, ms: Date.now() - t0 }
  };
}

/* FIX #14: Returns { ok, plants, errors, meta } envelope.
   NOTE: For large inventories (500+ plants), prefer plantosGetAllPlantsLite(). */
function plantosGetPlantsByLocationLite(location) {
  const t0 = Date.now();
  const locLower = plantosSafeStr_(location).trim().toLowerCase();
  const inv = plantosReadInventory_();
  const values = inv.values, hmap = inv.hmap;
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const uidCol    = plantosCol_(hmap, H.UID);
  const locCol    = plantosCol_(hmap, H.LOCATION);
  if (uidCol < 0 || locCol < 0) {
    return { ok: false, plants: [], errors: ['Missing column(s)'], meta: { location: location, ms: Date.now()-t0 } };
  }
  const nickCol  = plantosCol_(hmap, H.NICKNAME);
  const genusCol = plantosCol_(hmap, H.GENUS);
  const taxonCol = plantosCol_(hmap, H.TAXON);
  const lwCol    = plantosCol_(hmap, H.LAST_WATERED);
  const evCol    = plantosColMulti_(hmap, H.WATER_EVERY_DAYS, H.WATER_EVERY_DAYS_ALT);
  const bdCol    = plantosCol_(hmap, H.BIRTHDAY);
  const lfCol    = plantosCol_(hmap, H.LAST_FERTILIZED);
  const feCol    = plantosCol_(hmap, H.FERT_EVERY_DAYS);
  const medCol   = plantosCol_(hmap, H.MEDIUM);
  const potCol    = plantosCol_(hmap, H.POT_SIZE);
  const potMatCol = plantosCol_(hmap, H.POT_MATERIAL);
  const potShpCol = plantosCol_(hmap, H.POT_SHAPE);
  const cultivarCol  = plantosCol_(hmap, H.CULTIVAR);
  const pidCol   = plantosCol_(hmap, H.PLANT_ID);
  const ppCol    = plantosCol_(hmap, H.PLANT_PAGE_URL);
  const purchCol = plantosCol_(hmap, H.PURCHASE_PRICE);

  const out = [], errors = [];
  let matched = 0, skipped = 0;
  for (let r = 1; r < values.length; r++) {
    try {
      const row = values[r];
      const rowLoc = plantosSafeStr_(row[locCol]).trim();
      if (rowLoc.toLowerCase() !== locLower) continue;
      matched++;
      const uid = plantosSafeStr_(row[uidCol]).trim();
      if (!uid) { skipped++; continue; }

      const nick  = nickCol >= 0  ? plantosSafeStr_(row[nickCol]).trim()  : '';
      const genus = genusCol >= 0 ? plantosSafeStr_(row[genusCol]).trim() : '';
      const taxon = taxonCol >= 0 ? plantosSafeStr_(row[taxonCol]).trim() : '';
      const gs    = [genus, taxon].filter(Boolean).join(' ');
      const inferredGenus = genus || (taxon && /^[A-Z]/.test(taxon) ? taxon.split(/\s+/)[0] : '');
      const primary = nick || gs || uid;

      const lw  = lwCol >= 0 ? plantosAsDate_(row[lwCol]) : null;
      const ev  = evCol >= 0 ? Number(row[evCol]) : NaN;
      let due = '';
      if (lw && !isNaN(ev) && ev > 0) due = plantosFmtDate_(plantosAddDays_(lw, ev));
      const bd  = bdCol >= 0 ? plantosAsDate_(row[bdCol]) : null;

      out.push({
        uid: uid,
        nickname: nick,
        primary: primary,
        genus: inferredGenus,
        species: taxon,
        taxon: taxon,
        gs: gs,
        classification: gs,
        location: rowLoc,
        lastWatered: lw ? plantosFmtDate_(lw) : '',
        waterEveryDays: evCol >= 0 ? plantosSafeStr_(row[evCol]) : '',
        everyDays:      evCol >= 0 ? plantosSafeStr_(row[evCol]) : '',
        due: due,
        birthday: bd ? plantosFmtDate_(bd) : '',
        medium:    medCol >= 0 ? plantosSafeStr_(row[medCol]).trim() : '',
        substrate: medCol >= 0 ? plantosSafeStr_(row[medCol]).trim() : '',
        potSize:   potCol >= 0 ? plantosSafeStr_(row[potCol]).trim() : '',
        humanPlantId: pidCol >= 0 ? plantosSafeStr_(row[pidCol]).trim() : '',
        plantPageUrl: ppCol >= 0 ? plantosSafeStr_(row[ppCol]).trim() : '',
        lastFertilized: lfCol >= 0 && plantosAsDate_(row[lfCol]) ? plantosFmtDate_(plantosAsDate_(row[lfCol])) : '',
        fertEveryDays: feCol >= 0 ? plantosSafeStr_(row[feCol]) : '',
        fertilizeEveryDays: feCol >= 0 ? plantosSafeStr_(row[feCol]) : '',
        // Lite: heavy URL fields omitted
        folderId: '', folderUrl: '', careDocUrl: '',
        potMaterial: potMatCol >= 0 ? plantosSafeStr_(row[potMatCol]).trim() : '',  // FIX #15
        potShape:    potShpCol >= 0 ? plantosSafeStr_(row[potShpCol]).trim() : '',    // FIX #15
        cultivar:    cultivarCol >= 0 ? plantosSafeStr_(row[cultivarCol]).trim() : '', // FIX #15
        purchasePrice: purchCol >= 0 ? plantosSafeStr_(row[purchCol]).trim() : '',
      });
    } catch(e) {
      let failUid = '';
      try { failUid = plantosSafeStr_(values[r][uidCol]).trim(); } catch(x) {}
      const msg = 'Row ' + (r+1) + (failUid ? ' (UID ' + failUid + ')' : '') + ': ' + (e && e.message ? e.message : String(e));
      errors.push(msg);
      Logger.log('[PlantOS] getByLocationLite ' + msg);
    }
  }
  return {
    ok: errors.length === 0,
    plants: out,
    errors: errors,
    meta: { sheetRows: values.length - 1, location: location, matched: matched, returned: out.length, skipped: skipped, errored: errors.length, ms: Date.now() - t0, lite: true }
  };
}


function plantosGetAllPlants() {
  const t0 = Date.now();
  const inv = plantosReadInventory_();
  const values = inv.values, hmap = inv.hmap;
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const uidCol = plantosCol_(hmap, H.UID);
  if (uidCol < 0) {
    return {
      ok: false, plants: [],
      errors: ['UID column "' + H.UID + '" not found. Sheet headers: ' + JSON.stringify(Object.keys(hmap))],
      meta: { sheetRows: values.length - 1, ms: Date.now() - t0 }
    };
  }
  const out = [], errors = [];
  let skipped = 0;
  for (let r = 1; r < values.length; r++) {
    try {
      if (!plantosSafeStr_(values[r][uidCol]).trim()) { skipped++; continue; }
      out.push(plantosRowToPlant_(hmap, values[r]));
    } catch(e) {
      let uid = '';
      try { uid = plantosSafeStr_(values[r][uidCol]).trim(); } catch(x) {}
      const msg = 'Row ' + (r+1) + (uid ? ' (UID ' + uid + ')' : '') + ': ' + (e && e.message ? e.message : String(e));
      errors.push(msg);
      Logger.log('[PlantOS] getAllPlants ' + msg);
    }
  }
  return {
    ok: errors.length === 0,
    plants: out,
    errors: errors,
    meta: { sheetRows: values.length - 1, returned: out.length, skipped: skipped, errored: errors.length, ms: Date.now() - t0 }
  };
}

/* FIX #14: Lightweight variant for inventory list. Returns only the fields
   the list UI needs. Payload is ~4x smaller than plantosGetAllPlants.
   Returns the same { ok, plants, errors, meta } envelope. */
function plantosGetAllPlantsLite() {
  const t0 = Date.now();
  const inv = plantosReadInventory_();
  const values = inv.values, hmap = inv.hmap;
  const H = PLANTOS_BACKEND_CFG.HEADERS;
  const uidCol = plantosCol_(hmap, H.UID);
  if (uidCol < 0) {
    return {
      ok: false, plants: [],
      errors: ['UID column "' + H.UID + '" not found. Sheet headers: ' + JSON.stringify(Object.keys(hmap))],
      meta: { sheetRows: values.length - 1, ms: Date.now() - t0 }
    };
  }
  const nickCol = plantosCol_(hmap, H.NICKNAME);
  const genusCol = plantosCol_(hmap, H.GENUS);
  const taxonCol = plantosCol_(hmap, H.TAXON);
  const locCol = plantosCol_(hmap, H.LOCATION);
  const lwCol = plantosCol_(hmap, H.LAST_WATERED);
  const evCol = plantosColMulti_(hmap, H.WATER_EVERY_DAYS, H.WATER_EVERY_DAYS_ALT);
  const bdCol = plantosCol_(hmap, H.BIRTHDAY);
  const lfCol = plantosCol_(hmap, H.LAST_FERTILIZED);
  const feCol = plantosCol_(hmap, H.FERT_EVERY_DAYS);
  const medCol = plantosCol_(hmap, H.MEDIUM);
  const potCol   = plantosCol_(hmap, H.POT_SIZE);
  const potMatCol = plantosCol_(hmap, H.POT_MATERIAL);
  const potShpCol = plantosCol_(hmap, H.POT_SHAPE);
  const cultivarCol = plantosCol_(hmap, H.CULTIVAR);
  const pidCol = plantosCol_(hmap, H.PLANT_ID);
  const ppCol = plantosCol_(hmap, H.PLANT_PAGE_URL);
  const purchCol = plantosCol_(hmap, H.PURCHASE_PRICE);
  const thumbCol = plantosCol_(hmap, H.LATEST_PHOTO_THUMB);
  const viewCol = plantosCol_(hmap, H.LATEST_PHOTO_VIEW);

  const out = [], errors = [];
  let skipped = 0;
  for (let r = 1; r < values.length; r++) {
    try {
      const row = values[r];
      const uid = plantosSafeStr_(row[uidCol]).trim();
      if (!uid) { skipped++; continue; }
      const nick = nickCol >= 0 ? plantosSafeStr_(row[nickCol]).trim() : '';
      const genus = genusCol >= 0 ? plantosSafeStr_(row[genusCol]).trim() : '';
      const taxon = taxonCol >= 0 ? plantosSafeStr_(row[taxonCol]).trim() : '';
      const loc = locCol >= 0 ? plantosSafeStr_(row[locCol]).trim() : '';
      const gs = [genus, taxon].filter(Boolean).join(' ');
      const inferredGenus = genus || (taxon && /^[A-Z]/.test(taxon) ? taxon.split(/\s+/)[0] : '');
      const primary = nick || gs || uid;

      const lw = lwCol >= 0 ? plantosAsDate_(row[lwCol]) : null;
      const ev = evCol >= 0 ? Number(row[evCol]) : NaN;
      let due = '';
      if (lw && !isNaN(ev) && ev > 0) due = plantosFmtDate_(plantosAddDays_(lw, ev));

      const bd = bdCol >= 0 ? plantosAsDate_(row[bdCol]) : null;

      out.push({
        uid: uid,
        nickname: nick,
        primary: primary,
        genus: inferredGenus,
        species: taxon,
        taxon: taxon,
        gs: gs,
        classification: gs,
        location: loc,
        lastWatered: lw ? plantosFmtDate_(lw) : '',
        waterEveryDays: evCol >= 0 ? plantosSafeStr_(row[evCol]) : '',
        everyDays: evCol >= 0 ? plantosSafeStr_(row[evCol]) : '',
        due: due,
        birthday: bd ? plantosFmtDate_(bd) : '',
        medium: medCol >= 0 ? plantosSafeStr_(row[medCol]).trim() : '',
        substrate: medCol >= 0 ? plantosSafeStr_(row[medCol]).trim() : '',
        potSize: potCol >= 0 ? plantosSafeStr_(row[potCol]).trim() : '',
        humanPlantId: pidCol >= 0 ? plantosSafeStr_(row[pidCol]).trim() : '',
        plantPageUrl: ppCol >= 0 ? plantosSafeStr_(row[ppCol]).trim() : '',
        // Lite: these fields omitted to reduce payload. Full data via plantosGetPlant(uid).
        folderId: '', folderUrl: '', careDocUrl: '',
        lastFertilized: lfCol >= 0 && plantosAsDate_(row[lfCol]) ? plantosFmtDate_(plantosAsDate_(row[lfCol])) : '',
        fertEveryDays: feCol >= 0 ? plantosSafeStr_(row[feCol]) : '',
        fertilizeEveryDays: feCol >= 0 ? plantosSafeStr_(row[feCol]) : '',
        potMaterial: potMatCol >= 0 ? plantosSafeStr_(row[potMatCol]).trim() : '', // FIX #15
        potShape:    potShpCol >= 0 ? plantosSafeStr_(row[potShpCol]).trim() : '', // FIX #15
        cultivar:    cultivarCol >= 0 ? plantosSafeStr_(row[cultivarCol]).trim() : '', // FIX #15
        purchasePrice: purchCol >= 0 ? plantosSafeStr_(row[purchCol]).trim() : '',
        thumbUrl:    thumbCol >= 0 ? plantosSafeStr_(row[thumbCol]).trim() : '',
        viewUrl:     viewCol >= 0 ? plantosSafeStr_(row[viewCol]).trim() : '',
      });
    } catch(e) {
      let failUid = '';
      try { failUid = plantosSafeStr_(values[r][uidCol]).trim(); } catch(x) {}
      const msg = 'Row ' + (r+1) + (failUid ? ' (UID ' + failUid + ')' : '') + ': ' + (e && e.message ? e.message : String(e));
      errors.push(msg);
      Logger.log('[PlantOS] getAllPlantsLite ' + msg);
    }
  }
  return {
    ok: errors.length === 0,
    plants: out,
    errors: errors,
    meta: { sheetRows: values.length - 1, returned: out.length, skipped: skipped, errored: errors.length, ms: Date.now() - t0, lite: true }
  };
}

/* ==================== WISHLIST ==================== */
const PLANTOS_WISHLIST_KEY = 'PLANTOS_WISHLIST';

function plantosGetWishlist() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(PLANTOS_WISHLIST_KEY);
    var list = [];
    try { list = raw ? JSON.parse(raw) : []; } catch(e) {}
    return { ok: true, wishlist: list };
  } catch(e) {
    return { ok: false, error: e && e.message ? e.message : String(e), wishlist: [] };
  }
}

function plantosAddToWishlist(item) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(PLANTOS_WISHLIST_KEY);
    var list = [];
    try { list = raw ? JSON.parse(raw) : []; } catch(e) {}
    var entry = {
      wishlistId: 'WL' + Date.now() + String(Math.floor(Math.random() * 1000)),
      genus:        String(item.genus        || '').trim(),
      taxon:        String(item.taxon        || '').trim(),
      classification: String(item.classification || '').trim(),
      cultivar:     String(item.cultivar     || '').trim(),
      infraRank:    String(item.infraRank    || '').trim(),
      infraEpithet: String(item.infraEpithet || '').trim(),
      hybridNote:   String(item.hybridNote   || '').trim(),
      notes:        String(item.notes        || '').trim(),
      dateAdded: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    };
    list.unshift(entry);
    PropertiesService.getScriptProperties().setProperty(PLANTOS_WISHLIST_KEY, JSON.stringify(list));
    return { ok: true, item: entry, wishlist: list };
  } catch(e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function plantosRemoveFromWishlist(wishlistId) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(PLANTOS_WISHLIST_KEY);
    var list = [];
    try { list = raw ? JSON.parse(raw) : []; } catch(e) {}
    list = list.filter(function(i) { return i.wishlistId !== String(wishlistId); });
    PropertiesService.getScriptProperties().setProperty(PLANTOS_WISHLIST_KEY, JSON.stringify(list));
    return { ok: true, wishlist: list };
  } catch(e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function plantosUpdateWishlistItem(wishlistId, updates) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(PLANTOS_WISHLIST_KEY);
    var list = [];
    try { list = raw ? JSON.parse(raw) : []; } catch(e) {}
    var idx = list.findIndex(function(i) { return i.wishlistId === String(wishlistId); });
    if (idx < 0) return { ok: false, error: 'Item not found' };
    var allowed = ['genus', 'taxon', 'classification', 'cultivar', 'infraRank', 'infraEpithet', 'hybridNote', 'notes'];
    var patch = {};
    allowed.forEach(function(k) { if (updates[k] !== undefined) patch[k] = updates[k]; });
    list[idx] = Object.assign({}, list[idx], patch);
    PropertiesService.getScriptProperties().setProperty(PLANTOS_WISHLIST_KEY, JSON.stringify(list));
    return { ok: true, item: list[idx], wishlist: list };
  } catch(e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}
