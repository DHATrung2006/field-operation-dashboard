// ============================================================
// mockData.js — Realistic sample data for UI development
// ============================================================
// Mirrors the exact Google Sheet columns:
// Date | Store Code | Store Name | Brand | Project | Supervisor
// | Working Time | Shift Type | Status | Route | Remark
// ============================================================

export const MOCK_SCHEDULE = [
  // ── GO! Vũng Tàu ─────────────────────────────────────────
  { date: "17/07/2026", storeCode: "GO-VT01", storeName: "GO! Vũng Tàu", brand: "P&G", project: "Gillette Summer Promo", supervisor: "Nguyễn Văn An", workingTime: "08-13", shiftType: "Morning", status: "Active", route: "R1", remark: "" },
  { date: "17/07/2026", storeCode: "GO-VT01", storeName: "GO! Vũng Tàu", brand: "P&G", project: "Gillette Summer Promo", supervisor: "Nguyễn Văn An", workingTime: "13-21", shiftType: "Afternoon", status: "Active", route: "R1", remark: "" },
  { date: "17/07/2026", storeCode: "GO-VT01", storeName: "GO! Vũng Tàu", brand: "Maggi", project: "Maggi Mì Gói Q3", supervisor: "Trần Thị Bích", workingTime: "08-14", shiftType: "Morning", status: "Active", route: "R1", remark: "" },
  { date: "17/07/2026", storeCode: "GO-VT01", storeName: "GO! Vũng Tàu", brand: "Nestlé", project: "Milo Back to School", supervisor: "Lê Văn Cường", workingTime: "10-18", shiftType: "Full Day", status: "Active", route: "R1", remark: "Sampling" },
  { date: "17/07/2026", storeCode: "GO-VT01", storeName: "GO! Vũng Tàu", brand: "Vinda", project: "Vinda Tissue Launch", supervisor: "Phạm Thị Dung", workingTime: "08-21", shiftType: "Full Day", status: "Active", route: "R1", remark: "" },

  // ── AEON Hà Đông ─────────────────────────────────────────
  { date: "17/07/2026", storeCode: "AE-HD01", storeName: "AEON Hà Đông", brand: "P&G", project: "Ariel Matic Activation", supervisor: "Nguyễn Văn An", workingTime: "09-17", shiftType: "Full Day", status: "Active", route: "R2", remark: "" },
  { date: "17/07/2026", storeCode: "AE-HD01", storeName: "AEON Hà Đông", brand: "P&G", project: "Ariel Matic Activation", supervisor: "Nguyễn Văn An", workingTime: "13-21", shiftType: "Afternoon", status: "Active", route: "R2", remark: "" },
  { date: "17/07/2026", storeCode: "AE-HD01", storeName: "AEON Hà Đông", brand: "Nestlé", project: "KitKat Chunky Display", supervisor: "Lê Văn Cường", workingTime: "08-14,17-21", shiftType: "Split Shift", status: "Active", route: "R2", remark: "Event" },
  { date: "17/07/2026", storeCode: "AE-HD01", storeName: "AEON Hà Đông", brand: "Maggi", project: "Maggi Gia Vị Tết", supervisor: "Trần Thị Bích", workingTime: "10-16", shiftType: "Full Day", status: "Training", route: "R2", remark: "New PG training" },

  // ── MM Mega Market Thủ Đức ───────────────────────────────
  { date: "17/07/2026", storeCode: "MM-TD01", storeName: "MM Mega Market Thủ Đức", brand: "P&G", project: "Tide + Downy Bundle", supervisor: "Hoàng Minh Đức", workingTime: "08-13", shiftType: "Morning", status: "Active", route: "R3", remark: "" },
  { date: "17/07/2026", storeCode: "MM-TD01", storeName: "MM Mega Market Thủ Đức", brand: "Vinda", project: "Vinda Tissue Launch", supervisor: "Phạm Thị Dung", workingTime: "13-21", shiftType: "Afternoon", status: "Active", route: "R3", remark: "" },
  { date: "17/07/2026", storeCode: "MM-TD01", storeName: "MM Mega Market Thủ Đức", brand: "Nestlé", project: "Milo Back to School", supervisor: "Lê Văn Cường", workingTime: "08-21", shiftType: "Full Day", status: "Active", route: "R3", remark: "Sampling" },
  { date: "17/07/2026", storeCode: "MM-TD01", storeName: "MM Mega Market Thủ Đức", brand: "Maggi", project: "Maggi Mì Gói Q3", supervisor: "Trần Thị Bích", workingTime: "09-15", shiftType: "Morning", status: "Pending", route: "R3", remark: "" },

  // ── Lotte Mart Đống Đa ───────────────────────────────────
  { date: "17/07/2026", storeCode: "LO-DD01", storeName: "Lotte Mart Đống Đa", brand: "P&G", project: "Head & Shoulders Flash Sale", supervisor: "Nguyễn Văn An", workingTime: "10-18", shiftType: "Full Day", status: "Active", route: "R4", remark: "" },
  { date: "17/07/2026", storeCode: "LO-DD01", storeName: "Lotte Mart Đống Đa", brand: "Nestlé", project: "Nescafé Weekend Promo", supervisor: "Vũ Thị Hoa", workingTime: "08-14", shiftType: "Morning", status: "Active", route: "R4", remark: "" },
  { date: "17/07/2026", storeCode: "LO-DD01", storeName: "Lotte Mart Đống Đa", brand: "Vinda", project: "Vinda Tissue Launch", supervisor: "Phạm Thị Dung", workingTime: "14-21", shiftType: "Afternoon", status: "Active", route: "R4", remark: "" },

  // ── Emart Gò Vấp ────────────────────────────────────────
  { date: "17/07/2026", storeCode: "EM-GV01", storeName: "Emart Gò Vấp", brand: "P&G", project: "Pampers Newborn Drive", supervisor: "Hoàng Minh Đức", workingTime: "08-21", shiftType: "Full Day", status: "Active", route: "R5", remark: "" },
  { date: "17/07/2026", storeCode: "EM-GV01", storeName: "Emart Gò Vấp", brand: "Maggi", project: "Maggi Mì Gói Q3", supervisor: "Trần Thị Bích", workingTime: "08-13", shiftType: "Morning", status: "Off", route: "R5", remark: "PG sick leave" },
  { date: "17/07/2026", storeCode: "EM-GV01", storeName: "Emart Gò Vấp", brand: "Nestlé", project: "Milo Back to School", supervisor: "Lê Văn Cường", workingTime: "13-21", shiftType: "Afternoon", status: "Active", route: "R5", remark: "" },

  // ── Mega Market An Phú ───────────────────────────────────
  { date: "17/07/2026", storeCode: "MG-AP01", storeName: "Mega Market An Phú", brand: "Vinda", project: "Vinda Tissue Launch", supervisor: "Phạm Thị Dung", workingTime: "08-14", shiftType: "Morning", status: "Active", route: "R6", remark: "" },
  { date: "17/07/2026", storeCode: "MG-AP01", storeName: "Mega Market An Phú", brand: "P&G", project: "Tide + Downy Bundle", supervisor: "Hoàng Minh Đức", workingTime: "09-17", shiftType: "Full Day", status: "Active", route: "R6", remark: "" },
  { date: "17/07/2026", storeCode: "MG-AP01", storeName: "Mega Market An Phú", brand: "Nestlé", project: "KitKat Chunky Display", supervisor: "Vũ Thị Hoa", workingTime: "14-21", shiftType: "Afternoon", status: "Active", route: "R6", remark: "" },

  // ── GO! Cần Thơ ──────────────────────────────────────────
  { date: "17/07/2026", storeCode: "GO-CT01", storeName: "GO! Cần Thơ", brand: "P&G", project: "Gillette Summer Promo", supervisor: "Nguyễn Văn An", workingTime: "08-13", shiftType: "Morning", status: "Active", route: "R7", remark: "" },
  { date: "17/07/2026", storeCode: "GO-CT01", storeName: "GO! Cần Thơ", brand: "Maggi", project: "Maggi Gia Vị Tết", supervisor: "Trần Thị Bích", workingTime: "13-21", shiftType: "Afternoon", status: "Active", route: "R7", remark: "" },
  { date: "17/07/2026", storeCode: "GO-CT01", storeName: "GO! Cần Thơ", brand: "Nestlé", project: "Nescafé Weekend Promo", supervisor: "Vũ Thị Hoa", workingTime: "08-21", shiftType: "Full Day", status: "Sampling", route: "R7", remark: "Free sample event" },

  // ── AEON Tân Phú ────────────────────────────────────────
  { date: "17/07/2026", storeCode: "AE-TP01", storeName: "AEON Tân Phú", brand: "Vinda", project: "Vinda Tissue Launch", supervisor: "Phạm Thị Dung", workingTime: "08-13", shiftType: "Morning", status: "Active", route: "R8", remark: "" },
  { date: "17/07/2026", storeCode: "AE-TP01", storeName: "AEON Tân Phú", brand: "P&G", project: "Ariel Matic Activation", supervisor: "Hoàng Minh Đức", workingTime: "13-21", shiftType: "Afternoon", status: "Active", route: "R8", remark: "" },
  { date: "17/07/2026", storeCode: "AE-TP01", storeName: "AEON Tân Phú", brand: "Nestlé", project: "Milo Back to School", supervisor: "Lê Văn Cường", workingTime: "10-18", shiftType: "Full Day", status: "Training", route: "R8", remark: "" },

  // ── Coopmart Nguyễn Đình Chiểu ─────────────────────────
  { date: "17/07/2026", storeCode: "CM-NDC01", storeName: "Coopmart Nguyễn Đình Chiểu", brand: "Maggi", project: "Maggi Mì Gói Q3", supervisor: "Trần Thị Bích", workingTime: "08-14", shiftType: "Morning", status: "Active", route: "R9", remark: "" },
  { date: "17/07/2026", storeCode: "CM-NDC01", storeName: "Coopmart Nguyễn Đình Chiểu", brand: "P&G", project: "Head & Shoulders Flash Sale", supervisor: "Nguyễn Văn An", workingTime: "14-21", shiftType: "Afternoon", status: "Active", route: "R9", remark: "" },

  // ── BigC Thăng Long ──────────────────────────────────────
  { date: "17/07/2026", storeCode: "BC-TL01", storeName: "BigC Thăng Long", brand: "P&G", project: "Pampers Newborn Drive", supervisor: "Hoàng Minh Đức", workingTime: "08-13,17-21", shiftType: "Split Shift", status: "Active", route: "R10", remark: "" },
  { date: "17/07/2026", storeCode: "BC-TL01", storeName: "BigC Thăng Long", brand: "Nestlé", project: "KitKat Chunky Display", supervisor: "Vũ Thị Hoa", workingTime: "09-15", shiftType: "Morning", status: "Active", route: "R10", remark: "" },
  { date: "17/07/2026", storeCode: "BC-TL01", storeName: "BigC Thăng Long", brand: "Vinda", project: "Vinda Tissue Launch", supervisor: "Phạm Thị Dung", workingTime: "13-21", shiftType: "Afternoon", status: "Active", route: "R10", remark: "" },

  // ── Yesterday data for date range testing ────────────────
  { date: "16/07/2026", storeCode: "GO-VT01", storeName: "GO! Vũng Tàu", brand: "P&G", project: "Gillette Summer Promo", supervisor: "Nguyễn Văn An", workingTime: "08-21", shiftType: "Full Day", status: "Active", route: "R1", remark: "" },
  { date: "16/07/2026", storeCode: "AE-HD01", storeName: "AEON Hà Đông", brand: "Nestlé", project: "Milo Back to School", supervisor: "Lê Văn Cường", workingTime: "08-14", shiftType: "Morning", status: "Active", route: "R2", remark: "" },
  { date: "16/07/2026", storeCode: "MM-TD01", storeName: "MM Mega Market Thủ Đức", brand: "Maggi", project: "Maggi Mì Gói Q3", supervisor: "Trần Thị Bích", workingTime: "13-21", shiftType: "Afternoon", status: "Off", route: "R3", remark: "Holiday" },
  { date: "16/07/2026", storeCode: "LO-DD01", storeName: "Lotte Mart Đống Đa", brand: "Vinda", project: "Vinda Tissue Launch", supervisor: "Phạm Thị Dung", workingTime: "08-21", shiftType: "Full Day", status: "Active", route: "R4", remark: "" },
  { date: "16/07/2026", storeCode: "EM-GV01", storeName: "Emart Gò Vấp", brand: "P&G", project: "Tide + Downy Bundle", supervisor: "Hoàng Minh Đức", workingTime: "09-17", shiftType: "Full Day", status: "Active", route: "R5", remark: "" },
];

