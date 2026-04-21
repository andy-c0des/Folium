/* ===================== SALES TRACKER ===================== */
/* Sales listings — tracks a plant being listed/sold via marketplaces.
   Stored in PropertiesService (JSON), per-user via plantosUserKey_().
   Links to plant UID; status transitions: Drafted → Listed → Pending → Sold (or Withdrawn). */

const PLANTOS_SALES_KEY = 'PLANTOS_SALES';

const SALE_STATUSES = ['Drafted', 'Listed', 'Pending', 'Sold', 'Withdrawn'];

/* Normalize a unitStatuses object — ensure all keys present, all values non-negative ints,
   total === expectedQty. Falls back to placing all units in fallbackStatus if invalid. */
function salesNormalizeUnitStatuses_(raw, expectedQty, fallbackStatus, qtySold) {
  var out = { Drafted: 0, Listed: 0, Pending: 0, Sold: 0, Withdrawn: 0 };
  if (raw && typeof raw === 'object') {
    var total = 0;
    SALE_STATUSES.forEach(function(st) {
      var v = parseInt(raw[st], 10);
      if (!isNaN(v) && v > 0) { out[st] = v; total += v; }
    });
    if (total === expectedQty) return out;
    // Invalid — fall through to derive from fallback
    out = { Drafted: 0, Listed: 0, Pending: 0, Sold: 0, Withdrawn: 0 };
  }
  // Derive from fallback status + quantitySold
  var sold = parseInt(qtySold, 10);
  if (isNaN(sold) || sold < 0) sold = 0;
  if (sold > expectedQty) sold = expectedQty;
  out.Sold = sold;
  var remaining = expectedQty - sold;
  if (remaining > 0) {
    var fb = SALE_STATUSES.indexOf(fallbackStatus) >= 0 ? fallbackStatus : 'Drafted';
    if (fb === 'Sold') fb = 'Listed';  // Don't double-count Sold
    out[fb] = (out[fb] || 0) + remaining;
  }
  return out;
}

/* Read unitStatuses from a listing, migrating from legacy fields if needed. */
function salesGetUnitStatuses_(listing) {
  if (!listing) return { Drafted: 0, Listed: 0, Pending: 0, Sold: 0, Withdrawn: 0 };
  var qty = parseInt(listing.quantity, 10) || 1;
  return salesNormalizeUnitStatuses_(listing.unitStatuses, qty, listing.status || 'Drafted', listing.quantitySold);
}

function plantosGetSales() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(plantosUserKey_(PLANTOS_SALES_KEY)) || '[]'); }
  catch(e) { return []; }
}

function plantosSaveSales_(sales) {
  PropertiesService.getScriptProperties().setProperty(plantosUserKey_(PLANTOS_SALES_KEY), JSON.stringify(sales));
}

