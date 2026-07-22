// ============================================================
// kpi.js — KPI calculation and Store Summary rendering
// ============================================================

import { CONFIG } from "../config/config.js";
import { getMasterData } from "./api.js";
import { groupBy, countDistinct, animateCounter, el } from "./utils.js";
import { setStoreFilter, clearStoreFilter, activeFilters } from "./filter.js";

// ── KPI Calculation ───────────────────────────────────────────

/**
 * Calculate top-level KPIs from the filtered schedule.
 */
export function calculateKPI(filteredData) {
  return {
    storeCount: countDistinct(filteredData, "storeName"),
    projectCount: countDistinct(filteredData, "project"),
    pgCount: filteredData.length, // each row = 1 PG shift
    supCount: countDistinct(filteredData, "supervisor"),
    activeCount: filteredData.filter((r) => r.status === "Active").length,
    offCount: filteredData.filter((r) => r.status === "Off").length,
  };
}

/**
 * Update the KPI card DOM elements with animated counters.
 */
export function renderKPI(kpi) {
  updateCounter("kpi-stores", kpi.storeCount);
  updateCounter("kpi-projects", kpi.projectCount);
  updateCounter("kpi-pg", kpi.pgCount);
  updateCounter("kpi-supervisors", kpi.supCount);

  // Sub-labels
  setText("kpi-active", `${kpi.activeCount} Active`);
  setText("kpi-off", `${kpi.offCount} Off`);
}

// ── Store Summary Pills ────────────────────────────────────────

/**
 * Render store chain pill buttons with PG count badges.
 * Groups by store chain prefix (e.g. "GO!", "AEON", "MM").
 */
export function renderStoreSummary(filteredData) {
  const container = document.getElementById("store-summary-pills");
  if (!container) return;

  // Group by storeName
  const byStore = groupBy(filteredData, "storeName");
  const { stores } = getMasterData();

  // Build store chain grouping
  const chainMap = {};
  Object.entries(byStore).forEach(([storeName, rows]) => {
    const chain = detectChain(storeName);
    if (!chainMap[chain]) chainMap[chain] = { count: 0, stores: [] };
    chainMap[chain].count += rows.length;
    chainMap[chain].stores.push(storeName);
  });

  container.innerHTML = "";

  // "All Stores" pill
  const allPill = createPill("Tất Cả", filteredData.length, !activeFilters.store, () => {
    clearStoreFilter();
    updateActivePill(container, allPill);
  });
  container.appendChild(allPill);

  // Individual store pills
  Object.entries(byStore)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([storeName, rows]) => {
      const chain = detectChain(storeName);
      const icon = CONFIG.STORE_ICONS[chain] || CONFIG.STORE_ICONS.Default;
      const isActive = activeFilters.store === storeName;

      const pill = createPill(`${icon} ${storeName}`, rows.length, isActive, () => {
        setStoreFilter(storeName);
        updateActivePill(container, pill);
      });
      container.appendChild(pill);
    });
}

// ── Working Time Summary ───────────────────────────────────────

/**
 * Render the "Working Time per Brand" summary panel.
 */
export function renderWorkingTimeSummary(filteredData) {
  const container = document.getElementById("working-time-summary");
  if (!container) return;

  const byBrand = groupBy(filteredData, "brand");
  container.innerHTML = "";

  if (Object.keys(byBrand).length === 0) {
    container.innerHTML = `<p class="no-data">${CONFIG.LANG.no_data}</p>`;
    return;
  }

  Object.entries(byBrand).forEach(([brand, rows]) => {
    const colors = CONFIG.BRAND_COLORS[brand] || CONFIG.BRAND_COLORS.Default;

    // Collect unique time slots
    const slots = [...new Set(rows.map((r) => r.workingTime).filter(Boolean))].sort();

    const card = el("div", { class: "wt-brand-card" });
    card.style.setProperty("--brand-color", colors.primary);

    const header = el("div", { class: "wt-brand-header" });
    const dot = el("span", { class: "wt-brand-dot" });
    dot.style.background = colors.primary;
    const name = el("span", { class: "wt-brand-name" }, brand);
    const badge = el("span", { class: "wt-brand-count" }, `${rows.length} ca`);
    header.append(dot, name, badge);

    const slotsEl = el("div", { class: "wt-slots" });
    slots.forEach((s) => {
      const chip = el("span", { class: "wt-slot-chip" }, s);
      chip.style.borderColor = colors.primary + "60";
      slotsEl.appendChild(chip);
    });

    card.append(header, slotsEl);
    container.appendChild(card);
  });
}

// ── Helpers ────────────────────────────────────────────────────

function updateCounter(id, value) {
  const el = document.getElementById(id);
  if (el) animateCounter(el, value);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function createPill(label, count, isActive, onClick) {
  const pill = document.createElement("button");
  pill.className = `store-pill ${isActive ? "store-pill--active" : ""}`;
  pill.innerHTML = `<span class="pill-label">${label}</span><span class="pill-badge">${count}</span>`;
  pill.addEventListener("click", onClick);
  return pill;
}

function updateActivePill(container, activePill) {
  container.querySelectorAll(".store-pill").forEach((p) => p.classList.remove("store-pill--active"));
  activePill.classList.add("store-pill--active");
}

function detectChain(storeName) {
  const name = storeName.toUpperCase();
  if (name.includes("GO!") || name.startsWith("GO ")) return "GO!";
  if (name.includes("AEON")) return "AEON";
  if (name.includes("MM") || name.includes("MEGA MARKET")) return "MM Mega Market";
  if (name.includes("LOTTE")) return "Lotte";
  if (name.includes("EMART")) return "Emart";
  if (name.includes("COOPMART") || name.includes("CO.OP")) return "Coopmart";
  if (name.includes("BIGC") || name.includes("BIG C")) return "BigC";
  if (name.includes("VINMART") || name.includes("WINMART")) return "VinMart";
  if (name.includes("MEGA")) return "Mega Market";
  return storeName;
}
