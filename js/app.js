// ============================================================
// app.js — Application entry point
// ============================================================

import { CONFIG } from "../config/config.js";
import { fetchAllSheets } from "./api.js";
import { populateFilterDropdowns, bindFilterEvents } from "./filter.js";
import { bindTableSort } from "./table.js";
import * as dashboard from "./dashboard.js";
import { showToast } from "./utils.js";

// ── Bootstrap ─────────────────────────────────────────────────

async function initialize() {
  console.info("[app] Field Operation Dashboard — Starting...");

  // Show loading state immediately
  dashboard.showLoading(true);
  updateLiveClock();

  try {
    // 1. Fetch all Google Sheet data (or mock)
    const data = await fetchAllSheets();
    console.info(`[app] Data loaded: ${data.schedule.length} schedule rows`, data.isMock ? "(MOCK)" : "(LIVE)");

    // 2. Populate filter dropdowns from master data
    populateFilterDropdowns();

    // 3. Bind filter event listeners → triggers dashboard.refresh()
    bindFilterEvents(() => dashboard.refresh());

    // 4. Bind table sort headers
    bindTableSort();

    // 5. Initialize dashboard (first render)
    dashboard.init();

    // 6. Set up auto-refresh
    if (CONFIG.REFRESH_INTERVAL_MS > 0) {
      setInterval(autoRefresh, CONFIG.REFRESH_INTERVAL_MS);
    }

    // 7. Show mock data notice
    if (data.isMock) {
      showToast("Đang dùng dữ liệu demo. Cài API URL trong config.js để dùng Google Sheet thực.", "info");
    }

    console.info("[app] Dashboard initialized ✓");
  } catch (err) {
    console.error("[app] Initialization failed:", err);
    dashboard.showLoading(false);
    dashboard.showError(`Không thể tải dữ liệu: ${err.message}`);
    showToast("Tải dữ liệu thất bại!", "error");
  }
}

// ── Auto Refresh ──────────────────────────────────────────────

async function autoRefresh() {
  try {
    console.info("[app] Auto-refreshing data...");
    await fetchAllSheets();
    populateFilterDropdowns();
    dashboard.refresh();
    showToast("Dữ liệu đã được cập nhật", "success");
  } catch (err) {
    console.warn("[app] Auto-refresh failed:", err);
  }
}

// ── Live Clock ─────────────────────────────────────────────────

function updateLiveClock() {
  const clockEl = document.getElementById("live-clock");
  if (!clockEl) return;

  function tick() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  tick();
  setInterval(tick, 1000);
}

// ── Manual Refresh Button ─────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  const refreshBtn = document.getElementById("btn-refresh");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.classList.add("spinning");
      await autoRefresh();
      setTimeout(() => refreshBtn.classList.remove("spinning"), 1000);
    });
  }

  // Theme toggle
  const themeBtn = document.getElementById("btn-theme");
  if (themeBtn) {
    const saved = localStorage.getItem("fodash-theme") || "dark";
    document.documentElement.setAttribute("data-theme", saved);
    themeBtn.textContent = saved === "dark" ? "☀️" : "🌙";

    themeBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("fodash-theme", next);
      themeBtn.textContent = next === "dark" ? "☀️" : "🌙";
    });
  }

  // Start
  initialize();
});
