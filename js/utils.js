// ============================================================
// utils.js — Shared helper functions
// ============================================================

import { CONFIG } from "../config/config.js";

// ── Date helpers ─────────────────────────────────────────────

/** Returns today's date as "YYYY-MM-DD" */
export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Format a Date or "YYYY-MM-DD" string to "DD/MM/YYYY" */
export function formatDate(d) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Parse "DD/MM/YYYY" → Date */
export function parseDMY(str) {
  if (!str) return null;
  // Handle both "DD/MM/YYYY" and "YYYY-MM-DD"
  if (str.includes("-") && str.indexOf("-") === 4) {
    return new Date(str + "T00:00:00");
  }
  const [dd, mm, yyyy] = str.split("/");
  if (!dd || !mm || !yyyy) return null;
  return new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T00:00:00`);
}

/** Check if two date strings represent the same day */
export function isSameDay(a, b) {
  const da = parseDMY(a);
  const db = parseDMY(b);
  if (!da || !db) return false;
  return da.toDateString() === db.toDateString();
}

/** Check if a date string is within a range [from, to] (inclusive) */
export function isInDateRange(dateStr, from, to) {
  const d = parseDMY(dateStr);
  if (!d) return false;
  if (from) {
    const f = parseDMY(from);
    if (f && d < f) return false;
  }
  if (to) {
    const t = parseDMY(to);
    if (t && d > t) return false;
  }
  return true;
}

// ── Time helpers ─────────────────────────────────────────────

/**
 * Parse a working time string like "08-11" or "8-11" → { start: 8, end: 11 }
 * Also handles "08:00-11:00" and multiple slots "08-11,15-21"
 */
export function parseTimeRange(timeStr) {
  if (!timeStr) return [];
  const slots = String(timeStr).split(",").map((s) => s.trim());
  return slots.map((slot) => {
    const parts = slot.replace(/:/g, "").split("-");
    if (parts.length < 2) return null;
    const start = parseInt(parts[0].slice(0, 2), 10);
    const end = parseInt(parts[1].slice(0, 2), 10);
    if (isNaN(start) || isNaN(end)) return null;
    return { start, end };
  }).filter(Boolean);
}

/** Calculate % position and width of a time block on the timeline */
export function timeToPercent(hour) {
  const { start, end } = CONFIG.WORKING_HOURS;
  return ((hour - start) / (end - start)) * 100;
}

/** Format hour number to display label "08", "09" ... "21" */
export function fmtHour(h) {
  return String(h).padStart(2, "0");
}

// ── Array helpers ─────────────────────────────────────────────

/** Group array of objects by a key */
export function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] ?? "Unknown";
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

/** Get unique values of a key from an array */
export function uniqueValues(arr, key) {
  return [...new Set(arr.map((item) => item[key]).filter(Boolean))].sort();
}

/** Count distinct values of a key */
export function countDistinct(arr, key) {
  return new Set(arr.map((item) => item[key]).filter(Boolean)).size;
}

// ── DOM helpers ────────────────────────────────────────────────

/** Create element with attributes and optional text */
export function el(tag, attrs = {}, text = "") {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") e.className = v;
    else if (k === "style") e.style.cssText = v;
    else e.setAttribute(k, v);
  });
  if (text) e.textContent = text;
  return e;
}

/** Safely set innerHTML with a check */
export function setHTML(selector, html) {
  const node = document.querySelector(selector);
  if (node) node.innerHTML = html;
}

// ── Debounce ───────────────────────────────────────────────────

export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ── Toast notification ─────────────────────────────────────────

export function showToast(message, type = "info") {
  const existing = document.getElementById("toast-container");
  const container = existing || (() => {
    const c = document.createElement("div");
    c.id = "toast-container";
    document.body.appendChild(c);
    return c;
  })();

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span class="toast__icon">${type === "error" ? "❌" : type === "success" ? "✅" : "ℹ️"}</span><span>${message}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("toast--show"));
  setTimeout(() => {
    toast.classList.remove("toast--show");
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

// ── Animated counter ────────────────────────────────────────────

export function animateCounter(element, target, duration = 800) {
  const start = parseInt(element.textContent) || 0;
  const range = target - start;
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
    element.textContent = Math.round(start + range * eased);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── Color helpers ──────────────────────────────────────────────

export function getBrandColor(brand) {
  return CONFIG.BRAND_COLORS[brand] || CONFIG.BRAND_COLORS.Default;
}

export function getStatusColor(status) {
  return CONFIG.STATUS_COLORS[status] || "#6b7280";
}