function plantosCreateSale(payload) {
  payload = payload || {};
  var sales = plantosGetSales();
  var source = plantosSafeStr_(payload.source || '').trim();
  var sourceId = plantosSafeStr_(payload.sourceId || '').trim();
  // Dedup: if a listing already exists for this sourceId, return it instead of creating a duplicate
  if (sourceId) {
    for (var di = 0; di < sales.length; di++) {
      if (sales[di].sourceId === sourceId) return { ok: true, listingId: sales[di].listingId, listing: sales[di], alreadyExists: true };
    }
  }
  var listingId = source && sourceId ? 'SALE_' + source.toUpperCase() + '_' + sourceId : 'SALE_' + Date.now();
  var now = plantosFmtDate_(plantosNow_());
  var status = plantosSafeStr_(payload.status || 'Drafted').trim();
  if (SALE_STATUSES.indexOf(status) < 0) status = 'Drafted';
  var qty = parseInt(payload.quantity, 10);
  if (isNaN(qty) || qty < 1) qty = 1;
  var qtySold = parseInt(payload.quantitySold, 10);
  if (isNaN(qtySold) || qtySold < 0) qtySold = 0;
  // Build unitStatuses: all units start in chosen status (or honor explicit payload)
  var unitStatuses = salesNormalizeUnitStatuses_(payload.unitStatuses, qty, status, qtySold);
  var listing = {
    listingId: listingId,
    plantUID: plantosSafeStr_(payload.plantUID || '').trim(),
    plantName: plantosSafeStr_(payload.plantName || '').trim(),
    status: status,
    quantity: qty,
    quantitySold: qtySold,
    source: source,
    sourceId: sourceId,
    unitStatuses: unitStatuses,
    listPrice: plantosSafeStr_(payload.listPrice || '').trim(),
    salePrice: plantosSafeStr_(payload.salePrice || '').trim(),
    listingUrl: plantosSafeStr_(payload.listingUrl || '').trim(),
    listingLocation: plantosSafeStr_(payload.listingLocation || '').trim(),
    buyer: plantosSafeStr_(payload.buyer || '').trim(),
    notes: plantosSafeStr_(payload.notes || '').trim(),
    shipped: !!payload.shipped,
    trackingNumber: plantosSafeStr_(payload.trackingNumber || '').trim(),
    orderNumber: plantosSafeStr_(payload.orderNumber || '').trim(),
    createdAt: now,
    listedAt: payload.listedAt ? plantosSafeStr_(payload.listedAt).trim() : (status === 'Listed' ? now : ''),
    soldAt: payload.soldAt ? plantosSafeStr_(payload.soldAt).trim() : (status === 'Sold' ? now : '')
  };
  sales.unshift(listing);
  plantosSaveSales_(sales);
  return { ok: true, listingId: listingId, listing: listing };
}

function plantosUpdateSale(listingId, patch) {
  listingId = plantosSafeStr_(listingId).trim();
  if (!listingId) return { ok: false, error: 'Missing listingId' };
  var sales = plantosGetSales();
  var idx = -1;
  for (var i = 0; i < sales.length; i++) { if (sales[i].listingId === listingId) { idx = i; break; } }
  if (idx < 0) return { ok: false, error: 'Listing not found' };
  var allowed = ['plantName','listPrice','salePrice','listingUrl','listingLocation','buyer','notes','shipped','trackingNumber','orderNumber','listedAt','soldAt'];
  patch = patch || {};
  for (var k = 0; k < allowed.length; k++) {
    var field = allowed[k];
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      sales[idx][field] = field === 'shipped' ? !!patch[field] : plantosSafeStr_(patch[field] || '').trim();
    }
  }
  // Quantity fields (numeric)
  if (Object.prototype.hasOwnProperty.call(patch, 'quantity')) {
    var q = parseInt(patch.quantity, 10); if (!isNaN(q) && q >= 1) sales[idx].quantity = q;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'quantitySold')) {
    var qs = parseInt(patch.quantitySold, 10); if (!isNaN(qs) && qs >= 0) sales[idx].quantitySold = qs;
  }
  // Per-unit status breakdown
  if (Object.prototype.hasOwnProperty.call(patch, 'unitStatuses')) {
    var qtyForUS = parseInt(sales[idx].quantity, 10) || 1;
    var newUS = salesNormalizeUnitStatuses_(patch.unitStatuses, qtyForUS, sales[idx].status || 'Drafted', sales[idx].quantitySold);
    sales[idx].unitStatuses = newUS;
    // Sync quantitySold + overall status from breakdown
    sales[idx].quantitySold = newUS.Sold;
    // Derive primary status: prefer Sold if all sold, else most-populated non-zero
    if (newUS.Sold === qtyForUS) {
      sales[idx].status = 'Sold';
      if (!sales[idx].soldAt) sales[idx].soldAt = plantosFmtDate_(plantosNow_());
    } else {
      // Pick highest-priority non-zero status (Pending > Listed > Drafted > Withdrawn > Sold)
      var priority = ['Pending', 'Listed', 'Drafted', 'Withdrawn', 'Sold'];
      for (var pi = 0; pi < priority.length; pi++) {
        if ((newUS[priority[pi]] || 0) > 0) { sales[idx].status = priority[pi]; break; }
      }
    }
  }
  plantosSaveSales_(sales);
  return { ok: true, listing: sales[idx] };
}

