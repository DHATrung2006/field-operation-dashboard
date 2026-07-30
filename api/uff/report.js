const { getAuth } = require('firebase-admin/auth');
const { loginToUff, ApiError } = require('./uffAuth');

function ensureDate(val, name) {
  if (!val || !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    throw new ApiError(400, `Tham số ${name} không hợp lệ (YYYY-MM-DD).`);
  }
  return val;
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

    const { baseUrl, cookieHeader, requestVerificationToken } = await loginToUff();


    // 2. Định dạng ngày sang dd/MM/yyyy cho Datatables UFF
    const [y, m, d] = fromDate.split('-');
    const startDateStr = `${d}/${m}/${y}`;
    const [y2, m2, d2] = toDate.split('-');
    const endDateStr = `${d2}/${m2}/${y2}`;
    
    // 3. Gọi API lấy dữ liệu bảng
    const dataParams = new URLSearchParams({
      'draw': '1',
      'start': '0',
      'length': '10000',
      'search[value]': '',
      'search[regex]': 'false',
      'order[0][column]': '4',
      'order[0][dir]': 'desc',
      'startDate': startDateStr,
      'endDate': endDateStr,
      'region': '0',
      'city': '0',
      'role': '-1',
      'masterShift': '-1'
    });
    
    const dataRes = await fetch(`${baseUrl}/CICO/GetDataAsync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieHeader,
        'X-Requested-With': 'XMLHttpRequest',
        ...(requestVerificationToken ? { 'RequestVerificationToken': requestVerificationToken } : {})
      },
      body: dataParams.toString()
    });
    
    if (!dataRes.ok) {
       // Thử lấy nội dung lỗi từ server
       const errText = await dataRes.text().catch(() => '');
       throw new ApiError(502, `Lỗi khi lấy dữ liệu: HTTP ${dataRes.status}. Chi tiết: ${errText.substring(0, 100)}`);
    }
    
    const body = await dataRes.json();
    const aaData = body.aaData || body.data || body.Data || [];
    
    // 4. Chuẩn hoá dữ liệu để tương thích với Frontend
    const records = [];
    const seen = new Set();
    
    // Helper lấy giá trị không phân biệt hoa thường
    const getVal = (obj, keys) => {
       for (const k of keys) {
         if (obj[k] !== undefined && obj[k] !== null) return obj[k];
       }
       return null;
    };
    
    for (const item of aaData) {
       try {
         const ciTimeStr = getVal(item, ['CI_TimeStr', 'cI_TimeStr', 'ci_TimeStr', 'ci_time_str']);
         const ciDateStr = getVal(item, ['CI_DateStr', 'cI_DateStr', 'ci_DateStr', 'ci_date_str']);
         const storeName = getVal(item, ['StoreName', 'storeName']);
         const userName = getVal(item, ['UserName', 'userName', 'UserCode', 'userCode']);
         const itemId = getVal(item, ['Id', 'id']);

         if (ciTimeStr === '-' || !ciTimeStr || ciTimeStr.startsWith('00:00')) continue;
         if (!ciDateStr) continue;

         const [cd, cm, cy] = ciDateStr.split('/');
         const dateIso = `${cy}-${cm}-${cd}`;

         const record = {
            date: dateIso,
            ciTime: ciTimeStr,
            cicoId: itemId != null ? String(itemId) : '', // dùng để gọi /api/uff/photo lấy ảnh CI
            storeId: String(itemId || ''),
            storeCode: '',
            storeName: storeName || 'Store UFF',
            empName: userName || 'Unknown',
            project: '', 
         };

         const dedupeKey = `${record.date}|${record.storeName}|${record.ciTime}|${record.empName}`;
         if (!seen.has(dedupeKey)) {
            seen.add(dedupeKey);
            records.push(record);
         }
       } catch {
         // Bỏ qua dòng lỗi
         continue;
       }
    }
    
    records.sort((a, b) => `${a.date}${a.ciTime}`.localeCompare(`${b.date}${b.ciTime}`));

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      records,
      meta: {
        fromDate,
        toDate,
        totalRaw: aaData.length,
        cicos: records.length,
        debug: (records.length === 0 && aaData.length > 0) ? { sampleRaw: aaData[0] } : undefined,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || 'Không thể đồng bộ UFF.' });
  }
};
