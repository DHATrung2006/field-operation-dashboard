// ============================================================
// filter.js — Filter state, UI binding, and data filtering
// ============================================================

import { CONFIG } from "../config/config.js";
import { getMasterData } from "./api.js";
import { isInDateRange, uniqueValues, today, debounce } from "./utils.js";

// ── Filter State ─────────────────────────────────────────────
export const activeFilters = {
  dateFrom: today(),
  dateTo: today(),
  brand: "",
  store: "",
  supervisor: "",
  status: "",
};

// ── Apply Filters ─────────────────────────────────────────────

/**
 * Pure function: filters the full schedule array by activeFilters.
 * Returns a new filtered array.
 */
export function applyFilters(schedule) {
  return schedule.filter((row) => {
    if (!isInDateRange(row.date, activeFilters.dateFrom, activeFilters.dateTo)) return false;
    if (activeFilters.brand && row.brand !== activeFilters.brand) return false;
    if (activeFilters.store && row.storeName !== activeFilters.store) return false;
    if (activeFilters.supervisor && row.supervisor !== activeFilters.supervisor) return false;
    if (activeFilters.status && row.status !== activeFilters.status) return false;
    return true;
  });
}

// ── Populate Dropdowns ─────────────────────────────────────────

export function populateFilterDropdowns() {
  const { schedule, stores, brands, supervisors } = getMasterData();

  const allLabel = CONFIG.LANG.filter_all;

  // Brand dropdown
  fillSelect("filter-brand", brands.map((b) => b.brand), allLabel);

  // Store dropdown
  const storeNames = stores.length
    ? stores.map((s) => s.storeName)
    : uniqueValues(schedule, "storeName");
  fillSelect("filter-store", storeNames, allLabel);

  // Supervisor dropdown
  const supNames = supervisors.length
    ? supervisors.map((s) => s.name)
    : uniqueValues(schedule, "supervisor");
  fillSelect("filter-supervisor", supNames, allLabel);

  // Status dropdown (static from config)
  const statuses = Object.keys(CONFIG.STATUS_COLORS);
  fillSelect("filter-status", statuses, allLabel);
}

function fillSelect(id, options, allLabel) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = el.value;
  el.innerHTML = `<option value="">${allLabel}</option>` +
    options.map((o) => `<option value="${o}" ${o === current ? "selected" : ""}>${o}</option>`).join("");
}

// ── Event Binding ─────────────────────────────────────────────

let _onChangeCallback = null;

export function bindFilterEvents(onChange) {
  _onChangeCallback = onChange;

  const debouncedChange = debounce(() => onChange(), 250);

  // Date pickers
  bindInput("filter-date-from", (val) => {
    activeFilters.dateFrom = val;
    debouncedChange();
  });
  bindInput("filter-date-to", (val) => {
    activeFilters.dateTo = val;
    debouncedChange();
  });

  // Dropdowns
  bindSelect("filter-brand", (val) => { activeFilters.brand = val; onChange(); });
  bindSelect("filter-store", (val) => { activeFilters.store = val; onChange(); });
  bindSelect("filter-supervisor", (val) => { activeFilters.supervisor = val; onChange(); });
  bindSelect("filter-status", (val) => { activeFilters.status = val; onChange(); });

  // Reset button
  const resetBtn = document.getElementById("filter-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", resetFilters);
  }

  // Sync date inputs to today's value
  setDateInputValue("filter-date-from", activeFilters.dateFrom);
  setDateInputValue("filter-date-to", activeFilters.dateTo);
}

// ── Store Summary Pill click ──────────────────────────────────

export function setStoreFilter(storeName) {
  activeFilters.store = storeName;

  // Sync dropdown UI
  const el = document.getElementById("filter-store");
  if (el) el.value = storeName;

  if (_onChangeCallback) _onChangeCallback();
}

export function clearStoreFilter() {
  activeFilters.store = "";
  const el = document.getElementById("filter-store");
  if (el) el.value = "";
  if (_onChangeCallback) _onChangeCallback();
}

// ── Reset ─────────────────────────────────────────────────────

export function resetFilters() {
  activeFilters.dateFrom = today();
  activeFilters.dateTo = today();
  activeFilters.brand = "";
  activeFilters.store = "";
  activeFilters.supervisor = "";
  activeFilters.status = "";

  setDateInputValue("filter-date-from", activeFilters.dateFrom);
  setDateInputValue("filter-date-to", activeFilters.dateTo);

  ["filter-brand", "filter-store", "filter-supervisor", "filter-status"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  if (_onChangeCallback) _onChangeCallback();
}

// ── Helpers ────────────────────────────────────────────────────

function bindInput(id, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", (e) => handler(e.target.value));
}

function bindSelect(id, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("change", (e) => handler(e.target.value));
}

function setDateInputValue(id, isoDate) {
  const el = document.getElementById(id);
  if (el && isoDate) el.value = isoDate;
}