function plantosUpdateSaleStatus(listingId, newStatus, salePrice, soldAt) {
  listingId = plantosSafeStr_(listingId).trim();
  if (!listingId) return { ok: false, error: 'Missing listingId' };
  newStatus = plantosSafeStr_(newStatus).trim();
  if (SALE_STATUSES.indexOf(newStatus) < 0) return { ok: false, error: 'Invalid status: ' + newStatus };
  var sales = plantosGetSales();
  var idx = -1;
  for (var i = 0; i < sales.length; i++) { if (sales[i].listingId === listingId) { idx = i; break; } }
  if (idx < 0) return { ok: false, error: 'Listing not found' };
  var now = plantosFmtDate_(plantosNow_());
  var soldDateOverride = plantosSafeStr_(soldAt || '').trim();
  sales[idx].status = newStatus;
  if (newStatus === 'Listed' && !sales[idx].listedAt) sales[idx].listedAt = now;
  if (newStatus === 'Sold') {
    sales[idx].soldAt = soldDateOverride || sales[idx].soldAt || now;
    if (salePrice != null && String(salePrice).trim()) sales[idx].salePrice = plantosSafeStr_(salePrice).trim();
  }
  plantosSaveSales_(sales);
  return { ok: true, listing: sales[idx] };
}

function plantosDeleteSale(listingId) {
  listingId = plantosSafeStr_(listingId).trim();
  if (!listingId) return { ok: false, error: 'Missing listingId' };
  var sales = plantosGetSales();
  var next = sales.filter(function(s) { return s.listingId !== listingId; });
  if (next.length === sales.length) return { ok: false, error: 'Listing not found' };
  plantosSaveSales_(next);
  return { ok: true };
}

/* Create or upgrade a sales listing from a prop. Idempotent via sourceId.
   If a listing already exists for this propId AND the prop is now Sold,
   upgrades that listing to Sold status. Called by plantosSellProp() + backfill. */
function salesCreateFromProp_(prop) {
  if (!prop || !prop.propId) return null;
  var sales = plantosGetSales();
  // Check if a listing already exists for this propId — upgrade to Sold if prop is Sold
  for (var i = 0; i < sales.length; i++) {
    if (sales[i].sourceId === prop.propId) {
      if (prop.status === 'Sold' && sales[i].status !== 'Sold') {
        var existing = sales[i];
        var q = parseInt(existing.quantity, 10) || 1;
        existing.status = 'Sold';
        existing.quantitySold = q;
        existing.unitStatuses = { Drafted: 0, Listed: 0, Pending: 0, Sold: q, Withdrawn: 0 };
        if (prop.priceSold) existing.salePrice = plantosSafeStr_(prop.priceSold).trim();
        existing.soldAt = plantosSafeStr_(prop.soldDate || plantosFmtDate_(plantosNow_())).trim();
        plantosSaveSales_(sales);
      }
      return sales[i];
    }
  }
  var price = plantosSafeStr_(prop.priceSold || '').trim();
  var soldDate = plantosSafeStr_(prop.soldDate || '').trim() || plantosFmtDate_(plantosNow_());
  var genusSp = [plantosSafeStr_(prop.genus || '').trim(), plantosSafeStr_(prop.species || '').trim()].filter(Boolean).join(' ');
  var name = '\u2702\uFE0F ' + (genusSp || 'Prop ' + prop.propId);  // ✂ scissors icon prefix
  var listing = {
    listingId: 'SALE_PROP_' + prop.propId,
    plantUID: plantosSafeStr_(prop.parentUID || '').trim(),  // parent plant if known
    plantName: name,
    status: 'Sold',
    quantity: 1, quantitySold: 1,
    unitStatuses: { Drafted: 0, Listed: 0, Pending: 0, Sold: 1, Withdrawn: 0 },
    listPrice: price, salePrice: price,
    listingUrl: '', listingLocation: '', buyer: '', notes: 'Synced from propagation ' + prop.propId + (prop.propType ? ' (' + prop.propType + ')' : ''),
    shipped: false, trackingNumber: '', orderNumber: '',
    createdAt: soldDate, listedAt: '', soldAt: soldDate,
    source: 'prop', sourceId: prop.propId
  };
  sales.unshift(listing);
  plantosSaveSales_(sales);
  return listing;
}

