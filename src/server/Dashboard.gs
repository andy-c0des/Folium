/* ===================== DASHBOARD METRICS ===================== */

function plantosDashboard() {
  var t0 = Date.now();
  var inv = plantosReadInventory_();
  var values = inv.values, hmap = inv.hmap;
  var H = PLANTOS_BACKEND_CFG.HEADERS;

  // Column indices
  var uidCol      = plantosCol_(hmap, H.UID);
  var genusCol    = plantosCol_(hmap, H.GENUS);
  var priceCol    = plantosCol_(hmap, H.PURCHASE_PRICE);
  var birthdayCol = plantosCol_(hmap, H.BIRTHDAY);
  var aliveCol    = plantosCol_(hmap, 'Alive');
  var inColCol    = plantosCol_(hmap, 'In Collection');

  // Watering / fertilizer / progress columns (for overdue counts)
  var lastWateredCol = plantosCol_(hmap, H.LAST_WATERED);
  var everyDaysCol   = plantosColMulti_(hmap, H.WATER_EVERY_DAYS, H.WATER_EVERY_DAYS_ALT);
  var lastFertCol    = plantosCol_(hmap, H.LAST_FERTILIZED);
  var fertEveryCol   = plantosCol_(hmap, H.FERT_EVERY_DAYS);
  var lastProgressCol = plantosCol_(hmap, H.LAST_PROGRESS_UPDATE);

  var PROGRESS_INTERVAL = 14;
  var now = plantosNow_();

  // Accumulators
  var totalPlants = 0, totalSpentCurrent = 0, totalSpentAllTime = 0;
  var genusCounts = {};
  var monthlyPurchases = {};
  var waterOverdue = 0, fertOverdue = 0, progressOverdue = 0;

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var uid = uidCol >= 0 ? plantosSafeStr_(row[uidCol]).trim() : '';
    if (!uid) continue;

    // Parse Alive / In Collection (if columns exist)
    var alive = true, inCollection = true;
    if (aliveCol >= 0) {
      var a = String(row[aliveCol] || '').toLowerCase().trim();
      if (a && (a === 'false' || a === 'no' || a === 'dead' || a === '0')) alive = false;
    }
    if (inColCol >= 0) {
      var ic = String(row[inColCol] || '').toLowerCase().trim();
      if (ic && (ic === 'false' || ic === 'no' || ic === '0')) inCollection = false;
    }

    // Purchase price (all-time = every row with a price)
    var rawPrice = priceCol >= 0 ? plantosSafeStr_(row[priceCol]).trim() : '';
    var price = rawPrice ? parseFloat(String(rawPrice).replace(/[$,]/g, '')) : NaN;
    if (!isNaN(price) && price > 0) totalSpentAllTime += price;

    // Birthday → monthly purchases
    if (birthdayCol >= 0 && !isNaN(price) && price > 0) {
      var bd = plantosAsDate_(row[birthdayCol]);
      if (bd) {
        var tz = Session.getScriptTimeZone();
        var ym = Utilities.formatDate(bd, tz, 'yyyy-MM');
        monthlyPurchases[ym] = (monthlyPurchases[ym] || 0) + price;
      }
    }

    // Living collection metrics
    if (alive && inCollection) {
      totalPlants++;

      if (!isNaN(price) && price > 0) totalSpentCurrent += price;

      // Genus
      var genus = genusCol >= 0 ? plantosSafeStr_(row[genusCol]).trim() : '';
      if (genus) genusCounts[genus] = (genusCounts[genus] || 0) + 1;

      // Water overdue
      var waterEvery = everyDaysCol >= 0 ? Number(row[everyDaysCol]) : NaN;
      if (!isNaN(waterEvery) && waterEvery > 0) {
        var lw = lastWateredCol >= 0 ? plantosAsDate_(row[lastWateredCol]) : null;
        if (!lw || plantosAddDays_(lw, waterEvery) <= now) waterOverdue++;
      }

      // Fert overdue
      var fertEvery = fertEveryCol >= 0 ? Number(row[fertEveryCol]) : NaN;
      if (!isNaN(fertEvery) && fertEvery > 0) {
        var lf = lastFertCol >= 0 ? plantosAsDate_(row[lastFertCol]) : null;
        if (!lf || plantosAddDays_(lf, fertEvery) <= now) fertOverdue++;
      }

      // Progress overdue
      if (lastProgressCol >= 0) {
        var lp = plantosAsDate_(row[lastProgressCol]);
        if (!lp || plantosAddDays_(lp, PROGRESS_INTERVAL) <= now) progressOverdue++;
      }
    }
  }

  // ── Props & Grafts ──
  var props = plantosGetProps();
  var grafts = plantosGetGrafts();
  var TERMINAL = { Graduated: 1, Failed: 1, Sold: 1 };

  var activeProps = 0, propStatusCounts = {};
  var totalSoldRevenue = 0, monthlySales = {};
  for (var i = 0; i < props.length; i++) {
    var p = props[i];
    var st = p.status || 'Trying';
    propStatusCounts[st] = (propStatusCounts[st] || 0) + 1;
    if (!TERMINAL[st]) activeProps++;
    if (st === 'Sold' && p.priceSold) {
      var pv = parseFloat(String(p.priceSold).replace(/[$,]/g, ''));
      if (!isNaN(pv) && pv > 0) {
        totalSoldRevenue += pv;
        if (p.soldDate) {
          var sm = String(p.soldDate).slice(0, 7);
          monthlySales[sm] = (monthlySales[sm] || 0) + pv;
        }
      }
    }
  }

  var activeGrafts = 0, graftStatusCounts = {};
  for (var j = 0; j < grafts.length; j++) {
    var g = grafts[j];
    var gs = g.status || 'Trying';
    graftStatusCounts[gs] = (graftStatusCounts[gs] || 0) + 1;
    if (!TERMINAL[gs]) activeGrafts++;
    if (gs === 'Sold' && g.priceSold) {
      var gv = parseFloat(String(g.priceSold).replace(/[$,]/g, ''));
      if (!isNaN(gv) && gv > 0) {
        totalSoldRevenue += gv;
        if (g.soldDate) {
          var gm = String(g.soldDate).slice(0, 7);
          monthlySales[gm] = (monthlySales[gm] || 0) + gv;
        }
      }
    }
  }

  return {
    totalPlants: totalPlants,
    activeProps: activeProps,
    activeGrafts: activeGrafts,
    totalSpentCurrent: Math.round(totalSpentCurrent * 100) / 100,
    totalSpentAllTime: Math.round(totalSpentAllTime * 100) / 100,
    totalSoldRevenue: Math.round(totalSoldRevenue * 100) / 100,
    genusCounts: genusCounts,
    propStatusCounts: propStatusCounts,
    graftStatusCounts: graftStatusCounts,
    monthlyPurchases: monthlyPurchases,
    monthlySales: monthlySales,
    waterOverdue: waterOverdue,
    fertOverdue: fertOverdue,
    progressOverdue: progressOverdue,
    ms: Date.now() - t0
  };
}
