// ============================================================
// Field Operation Dashboard — Configuration
// ============================================================
// Instructions:
//   1. Deploy your Google Apps Script as a Web App
//   2. Paste the deployment URL into API_URL below
//   3. Set USE_MOCK_DATA to false
// ============================================================

export const CONFIG = {
  // ── API ──────────────────────────────────────────────────
  API_URL: "", // e.g. "https://script.google.com/macros/s/YOUR_ID/exec"
  USE_MOCK_DATA: true, // Set to false once API is ready

  // ── Sheet Names ──────────────────────────────────────────
  SHEETS: {
    SCHEDULE: "Master_Schedule",
    STORE: "Master_Store",
    BRAND: "Master_Brand",
    PROJECT: "Master_Project",
    SUPERVISOR: "Master_Supervisor",
  },

  // ── Auto-refresh ─────────────────────────────────────────
  REFRESH_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes

  // ── Working Hours ─────────────────────────────────────────
  WORKING_HOURS: { start: 8, end: 21 },

  // ── Date Format ───────────────────────────────────────────
  DATE_FORMAT: "DD/MM/YYYY",

  // ── Brand Colors ─────────────────────────────────────────
  BRAND_COLORS: {
    "P&G": { primary: "#0057A8", gradient: "linear-gradient(135deg,#0057A8,#0088d4)" },
    Maggi: { primary: "#E4001B", gradient: "linear-gradient(135deg,#E4001B,#ff4d4d)" },
    Nestlé: { primary: "#009FDB", gradient: "linear-gradient(135deg,#009FDB,#00c8ff)" },
    Vinda: { primary: "#F4831F", gradient: "linear-gradient(135deg,#F4831F,#ffc266)" },
    Default: { primary: "#6366f1", gradient: "linear-gradient(135deg,#6366f1,#8b5cf6)" },
  },

  // ── Store Chain Icons (emoji fallback) ───────────────────
  STORE_ICONS: {
    "Mega Market": "🏬",
    "GO!": "🛒",
    "MM Mega Market": "🏪",
    Emart: "🏢",
    Lotte: "🌟",
    AEON: "🌸",
    Coopmart: "🌿",
    BigC: "🐘",
    VinMart: "💚",
    Default: "🏬",
  },

  // ── Status Colors ─────────────────────────────────────────
  STATUS_COLORS: {
    Active: "#22c55e",
    Off: "#6b7280",
    Pending: "#f59e0b",
    Training: "#8b5cf6",
    Event: "#ec4899",
    Sampling: "#06b6d4",
  },

  // ── Shift Types ───────────────────────────────────────────
  SHIFT_TYPES: ["Full Day", "Morning", "Afternoon", "Split Shift"],

  // ── UI Language ───────────────────────────────────────────
  LANG: {
    title: "Field Operation Dashboard",
    subtitle: "PG / BA Working Schedule",
    kpi_stores: "Cửa Hàng",
    kpi_projects: "Dự Án",
    kpi_pg: "PG / BA",
    kpi_supervisors: "Supervisor",
    filter_date_from: "Từ Ngày",
    filter_date_to: "Đến Ngày",
    filter_brand: "Thương Hiệu",
    filter_store: "Cửa Hàng",
    filter_supervisor: "Supervisor",
    filter_status: "Trạng Thái",
    filter_all: "Tất Cả",
    section_store_summary: "Store Summary",
    section_working_time: "Working Time",
    section_timeline: "Timeline Ca Làm",
    section_detail: "Chi Tiết Lịch Làm",
    col_date: "Ngày",
    col_store: "Cửa Hàng",
    col_brand: "Thương Hiệu",
    col_project: "Dự Án",
    col_supervisor: "Supervisor",
    col_working_time: "Ca Làm",
    col_shift_type: "Loại Ca",
    col_status: "Trạng Thái",
    col_route: "Tuyến",
    col_remark: "Ghi Chú",
    loading: "Đang tải dữ liệu...",
    no_data: "Không có dữ liệu",
    last_updated: "Cập nhật lúc",
    qc_hint: "⚡ Khung giờ tốt nhất để QC audit",
  },
};
