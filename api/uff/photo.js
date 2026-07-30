const { getAuth } = require('firebase-admin/auth');
const { loginToUff, ApiError } = require('./uffAuth');

const MAX_TOTAL_BASE64_BYTES = 3 * 1024 * 1024; // ~3MB, tránh vượt giới hạn response của Vercel

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
      console.warn('Bypassing Firebase Auth check for UFF photo:', e.message);
    }

    const cicoId = String(req.query.cicoId || '').trim();
    if (!/^\d+$/.test(cicoId)) {
      throw new ApiError(400, 'Tham số cicoId không hợp lệ.');
    }
    const status = req.query.status === 'CO' ? 'CO' : 'CI';

    const { baseUrl, cookieHeader } = await loginToUff();

    const viewRes = await fetch(`${baseUrl}/CICO/ViewCICO?id=${cicoId}&status=${status}`, {
      headers: {
        Cookie: cookieHeader,
        'X-Requested-With': 'XMLHttpRequest'
      },
      redirect: 'manual'
    });

    if (viewRes.status >= 300 && viewRes.status < 400) {
      throw new ApiError(502, 'Phiên đăng nhập UFF đã hết hạn giữa quá trình xử lý, vui lòng thử lại.');
    }
    if (!viewRes.ok) {
      throw new ApiError(502, `Không lấy được trang chi tiết check-in từ UFF (HTTP ${viewRes.status}).`);
    }

    const html = await viewRes.text();
    const pageUrl = `${baseUrl}/CICO/ViewCICO`;
    const rawSrcs = [...html.matchAll(/<img[^>]+src=["']([^"']*EZIMGA[^"']*)["']/gi)].map(m =>
      m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    );

    if (rawSrcs.length === 0) {
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({ cicoId, status, photos: [], meta: { count: 0, requested: 0, failed: 0 } });
    }

    const imageUrls = rawSrcs.map(src => new URL(src, pageUrl).toString());
    const results = await Promise.allSettled(imageUrls.map(url => fetch(url)));

    const photos = [];
    let failed = 0;
    let truncated = false;
    let totalBytes = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== 'fulfilled' || !result.value.ok) {
        failed++;
        continue;
      }
      const imgRes = result.value;
      const buf = Buffer.from(await imgRes.arrayBuffer());
      if (totalBytes + buf.length > MAX_TOTAL_BASE64_BYTES) {
        truncated = true;
        continue;
      }
      totalBytes += buf.length;
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      const fileName = decodeURIComponent(imageUrls[i].split('/').pop().split('?')[0]) || `photo_${i + 1}.jpg`;
      photos.push({ fileName, dataUri: `data:${contentType};base64,${buf.toString('base64')}` });
    }

    if (photos.length === 0 && failed > 0) {
      throw new ApiError(502, 'Không tải được ảnh CI từ UFF (đường dẫn ảnh đã lấy được nhưng UFF không phản hồi).');
    }

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      cicoId,
      status,
      photos,
      meta: { count: photos.length, requested: imageUrls.length, failed, truncated },
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || 'Không thể tải ảnh CI.' });
  }
};
