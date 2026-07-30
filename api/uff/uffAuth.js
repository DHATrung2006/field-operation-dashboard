class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function uffBaseUrl() {
  let url = process.env.UFF_BASE_URL;
  if (!url) throw new ApiError(503, 'Biến môi trường UFF_BASE_URL chưa được cấu hình.');
  if (url === '[SENSITIVE]') throw new ApiError(503, 'Biến UFF_BASE_URL đang bị lỗi [SENSITIVE] ở local.');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

function parseSetCookies(res) {
  if (res.headers.getSetCookie) {
    return res.headers.getSetCookie().map(c => c.split(';')[0]);
  }
  const raw = res.headers.get('set-cookie') || '';
  return raw.split(/,(?!\s\d)/).map(c => c.split(';')[0]).filter(Boolean);
}

function mergeCookies(jar, pairs) {
  const map = new Map(jar.filter(Boolean).map(pair => {
    const idx = pair.indexOf('=');
    return [pair.slice(0, idx), pair.slice(idx + 1)];
  }));
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    map.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`);
}

// Đăng nhập UFF Web Portal (MVC/cookie) ở phía server. Trả về cookie đã đăng nhập
// để gọi các endpoint cookie-auth khác (CICO/GetDataAsync, CICO/ViewCICO...).
async function loginToUff() {
  const username = process.env.UFF_USERNAME;
  const password = process.env.UFF_PASSWORD;
  if (!username || !password) {
    throw new ApiError(503, 'UFF chưa được cấu hình. Hãy thêm UFF_USERNAME và UFF_PASSWORD trong Vercel.');
  }

  const baseUrl = uffBaseUrl();

  // 0. Tải trang Login trước để lấy cookie chống CSRF và __RequestVerificationToken.
  //    Nhiều site ASP.NET Core từ chối âm thầm POST đăng nhập nếu thiếu token này
  //    (không set cookie Identity), dù UserName/Password đúng.
  const loginPageRes = await fetch(`${baseUrl}/Account/Login`, { redirect: 'follow' });
  let cookieJar = parseSetCookies(loginPageRes);
  const loginPageHtml = await loginPageRes.text().catch(() => '');
  const tokenMatch = loginPageHtml.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  const requestVerificationToken = tokenMatch ? tokenMatch[1] : null;

  // 1. Tự động Login vào Web Portal (MVC)
  const loginParams = new URLSearchParams({
    UserName: username,
    Password: password,
    RememberMe: 'false',
    ...(requestVerificationToken ? { __RequestVerificationToken: requestVerificationToken } : {})
  });

  const loginRes = await fetch(`${baseUrl}/Account/Login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookieJar.length ? { Cookie: cookieJar.join('; ') } : {}),
      ...(requestVerificationToken ? { 'RequestVerificationToken': requestVerificationToken } : {})
    },
    body: loginParams.toString(),
    redirect: 'manual'
  });

  cookieJar = mergeCookies(cookieJar, parseSetCookies(loginRes));
  const cookieHeader = cookieJar.join('; ');

  if (!cookieHeader.includes('.AspNetCore.Identity.Application')) {
    const snippet = (await loginRes.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 200);
    console.error('UFF login thất bại:', {
      status: loginRes.status,
      hasVerificationToken: !!requestVerificationToken,
      snippet
    });
    throw new ApiError(502, `Đăng nhập UFF Web Portal thất bại (HTTP ${loginRes.status}). Kiểm tra UFF_USERNAME/UFF_PASSWORD trên Vercel, hoặc xem Vercel Function Logs để biết chi tiết.`);
  }

  return { baseUrl, cookieHeader, requestVerificationToken };
}

module.exports = { loginToUff, ApiError, uffBaseUrl, parseSetCookies, mergeCookies };