export const MOCK_STORES = [
  { storeCode: "GO-VT01", storeName: "GO! Vũng Tàu", region: "South", province: "Vũng Tàu" },
  { storeCode: "AE-HD01", storeName: "AEON Hà Đông", region: "North", province: "Hà Nội" },
  { storeCode: "MM-TD01", storeName: "MM Mega Market Thủ Đức", region: "South", province: "TP.HCM" },
  { storeCode: "LO-DD01", storeName: "Lotte Mart Đống Đa", region: "North", province: "Hà Nội" },
  { storeCode: "EM-GV01", storeName: "Emart Gò Vấp", region: "South", province: "TP.HCM" },
  { storeCode: "MG-AP01", storeName: "Mega Market An Phú", region: "South", province: "TP.HCM" },
  { storeCode: "GO-CT01", storeName: "GO! Cần Thơ", region: "South", province: "Cần Thơ" },
  { storeCode: "AE-TP01", storeName: "AEON Tân Phú", region: "South", province: "TP.HCM" },
  { storeCode: "CM-NDC01", storeName: "Coopmart Nguyễn Đình Chiểu", region: "South", province: "TP.HCM" },
  { storeCode: "BC-TL01", storeName: "BigC Thăng Long", region: "North", province: "Hà Nội" },
];

