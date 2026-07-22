// ============================================================
// Code.gs — Google Apps Script API cho Field Operation Dashboard
// ============================================================
// CÁCH DEPLOY:
//   1. Mở Google Sheet → Extensions (Tiện ích) → Apps Script
//   2. Xóa code cũ, paste toàn bộ file này vào
//   3. Nhấn Deploy → New Deployment → chọn Web App
//   4. Execute as: Me | Who has access: Anyone
//   5. Copy URL → paste vào config trong index.html
// ============================================================

// ── CẤU HÌNH ──────────────────────────────────────────────────
// Để trống nếu muốn dùng spreadsheet hiện tại (khuyên dùng)
// Hoặc điền ID sheet cụ thể
const SPREADSHEET_ID = '';

// ── Xử lý request GET từ Dashboard ───────────────────────────
function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action;

    // 1. Trả về giao diện Web (HTML) nếu không có tham số action
    if (!action) {
      return HtmlService.createHtmlOutputFromFile('index')
        .setTitle('Field Operation Dashboard')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    // 2. API Đăng nhập
    if (action === 'login') {
      return handleLogin(e.parameter.user, e.parameter.pass);
    }

    // 3. API Lấy dữ liệu
    const sheetName = (e && e.parameter && e.parameter.sheet)
      ? e.parameter.sheet
      : 'master_data';

    const data = readSheet(sheetName);
    return jsonResponse(data);

  } catch (err) {
    return jsonResponse({ error: true, message: err.message });
  }
}

// ── Xử lý Đăng nhập ───────────────────────────────────────────
function handleLogin(username, passHash) {
  if (!username || !passHash) {
    return jsonResponse({ error: true, message: 'Thiếu username hoặc password' });
  }
  
  const ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
    
  const sheet = ss.getSheetByName('users');
  if (!sheet) {
    return jsonResponse({ error: true, message: 'Hệ thống chưa thiết lập sheet "users". Vui lòng tạo sheet "users" với các cột: username, password, role, displayName, scope, active' });
  }
  
  const all = sheet.getDataRange().getValues();
  if (all.length < 2) {
    return jsonResponse({ error: true, message: 'Chưa có tài khoản nào được tạo' });
  }
  
  const headers = all[0].map(h => String(h).trim().toLowerCase());
  const idxUser = headers.indexOf('username');
  const idxPass = headers.indexOf('password');
  const idxRole = headers.indexOf('role');
  const idxName = headers.indexOf('displayname');
  const idxScope = headers.indexOf('scope');
  const idxActive = headers.indexOf('active');
  
  if (idxUser < 0 || idxPass < 0 || idxRole < 0) {
    return jsonResponse({ error: true, message: 'Sheet "users" thiếu cột bắt buộc (username, password, role)' });
  }
  
  const inputUser = String(username).trim().toLowerCase();
  
  for (let i = 1; i < all.length; i++) {
    const row = all[i];
    const rowUser = String(row[idxUser]).trim().toLowerCase();
    
    if (rowUser === inputUser) {
      const isActive = idxActive >= 0 ? String(row[idxActive]).toUpperCase() : 'TRUE';
      if (isActive === 'FALSE') {
        return jsonResponse({ error: true, message: 'Tài khoản đã bị khóa' });
      }
      
      if (String(row[idxPass]).trim() === passHash) {
        return jsonResponse({
          success: true,
          role: String(row[idxRole]).trim().toLowerCase(),
          displayName: idxName >= 0 ? String(row[idxName]).trim() : rowUser,
          scope: idxScope >= 0 ? String(row[idxScope]).trim() : ''
        });
      } else {
        return jsonResponse({ error: true, message: 'Sai mật khẩu' });
      }
    }
  }
  
  return jsonResponse({ error: true, message: 'Không tìm thấy tài khoản' });
}


// ── Đọc sheet và trả về array of objects ──────────────────────
function readSheet(sheetName) {
  // Lấy Spreadsheet
  const ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();

  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Không tìm thấy sheet: "' + sheetName + '". Vui lòng kiểm tra tên sheet.');
  }

  // Kiểm tra cache (5 phút)
  const cache   = CacheService.getScriptCache();
  const cacheKey = 'dash_' + sheetName;
  const cached   = cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Đọc toàn bộ dữ liệu
  const all     = sheet.getDataRange().getValues();
  if (all.length < 2) return []; // Chỉ có header, không có data

  const headers = all[0];  // Hàng đầu tiên = tên cột
  const rows    = all.slice(1); // Các hàng còn lại = dữ liệu

  // Chuyển mỗi hàng thành object {TênCột: GiáTrị}
  const result = rows
    .filter(row => row.some(cell => cell !== null && cell !== '')) // Bỏ hàng trống
    .map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        let value = row[i];

        // Định dạng Date thành chuỗi DD/MM/YYYY
        if (value instanceof Date) {
          value = Utilities.formatDate(
            value,
            Session.getScriptTimeZone(),
            'dd/MM/yyyy'
          );
        }

        obj[String(header).trim()] = (value !== null && value !== undefined)
          ? String(value).trim()
          : '';
      });
      return obj;
    });

  // Lưu cache 5 phút (300 giây)
  try {
    const str = JSON.stringify(result);
    if (str.length < 100000) { // Cache giới hạn ~100KB
      cache.put(cacheKey, str, 300);
    }
  } catch (cacheErr) {
    // Bỏ qua lỗi cache
  }

  return result;
}

// ── Helper: trả về JSON với CORS header ──────────────────────
function jsonResponse(data) {
  const output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ── Xóa cache thủ công (gọi từ Script hoặc Trigger) ──────────
function clearCache() {
  const cache = CacheService.getScriptCache();
  // Xóa cache cho các sheet thường dùng
  ['master_data', 'Master_Schedule', 'Vinda_july', 'Master_Store', 'Master_Brand', 'users'].forEach(name => {
    cache.remove('dash_' + name);
  });
  Logger.log('✅ Cache đã được xóa');
}

// ── Tự động xóa cache khi Sheet thay đổi ─────────────────────
// Để bật: Apps Script → Triggers → Add Trigger
//   Function: onSheetEdit | Event: From spreadsheet → On change
function onSheetEdit(e) {
  clearCache();
}
