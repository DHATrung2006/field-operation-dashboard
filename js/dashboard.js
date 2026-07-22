// ============================================================
// dashboard.js — Central orchestrator for all dashboard panels
// ============================================================

import { getMasterData } from "./api.js";
import { applyFilters } from "./filter.js";
import { calculateKPI, renderKPI, renderStoreSummary, renderWorkingTimeSummary } from "./kpi.js";
import { renderTimeline } from "./timeline.js";
import { renderDetailTable } from "./table.js";
import { renderCharts } from "./chart.js";
import { CONFIG } from "../config/config.js";

let _isInitialized = false;

// ── Initialize ────────────────────────────────────────────────

export function init() {
  _isInitialized = true;
  refresh();
}

// ── Refresh ───────────────────────────────────────────────────

/**
 * Re-read filters, re-filter data, and re-render all panels.
 * Called on any filter change or auto-refresh.
 */
export function refresh() {
  if (!_isInitialized) return;

  const { schedule, lastFetched, isMock } = getMasterData();

  showLoading(true);

  // Use requestAnimationFrame to allow the loading state to paint first
  requestAnimationFrame(() => {
    try {
      const filtered = applyFilters(schedule);

      // ① KPI Cards
      const kpi = calculateKPI(filtered);
      renderKPI(kpi);

      // ② Store Summary Pills
      renderStoreSummary(filtered);

      // ③ Working Time Summary
      renderWorkingTimeSummary(filtered);

      // ④ Timeline
      renderTimeline(filtered);

      // ⑤ Detail Table
      renderDetailTable(filtered);

      // ⑥ Charts
      renderCharts(filtered);

      // Update timestamps
      updateLastRefreshed(lastFetched, isMock);
      updateFilteredCount(filtered.length, schedule.length);

    } catch (err) {
      console.error("[dashboard] Render error:", err);
      showError(err.message);
    } finally {
      showLoading(false);
    }
  });
}

// ── Loading / Error states ────────────────────────────────────

export function showLoading(visible) {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) overlay.style.display = visible ? "flex" : "none";

  const skeleton = document.querySelectorAll(".skeleton");
  skeleton.forEach((s) => s.classList.toggle("skeleton--active", visible));
}

export function showError(message) {
  const errEl = document.getElementById("error-banner");
  if (!errEl) return;
  errEl.textContent = `⚠️ Lỗi: ${message}`;
  errEl.style.display = "block";
  setTimeout(() => { errEl.style.display = "none"; }, 6000);
}

// ── Helpers ────────────────────────────────────────────────────

function updateLastRefreshed(date, isMock) {
  const el = document.getElementById("last-updated");
  if (!el) return;
  if (!date) return;

  const time = date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const mockBadge = isMock ? ' <span class="mock-badge">DEMO</span>' : "";
  el.innerHTML = `${CONFIG.LANG.last_updated}: ${time}${mockBadge}`;
}

function updateFilteredCount(filtered, total) {
  const el = document.getElementById("filtered-count");
  if (el) el.textContent = `Hiển thị ${filtered} / ${total} bản ghi`;
}
