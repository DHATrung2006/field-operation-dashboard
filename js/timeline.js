// ============================================================
// timeline.js — Horizontal time-block timeline renderer
// ============================================================

import { CONFIG } from "../config/config.js";
import { groupBy, parseTimeRange, timeToPercent, fmtHour, el, getBrandColor } from "./utils.js";

const { start: H_START, end: H_END } = CONFIG.WORKING_HOURS;
const HOURS = Array.from({ length: H_END - H_START + 1 }, (_, i) => H_START + i);

// ── Main render ───────────────────────────────────────────────

/**
 * Render the timeline section from filteredData.
 * Groups rows by Brand (or by StoreName when a store is selected).
 */
export function renderTimeline(filteredData) {
  const container = document.getElementById("timeline-container");
  if (!container) return;

  if (filteredData.length === 0) {
    container.innerHTML = `<div class="timeline-empty"><span>📭</span><p>${CONFIG.LANG.no_data}</p></div>`;
    return;
  }

  container.innerHTML = "";

  // Header row: hour labels
  const header = buildHeader();
  container.appendChild(header);

  // Group by brand for clear visual separation
  const byBrand = groupBy(filteredData, "brand");

  Object.entries(byBrand).forEach(([brand, rows]) => {
    const brandColor = getBrandColor(brand);
    const section = el("div", { class: "timeline-brand-section" });
    section.style.setProperty("--brand-color", brandColor.primary);

    // Brand label row
    const labelRow = el("div", { class: "timeline-brand-label" });
    const dot = el("span", { class: "timeline-brand-dot" });
    dot.style.background = brandColor.primary;
    const brandName = el("span", { class: "timeline-brand-name" }, brand);
    const count = el("span", { class: "timeline-brand-count" }, `${rows.length} ca`);
    labelRow.append(dot, brandName, count);
    section.appendChild(labelRow);

    // Timeline row: all shifts for this brand
    const timeRow = el("div", { class: "timeline-row" });

    // Background grid
    const grid = buildGrid();
    timeRow.appendChild(grid);

    // Shift blocks
    rows.forEach((row) => {
      const slots = parseTimeRange(row.workingTime);
      slots.forEach((slot) => {
        const block = buildShiftBlock(slot, row, brandColor);
        if (block) timeRow.appendChild(block);
      });
    });

    section.appendChild(timeRow);

    // QC audit hint: find gaps
    const hints = findQCAuditHints(rows);
    if (hints.length > 0) {
      const hintBar = buildQCHints(hints, brandColor);
      section.appendChild(hintBar);
    }

    container.appendChild(section);
  });
}

// ── Header ────────────────────────────────────────────────────

function buildHeader() {
  const header = el("div", { class: "timeline-header" });
  const spacer = el("div", { class: "timeline-label-spacer" });
  header.appendChild(spacer);

  const hoursRow = el("div", { class: "timeline-hours-row" });
  HOURS.forEach((h) => {
    const tick = el("div", { class: "timeline-hour-tick" }, fmtHour(h));
    tick.style.left = `${timeToPercent(h)}%`;
    hoursRow.appendChild(tick);
  });

  header.appendChild(hoursRow);
  return header;
}

// ── Grid lines ────────────────────────────────────────────────

function buildGrid() {
  const grid = el("div", { class: "timeline-grid" });
  HOURS.forEach((h) => {
    const line = el("div", { class: "timeline-grid-line" });
    line.style.left = `${timeToPercent(h)}%`;
    grid.appendChild(line);
  });
  return grid;
}

// ── Shift Block ────────────────────────────────────────────────

