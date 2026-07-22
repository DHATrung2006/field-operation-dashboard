// ============================================================
// table.js — Detail table rendering with sort and pagination
// ============================================================

import { CONFIG } from "../config/config.js";
import { el, getStatusColor } from "./utils.js";

const PAGE_SIZE = 20;
let currentPage = 1;
let currentSort = { key: "date", dir: "asc" };
let currentData = [];

// ── Main render ───────────────────────────────────────────────

export function renderDetailTable(filteredData) {
  currentData = [...filteredData];
  currentPage = 1;
  applySort();
  renderPage();
  renderPagination();
}

// ── Sort ──────────────────────────────────────────────────────

export function bindTableSort() {
  document.querySelectorAll("[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (currentSort.key === key) {
        currentSort.dir = currentSort.dir === "asc" ? "desc" : "asc";
      } else {
        currentSort.key = key;
        currentSort.dir = "asc";
      }
      // Update sort icons
      document.querySelectorAll("[data-sort]").forEach((h) => h.classList.remove("sort--asc", "sort--desc"));
      th.classList.add(currentSort.dir === "asc" ? "sort--asc" : "sort--desc");

      currentPage = 1;
      applySort();
      renderPage();
      renderPagination();
    });
  });
}

function applySort() {
  const { key, dir } = currentSort;
  currentData.sort((a, b) => {
    const va = (a[key] || "").toString().toLowerCase();
    const vb = (b[key] || "").toString().toLowerCase();
    if (va < vb) return dir === "asc" ? -1 : 1;
    if (va > vb) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

// ── Render Page ────────────────────────────────────────────────

function renderPage() {
  const tbody = document.getElementById("detail-tbody");
  if (!tbody) return;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = currentData.slice(start, start + PAGE_SIZE);

  if (pageRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="table-empty">${CONFIG.LANG.no_data}</td></tr>`;
    return;
  }

  tbody.innerHTML = pageRows.map((row) => buildRow(row)).join("");

  // Update row count label
  const countEl = document.getElementById("table-row-count");
  if (countEl) {
    countEl.textContent = `${start + 1}–${Math.min(start + PAGE_SIZE, currentData.length)} / ${currentData.length} bản ghi`;
  }
}

function buildRow(row) {
  const statusColor = getStatusColor(row.status);
  const remarkHtml = row.remark
    ? `<span class="table-remark">${row.remark}</span>`
    : `<span class="table-empty-cell">—</span>`;

  return `
    <tr class="table-row">
      <td class="td-date">${row.date}</td>
      <td class="td-store">
        <div class="td-store-inner">
          <span class="td-store-code">${row.storeCode || ""}</span>
          <span class="td-store-name">${row.storeName}</span>
        </div>
      </td>
      <td class="td-brand">
        <span class="brand-chip brand-chip--${sanitizeClass(row.brand)}">${row.brand}</span>
      </td>
      <td class="td-project">${row.project}</td>
      <td class="td-supervisor">${row.supervisor}</td>
      <td class="td-time">
        <span class="time-badge">${row.workingTime}</span>
      </td>
      <td class="td-shift">${row.shiftType || "—"}</td>
      <td class="td-status">
        <span class="status-badge" style="--status-color:${statusColor}">${row.status}</span>
      </td>
      <td class="td-route">${row.route || "—"}</td>
      <td class="td-remark">${remarkHtml}</td>
    </tr>
  `;
}

// ── Pagination ────────────────────────────────────────────────

function renderPagination() {
  const container = document.getElementById("table-pagination");
  if (!container) return;

  const totalPages = Math.ceil(currentData.length / PAGE_SIZE);
  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  const pages = getPaginationRange(currentPage, totalPages);

  container.innerHTML = `
    <button class="page-btn" ${currentPage === 1 ? "disabled" : ""} data-page="${currentPage - 1}">‹</button>
    ${pages.map((p) =>
      p === "..."
        ? `<span class="page-ellipsis">…</span>`
        : `<button class="page-btn ${p === currentPage ? "page-btn--active" : ""}" data-page="${p}">${p}</button>`
    ).join("")}
    <button class="page-btn" ${currentPage === totalPages ? "disabled" : ""} data-page="${currentPage + 1}">›</button>
  `;

  container.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = parseInt(btn.dataset.page);
      if (!isNaN(p) && p >= 1 && p <= totalPages) {
        currentPage = p;
        renderPage();
        renderPagination();
        document.getElementById("detail-table-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

function getPaginationRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const range = [1];
  if (current > 3) range.push("...");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) range.push(i);
  if (current < total - 2) range.push("...");
  range.push(total);
  return range;
}

// ── Helpers ────────────────────────────────────────────────────

function sanitizeClass(str) {
  return (str || "").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
}
