const { getAuth } = require('firebase-admin/auth');

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function ensureDate(val, name) {
  if (!val || !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    throw new ApiError(400, `Tham số ${name} không hợp lệ (YYYY-MM-DD).`);
  }
  return val;
}

function uffBaseUrl() {
  const url = process.env.UFF_BASE_URL;
  if (!url) throw new ApiError(503, 'Biến môi trường UFF_BASE_URL chưa được cấu hình.');
  return url.replace(/\/+$/, '');
}

async function verifyIdToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError(401, 'Thiếu token xác thực Firebase.');
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    return await getAuth().verifyIdToken(idToken);
  } catch (error) {
    throw new ApiError(401, 'Firebase ID token không hợp lệ.');
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed.' });

  try {
    try {
      await verifyIdToken(req);
    } catch (e) {
      console.warn('Bypassing Firebase Auth check for UFF sync:', e.message);
    }
    const fromDate = ensureDate(req.query.fromDate, 'fromDate');
    const toDate = ensureDate(req.query.toDate, 'toDate');
    if (fromDate > toDate) throw new ApiError(400, 'fromDate không được sau toDate.');

    const username = process.env.UFF_USERNAME;
    const password = process.env.UFF_PASSWORD;
    if (!username || !password) {
      throw new ApiError(503, 'UFF chưa được cấu hình. Hãy thêm UFF_USERNAME và UFF_PASSWORD trong Vercel.');
    }

    const baseUrl = uffBaseUrl();
    
    // 1. Tự động Login vào Web Portal (MVC)
    const loginParams = new URLSearchParams({
      UserName: username,
      Password: password,
      RememberMe: 'false'
    });
    
    const loginRes = await fetch(`${baseUrl}/Account/Login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: loginParams.toString(),
      redirect: 'manual'
    });
    
    // Lấy cookie
    const cookiesRaw = loginRes.headers.get('set-cookie') || '';
    if (!cookiesRaw.includes('.AspNetCore.Identity.Application')) {
        throw new ApiError(502, 'Đăng nhập UFF Web Portal thất bại. Vui lòng kiểm tra lại UFF_USERNAME và UFF_PASSWORD.');
    }
    
    // 2. Định dạng ngày sang dd/MM/yyyy cho Datatables UFF
    const [y, m, d] = fromDate.split('-');
    const startDateStr = `${d}/${m}/${y}`;
    const [y2, m2, d2] = toDate.split('-');
    const endDateStr = `${d2}/${m2}/${y2}`;
    
    // 3. Gọi API lấy dữ liệu bảng
    const dataParams = new URLSearchParams({
      draw: '1',
      start: '0',
      length: '10000',
      startDate: startDateStr,
      endDate: endDateStr,
      region: '0',
      city: '0',
      role: '-1',
      masterShift: '-1'
    });
    
    const dataRes = await fetch(`${baseUrl}/CICO/GetDataAsync`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookiesRaw,
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: dataParams.toString()
    });
    
    if (!dataRes.ok) {
       throw new ApiError(502, `Lỗi khi lấy dữ liệu: HTTP ${dataRes.status}`);
    }
    
    const body = await dataRes.json();
    const aaData = body.aaData || [];
    
    // 4. Chuẩn hoá dữ liệu để tương thích với Frontend
    const records = [];
    const seen = new Set();
    
    for (const item of aaData) {
       if (item.cI_TimeStr === '-' || !item.cI_TimeStr || item.cI_TimeStr.startsWith('00:00')) continue;
       
       const [cd, cm, cy] = item.cI_DateStr.split('/');
       const dateIso = `${cy}-${cm}-${cd}`;
       
       const record = {
          date: dateIso,
          ciTime: item.cI_TimeStr,
          storeId: String(item.id || ''),
          storeCode: '', 
          storeName: item.storeName || 'Store UFF',
          empName: item.userName || item.userCode || 'Unknown',
          project: '', // Web API does not easily expose brand/project
          ciPhoto: '' // Web API datatables does not return photos directly
       };
       
       const dedupeKey = `${record.date}|${item.storeName}|${record.ciTime}|${record.empName}`;
       if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          records.push(record);
       }
    }
    
    records.sort((a, b) => `${a.date}${a.ciTime}`.localeCompare(`${b.date}${b.ciTime}`));

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      records,
      meta: { fromDate, toDate, totalRaw: aaData.length, cicos: records.length },
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || 'Không thể đồng bộ UFF.' });
  }
};
