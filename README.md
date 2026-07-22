# Field Operation Dashboard

**Centralized Management System for PG / BA Working Schedule**

---

## 🚀 Quick Start

1. Open `index.html` in Chrome or Edge (double-click the file).
2. The dashboard loads with **demo data** immediately — no server needed.
3. To connect your real Google Sheet, follow the steps below.

---

## 📋 Google Sheets Setup

### 1. Create 5 sheets with exact names:

| Sheet Name | Required Columns |
|---|---|
| `Master_Schedule` | Date, Store Code, Store Name, Brand, Project, Supervisor, Working Time, Shift Type, Status, Route, Remark |
| `Master_Store` | Store Code, Store Name, Region, Province |
| `Master_Brand` | Brand |
| `Master_Project` | Brand, Project |
| `Master_Supervisor` | Sup Code, Name |

### 2. Date format
Use `DD/MM/YYYY` in the Date column (e.g. `17/07/2026`).

### 3. Working Time format
- Single slot: `08-13`
- Double slot: `08-11,15-21`
- Do NOT use spaces between slots.

### 4. Status values
`Active` | `Off` | `Pending` | `Training` | `Event` | `Sampling`

---

## ⚙️ Google Apps Script Setup

### Step 1: Open Apps Script
In your Google Sheet: **Extensions → Apps Script**

### Step 2: Paste the API code
Copy the entire content of `config/Code.gs` into `Code.gs` in the Apps Script editor.

### Step 3: Set your Sheet ID *(optional)*
If you want the script to work on a specific sheet:
```js
const SPREADSHEET_ID = "your_sheet_id_here";
```
Leave empty to use the active spreadsheet.

### Step 4: Deploy as Web App
1. Click **Deploy → New Deployment**
2. Select **Web App** as type
3. Set **Execute as: Me**
4. Set **Who has access: Anyone**
5. Click **Deploy**
6. **Copy the Web App URL**

### Step 5: Configure the Dashboard
Open `config/config.js` and update:
```js
API_URL: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",
USE_MOCK_DATA: false,
```

---

## 🗂 Project Structure

```
Field Operation Dashboard/
│
├── index.html              ← Main app (open this in browser)
│
├── css/
│   ├── theme.css           ← Design tokens, brand colors, dark/light
│   └── style.css           ← All component styles
│
├── js/
│   ├── app.js              ← Entry point
│   ├── api.js              ← Google Sheets fetching + mock fallback
│   ├── filter.js           ← Filter state & event binding
│   ├── kpi.js              ← KPI calculation & store pills
│   ├── timeline.js         ← Timeline ca làm renderer
│   ├── table.js            ← Detail table with sort & pagination
│   ├── chart.js            ← Brand distribution chart
│   ├── dashboard.js        ← Central orchestrator
│   ├── utils.js            ← Shared helpers
│   └── mockData.js         ← Demo data (40+ sample rows)
│
├── config/
│   ├── config.js           ← Central configuration
│   └── Code.gs             ← Google Apps Script API code
│
└── README.md               ← This file
```

---

## 🎨 Features

### Phase 1 (Current)
- ✅ Dark / Light theme toggle
- ✅ Live clock in header
- ✅ Filter by Date Range, Brand, Store, Supervisor, Status
- ✅ KPI Cards: Stores / Projects / PG shifts / Supervisors
- ✅ Store Summary pills (click to filter by store)
- ✅ Working Time summary per brand
- ✅ Pixel-accurate Timeline (08:00 → 21:00)
- ✅ QC Audit hints (⚡ highlights uncovered time gaps)
- ✅ Rich hover tooltips on timeline blocks
- ✅ Detail Table with sortable columns & pagination
- ✅ Brand distribution donut chart
- ✅ Auto-refresh every 5 minutes
- ✅ Mock data → live data switch via config

### Phase 2 (Roadmap)
- ⬜ Hourly heatmap (peak hours)
- ⬜ Top N stores bar chart
- ⬜ Weekly / monthly trend line
- ⬜ Export to PDF / Excel
- ⬜ Store Active/Inactive ratio

### Phase 3 (Roadmap)
- ⬜ Google Maps store locations
- ⬜ QC route optimization
- ⬜ Leave / shift-swap management
- ⬜ Conflict detection (overlapping shifts)
- ⬜ Audit log

---

## 🔒 Security Notes

- The Apps Script Web App does **not expose your Sheet credentials** — it only returns the data rows.
- For sensitive data, set **Who has access: Anyone with Google Account** instead of Anyone.
- The dashboard reads data only — it never writes back to the Sheet.

---

## 🛠 Troubleshooting

| Problem | Solution |
|---|---|
| "CORS error" in console | Re-deploy Apps Script with correct access settings |
| Empty dashboard | Check `USE_MOCK_DATA: true` in config.js or verify API URL |
| Data not updating | Click Làm mới (refresh button) or wait 5 min auto-refresh |
| Timeline not showing | Verify Working Time format is `HH-HH` (e.g. `08-13`) |
| Date filter not working | Ensure dates in Sheet are in `DD/MM/YYYY` format |

---

*Built with HTML + Vanilla CSS + JavaScript ES Modules. No build step required.*
