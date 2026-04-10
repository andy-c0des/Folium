/* ===================== DASHBOARD (backward compat wrapper) ===================== */
/* Dashboard metrics are now computed inside plantosHome() to avoid duplicate sheet reads.
   This wrapper exists for backward compatibility if any client still calls plantosDashboard(). */

function plantosDashboard() {
  return plantosHome();
}