function buildShiftBlock(slot, row, brandColor) {
  const { start, end } = slot;
  if (start >= end || end > H_END || start < H_START) return null;

  const leftPct = timeToPercent(start);
  const widthPct = timeToPercent(end) - leftPct;

  const block = el("div", { class: "timeline-block" });
  block.style.cssText = `
    left: ${leftPct}%;
    width: ${widthPct}%;
    background: ${brandColor.gradient};
  `;

  // Status modifier
  if (row.status === "Off") block.classList.add("timeline-block--off");
  if (row.status === "Training") block.classList.add("timeline-block--training");
  if (row.status === "Pending") block.classList.add("timeline-block--pending");

  // Inner label
  const label = el("span", { class: "timeline-block-label" },
    `${row.storeName ? row.storeName.split(" ").slice(-1)[0] : ""} ${row.workingTime}`
  );
  block.appendChild(label);

  // Tooltip on hover
  block.setAttribute("title",
    `📍 ${row.storeName}\n🏷 ${row.brand} — ${row.project}\n⏰ ${row.workingTime}\n👤 ${row.supervisor}\n📌 ${row.status}${row.remark ? "\n📝 " + row.remark : ""}`
  );

  // Rich tooltip (popup)
  block.addEventListener("mouseenter", (e) => showTooltip(e, row, brandColor));
  block.addEventListener("mouseleave", hideTooltip);

  return block;
}

// ── QC Audit Hints ────────────────────────────────────────────

/**
 * Find hours with NO coverage → ideal QC audit windows.
 */
function findQCAuditHints(rows) {
  const covered = new Set();
  rows.forEach((row) => {
    const slots = parseTimeRange(row.workingTime);
    slots.forEach(({ start, end }) => {
      for (let h = start; h < end; h++) covered.add(h);
    });
  });

  const gaps = [];
  let gapStart = null;
  for (let h = H_START; h < H_END; h++) {
    if (!covered.has(h)) {
      if (gapStart === null) gapStart = h;
    } else {
      if (gapStart !== null) {
        gaps.push({ start: gapStart, end: h });
        gapStart = null;
      }
    }
  }
  if (gapStart !== null) gaps.push({ start: gapStart, end: H_END });

  // Only hint gaps >= 1 hour
  return gaps.filter((g) => g.end - g.start >= 1);
}

function buildQCHints(hints, brandColor) {
  const bar = el("div", { class: "timeline-qc-bar" });

  hints.forEach(({ start, end }) => {
    const leftPct = timeToPercent(start);
    const widthPct = timeToPercent(end) - leftPct;
    const hint = el("div", { class: "timeline-qc-hint" });
    hint.style.cssText = `left: ${leftPct}%; width: ${widthPct}%;`;
    hint.setAttribute("title", `⚡ QC Audit: ${fmtHour(start)}h – ${fmtHour(end)}h`);
    hint.innerHTML = `<span class="qc-icon">⚡</span>`;
    bar.appendChild(hint);
  });

  return bar;
}

// ── Rich Tooltip ────────────────────────────────────────────────

let tooltipEl = null;

function showTooltip(event, row, brandColor) {
  hideTooltip();

  tooltipEl = el("div", { class: "timeline-tooltip" });
  tooltipEl.style.setProperty("--brand-color", brandColor.primary);

  tooltipEl.innerHTML = `
    <div class="tt-header" style="background:${brandColor.gradient}">
      <strong>${row.brand}</strong>
      <span class="tt-status tt-status--${(row.status || "").toLowerCase()}">${row.status}</span>
    </div>
    <div class="tt-body">
      <div class="tt-row"><span>📍</span><span>${row.storeName}</span></div>
      <div class="tt-row"><span>📦</span><span>${row.project}</span></div>
      <div class="tt-row"><span>⏰</span><span>${row.workingTime}</span></div>
      <div class="tt-row"><span>🔄</span><span>${row.shiftType || "—"}</span></div>
      <div class="tt-row"><span>👤</span><span>${row.supervisor}</span></div>
      ${row.route ? `<div class="tt-row"><span>🗺</span><span>Tuyến ${row.route}</span></div>` : ""}
      ${row.remark ? `<div class="tt-row tt-remark"><span>📝</span><span>${row.remark}</span></div>` : ""}
    </div>
  `;

  document.body.appendChild(tooltipEl);
  positionTooltip(event);
}

function positionTooltip(event) {
  if (!tooltipEl) return;
  const { clientX, clientY } = event;
  const { innerWidth, innerHeight } = window;
  const rect = tooltipEl.getBoundingClientRect();

  let left = clientX + 16;
  let top = clientY - 8;

  if (left + rect.width > innerWidth) left = clientX - rect.width - 16;
  if (top + rect.height > innerHeight) top = innerHeight - rect.height - 8;

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

function hideTooltip() {
  if (tooltipEl) {
    tooltipEl.remove();
    tooltipEl = null;
  }
}
