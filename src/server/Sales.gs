/* ===================== SALES TRACKER ===================== */
/* Sales listings — tracks a plant being listed/sold via marketplaces.
   Stored in PropertiesService (JSON), per-user via plantosUserKey_().
   Links to plant UID; status transitions: Drafted → Listed → Pending → Sold (or Withdrawn). */

const PLANTOS_SALES_KEY = 'PLANTOS_SALES';

const SALE_STATUSES = ['Drafted', 'Listed', 'Pending', 'Sold', 'Withdrawn'];

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
  var listingId = 'SALE_' + Date.now();
  var now = plantosFmtDate_(plantosNow_());
  var status = plantosSafeStr_(payload.status || 'Drafted').trim();
  if (SALE_STATUSES.indexOf(status) < 0) status = 'Drafted';
  var listing = {
    listingId: listingId,
    plantUID: plantosSafeStr_(payload.plantUID || '').trim(),
    plantName: plantosSafeStr_(payload.plantName || '').trim(),
    status: status,
    listPrice: plantosSafeStr_(payload.listPrice || '').trim(),
    salePrice: plantosSafeStr_(payload.salePrice || '').trim(),
    listingUrl: plantosSafeStr_(payload.listingUrl || '').trim(),
    listingLocation: plantosSafeStr_(payload.listingLocation || '').trim(),
    buyer: plantosSafeStr_(payload.buyer || '').trim(),
    notes: plantosSafeStr_(payload.notes || '').trim(),
    shipped: !!payload.shipped,
    trackingNumber: plantosSafeStr_(payload.trackingNumber || '').trim(),
    createdAt: now,
    listedAt: status === 'Listed' ? now : '',
    soldAt: status === 'Sold' ? now : ''
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
  var allowed = ['plantName','listPrice','salePrice','listingUrl','listingLocation','buyer','notes','shipped','trackingNumber'];
  patch = patch || {};
  for (var k = 0; k < allowed.length; k++) {
    var field = allowed[k];
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      sales[idx][field] = field === 'shipped' ? !!patch[field] : plantosSafeStr_(patch[field] || '').trim();
    }
  }
  plantosSaveSales_(sales);
  return { ok: true, listing: sales[idx] };
}

function plantosUpdateSaleStatus(listingId, newStatus, salePrice) {
  listingId = plantosSafeStr_(listingId).trim();
  if (!listingId) return { ok: false, error: 'Missing listingId' };
  newStatus = plantosSafeStr_(newStatus).trim();
  if (SALE_STATUSES.indexOf(newStatus) < 0) return { ok: false, error: 'Invalid status: ' + newStatus };
  var sales = plantosGetSales();
  var idx = -1;
  for (var i = 0; i < sales.length; i++) { if (sales[i].listingId === listingId) { idx = i; break; } }
  if (idx < 0) return { ok: false, error: 'Listing not found' };
  var now = plantosFmtDate_(plantosNow_());
  sales[idx].status = newStatus;
  if (newStatus === 'Listed' && !sales[idx].listedAt) sales[idx].listedAt = now;
  if (newStatus === 'Sold') {
    sales[idx].soldAt = now;
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

/* Sum revenue from Sold sales listings (used by plantosHome() dashboard). */
function plantosSalesRevenueSummary_() {
  var sales = plantosGetSales();
  var totalRevenue = 0;
  var monthlySales = {};
  for (var i = 0; i < sales.length; i++) {
    var s = sales[i];
    if (s.status !== 'Sold') continue;
    var raw = s.salePrice || s.listPrice || '';
    var v = parseFloat(String(raw).replace(/[$,]/g, ''));
    if (isNaN(v) || v <= 0) continue;
    totalRevenue += v;
    if (s.soldAt) {
      var ym = String(s.soldAt).slice(0, 7);
      monthlySales[ym] = (monthlySales[ym] || 0) + v;
    }
  }
  return { totalRevenue: Math.round(totalRevenue * 100) / 100, monthlySales: monthlySales };
}
