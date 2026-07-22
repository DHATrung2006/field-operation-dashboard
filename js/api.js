// ============================================================
// api.js — Data fetching and parsing from Google Sheets
// ============================================================

import { CONFIG } from "../config/config.js";
import {
  MOCK_SCHEDULE,
  MOCK_STORES,
  MOCK_BRANDS,
  MOCK_PROJECTS,
  MOCK_SUPERVISORS,
} from "./mockData.js";

// ── Master Data Store ─────────────────────────────────────────
let masterData = {
  schedule: [],
  stores: [],
  brands: [],
  projects: [],
  supervisors: [],
  lastFetched: null,
};

// ── Public API ────────────────────────────────────────────────

/**
 * Load all sheets. Returns the master data object.
 * Uses mock data if USE_MOCK_DATA is true or if API_URL is empty.
 */
export async function fetchAllSheets() {
  if (CONFIG.USE_MOCK_DATA || !CONFIG.API_URL) {
    return loadMockData();
  }

  try {
    const [schedule, stores, brands, projects, supervisors] = await Promise.all([
      fetchSheet(CONFIG.SHEETS.SCHEDULE),
      fetchSheet(CONFIG.SHEETS.STORE),
      fetchSheet(CONFIG.SHEETS.BRAND),
      fetchSheet(CONFIG.SHEETS.PROJECT),
      fetchSheet(CONFIG.SHEETS.SUPERVISOR),
    ]);

    masterData = {
      schedule: parseSchedule(schedule),
      stores: parseStores(stores),
      brands: parseBrands(brands),
      projects: parseProjects(projects),
      supervisors: parseSupervisors(supervisors),
      lastFetched: new Date(),
    };

    cacheToSession(masterData);
    return masterData;
  } catch (err) {
    console.error("[API] Fetch failed, falling back to cache/mock:", err);
    const cached = loadFromSession();
    if (cached) return cached;
    return loadMockData();
  }
}

/** Get the currently loaded master data without re-fetching */
export function getMasterData() {
  return masterData;
}

// ── Fetch helpers ─────────────────────────────────────────────

async function fetchSheet(sheetName) {
  const url = `${CONFIG.API_URL}?sheet=${encodeURIComponent(sheetName)}`;
  const response = await fetch(url, { method: "GET", mode: "cors" });
  if (!response.ok) throw new Error(`HTTP ${response.status} for sheet: ${sheetName}`);
  return response.json();
}

// ── Parsers ───────────────────────────────────────────────────

/**
 * Map raw Google Apps Script JSON rows to ScheduleEntry objects.
 * The Apps Script returns an array of objects keyed by header row.
 */
function parseSchedule(rows) {
  return rows.map((r) => ({
    date: r["Date"] || r["date"] || "",
    storeCode: r["Store Code"] || r["storeCode"] || "",
    storeName: r["Store Name"] || r["storeName"] || "",
    brand: r["Brand"] || r["brand"] || "",
    project: r["Project"] || r["project"] || "",
    supervisor: r["Supervisor"] || r["supervisor"] || "",
    workingTime: r["Working Time"] || r["workingTime"] || "",
    shiftType: r["Shift Type"] || r["shiftType"] || "",
    status: r["Status"] || r["status"] || "",
    route: r["Route"] || r["route"] || "",
    remark: r["Remark"] || r["remark"] || "",
  })).filter((e) => e.date && e.storeName && e.brand);
}

function parseStores(rows) {
  return rows.map((r) => ({
    storeCode: r["Store Code"] || r["storeCode"] || "",
    storeName: r["Store Name"] || r["storeName"] || "",
    region: r["Region"] || r["region"] || "",
    province: r["Province"] || r["province"] || "",
  }));
}

function parseBrands(rows) {
  return rows.map((r) => ({
    brand: r["Brand"] || r["brand"] || "",
  }));
}

function parseProjects(rows) {
  return rows.map((r) => ({
    brand: r["Brand"] || r["brand"] || "",
    project: r["Project"] || r["project"] || "",
  }));
}

function parseSupervisors(rows) {
  return rows.map((r) => ({
    supCode: r["Sup Code"] || r["supCode"] || "",
    name: r["Name"] || r["name"] || "",
  }));
}

// ── Mock data loader ──────────────────────────────────────────

function loadMockData() {
  masterData = {
    schedule: MOCK_SCHEDULE,
    stores: MOCK_STORES,
    brands: MOCK_BRANDS,
    projects: MOCK_PROJECTS,
    supervisors: MOCK_SUPERVISORS,
    lastFetched: new Date(),
    isMock: true,
  };
  return masterData;
}

// ── Session Cache ─────────────────────────────────────────────

const CACHE_KEY = "fodash_cache";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheToSession(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      ts: Date.now(),
    }));
  } catch (_) { /* storage full or blocked */ }
}

function loadFromSession() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    masterData = { ...data, lastFetched: new Date(data.lastFetched) };
    return masterData;
  } catch (_) {
    return null;
  }
}