export const MOCK_BRANDS = [
  { brand: "P&G" },
  { brand: "Maggi" },
  { brand: "Nestlé" },
  { brand: "Vinda" },
];

export const MOCK_PROJECTS = [
  { brand: "P&G", project: "Gillette Summer Promo" },
  { brand: "P&G", project: "Ariel Matic Activation" },
  { brand: "P&G", project: "Tide + Downy Bundle" },
  { brand: "P&G", project: "Head & Shoulders Flash Sale" },
  { brand: "P&G", project: "Pampers Newborn Drive" },
  { brand: "Maggi", project: "Maggi Mì Gói Q3" },
  { brand: "Maggi", project: "Maggi Gia Vị Tết" },
  { brand: "Nestlé", project: "Milo Back to School" },
  { brand: "Nestlé", project: "KitKat Chunky Display" },
  { brand: "Nestlé", project: "Nescafé Weekend Promo" },
  { brand: "Vinda", project: "Vinda Tissue Launch" },
];

export const MOCK_SUPERVISORS = [
  { supCode: "SUP001", name: "Nguyễn Văn An" },
  { supCode: "SUP002", name: "Trần Thị Bích" },
  { supCode: "SUP003", name: "Lê Văn Cường" },
  { supCode: "SUP004", name: "Phạm Thị Dung" },
  { supCode: "SUP005", name: "Hoàng Minh Đức" },
  { supCode: "SUP006", name: "Vũ Thị Hoa" },
];