/* Create or upgrade a sales listing from a graft. Idempotent via sourceId.
   Upgrades existing listing to Sold when graft is sold. */
function salesCreateFromGraft_(graft) {
  if (!graft || !graft.graftId) return null;
  var sales = plantosGetSales();
  for (var i = 0; i < sales.length; i++) {
    if (sales[i].sourceId === graft.graftId) {
      if (graft.status === 'Sold' && sales[i].status !== 'Sold') {
        var existing = sales[i];
        var q = parseInt(existing.quantity, 10) || 1;
        existing.status = 'Sold';
        existing.quantitySold = q;
        existing.unitStatuses = { Drafted: 0, Listed: 0, Pending: 0, Sold: q, Withdrawn: 0 };
        if (graft.priceSold) existing.salePrice = plantosSafeStr_(graft.priceSold).trim();
        existing.soldAt = plantosSafeStr_(graft.soldDate || plantosFmtDate_(plantosNow_())).trim();
        plantosSaveSales_(sales);
      }
      return sales[i];
    }
  }
  var price = plantosSafeStr_(graft.priceSold || '').trim();
  var soldDate = plantosSafeStr_(graft.soldDate || '').trim() || plantosFmtDate_(plantosNow_());
  var scion = [plantosSafeStr_(graft.scionGenus || '').trim(), plantosSafeStr_(graft.scionSpecies || '').trim()].filter(Boolean).join(' ');
  var rootstock = [plantosSafeStr_(graft.rootstockGenus || '').trim(), plantosSafeStr_(graft.rootstockSpecies || '').trim()].filter(Boolean).join(' ');
  var name = '\uD83D\uDD17 ' + (scion || 'Graft') + (rootstock ? ' on ' + rootstock : '');
  var listing = {
    listingId: 'SALE_GRAFT_' + graft.graftId,
    plantUID: '',
    plantName: name,
    status: 'Sold',
    quantity: 1, quantitySold: 1,
    unitStatuses: { Drafted: 0, Listed: 0, Pending: 0, Sold: 1, Withdrawn: 0 },
    listPrice: price, salePrice: price,
    listingUrl: '', listingLocation: '', buyer: '', notes: 'Synced from graft ' + graft.graftId + (graft.graftTechnique ? ' (' + graft.graftTechnique + ')' : ''),
    shipped: false, trackingNumber: '', orderNumber: '',
    createdAt: soldDate, listedAt: '', soldAt: soldDate,
    source: 'graft', sourceId: graft.graftId
  };
  sales.unshift(listing);
  plantosSaveSales_(sales);
  return listing;
}

/* Backfill sales tracker from the Archive — imports any plant that was archived
   as 'rehomed' with a salePrice. Also imports sold props + grafts as listings.
   Skips entries that already have a listing (via sourceId or plantUID). */
function plantosBackfillSalesFromArchive() {
  var archive;
  try { archive = plantosGetArchive(); } catch(e) { return { ok: false, error: 'Archive unavailable: ' + (e && e.message || String(e)) }; }
  if (!Array.isArray(archive) || archive.length === 0) return { ok: true, imported: 0, skipped: 0, total: 0 };
  var sales = plantosGetSales();
  // Build a set of plantUIDs that already have at least one Sold listing — avoid duplicates
  var existingSoldUids = {};
  for (var i = 0; i < sales.length; i++) {
    var s = sales[i];
    if (s.status === 'Sold' && s.plantUID) existingSoldUids[String(s.plantUID).trim()] = true;
  }
  var imported = 0, skipped = 0, scanned = 0;
  for (var j = 0; j < archive.length; j++) {
    var a = archive[j];
    if (!a || a.type !== 'rehomed') continue;
    var price = plantosSafeStr_(a.salePrice || '').trim();
    if (!price) { skipped++; continue; }
    scanned++;
    var uid = plantosSafeStr_(a.uid || '').trim();
    if (uid && existingSoldUids[uid]) { skipped++; continue; }
    var soldDate = plantosSafeStr_(a.rehomeDate || a.archivedAt || '').trim();
    var listing = {
      listingId: 'SALE_BF_' + Date.now() + '_' + j,
      plantUID: uid,
      plantName: plantosSafeStr_(a.primary || a.genus || ('Plant ' + uid)).trim(),
      status: 'Sold',
      quantity: 1,
      quantitySold: 1,
      listPrice: price,
      salePrice: price,
      listingUrl: '',
      listingLocation: '',
      buyer: '',
      notes: 'Backfilled from Archive' + (a.cause ? ' \u00B7 ' + a.cause : '') + (a.note ? ' \u00B7 ' + a.note : ''),
      shipped: false,
      trackingNumber: '',
      orderNumber: '',
      createdAt: soldDate || plantosFmtDate_(plantosNow_()),
      listedAt: '',
      soldAt: soldDate || plantosFmtDate_(plantosNow_())
    };
    sales.unshift(listing);
    if (uid) existingSoldUids[uid] = true;
    imported++;
  }
  if (imported > 0) plantosSaveSales_(sales);

  // Also import sold props
  var propImported = 0, propSkipped = 0;
  try {
    var props = plantosGetProps();
    for (var pi = 0; pi < props.length; pi++) {
      var p = props[pi];
      if (p.status !== 'Sold') continue;
      scanned++;
      // salesCreateFromProp_ is idempotent — returns existing listing if sourceId matches
      var beforeLen = plantosGetSales().length;
      var created = salesCreateFromProp_(p);
      if (created && plantosGetSales().length > beforeLen) { propImported++; imported++; }
      else propSkipped++;
    }
  } catch(e) { /* props unavailable — ignore */ }

  // Also import sold grafts
  var graftImported = 0, graftSkipped = 0;
  try {
    var grafts = plantosGetGrafts();
    for (var gi = 0; gi < grafts.length; gi++) {
      var g = grafts[gi];
      if (g.status !== 'Sold') continue;
      scanned++;
      var beforeLen2 = plantosGetSales().length;
      var created2 = salesCreateFromGraft_(g);
      if (created2 && plantosGetSales().length > beforeLen2) { graftImported++; imported++; }
      else graftSkipped++;
    }
  } catch(e) { /* grafts unavailable — ignore */ }

  return { ok: true, imported: imported, skipped: skipped + propSkipped + graftSkipped, total: scanned,
    fromArchive: scanned - propImported - graftImported - propSkipped - graftSkipped,
    fromProps: propImported, fromGrafts: graftImported };
}

/* Sum revenue from Sold sales listings (used by plantosHome() dashboard).
   If listing has quantitySold > 0, use that; else if status=Sold use quantity; else 1. */
function plantosSalesRevenueSummary_() {
  var sales = plantosGetSales();
  var totalRevenue = 0;
  var monthlySales = {};
  for (var i = 0; i < sales.length; i++) {
    var s = sales[i];
    // Skip listings sourced from props/grafts — those are already counted by
    // the prop/graft aggregators in plantosHome() to avoid double-counting.
    if (s.source === 'prop' || s.source === 'graft') continue;
    var us = salesGetUnitStatuses_(s);
    var qty = us.Sold || 0;
    if (qty <= 0) continue;
    var raw = s.salePrice || s.listPrice || '';
    var v = parseFloat(String(raw).replace(/[$,]/g, ''));
    if (isNaN(v) || v <= 0) continue;
    var total = v * qty;
    totalRevenue += total;
    if (s.soldAt) {
      var ym = String(s.soldAt).slice(0, 7);
      monthlySales[ym] = (monthlySales[ym] || 0) + total;
    }
  }
  return { totalRevenue: Math.round(totalRevenue * 100) / 100, monthlySales: monthlySales };
}
