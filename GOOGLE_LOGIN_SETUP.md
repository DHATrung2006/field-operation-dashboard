# Đăng nhập Google + Trang Dev duyệt tài khoản

Trang đăng nhập hỗ trợ thêm nút **"Đăng nhập bằng Google"** (song song với email/mật khẩu hiện có). Tài khoản Google nào đăng nhập lần đầu sẽ được tạo với trạng thái **chờ duyệt** — chỉ vào được dashboard sau khi một tài khoản **Dev** duyệt và gán 1 trong 6 vai trò: `Dev, GD, PM, HR, KT, SUP`. Dev có một trang quản trị riêng (tab **Quản trị**) để duyệt / chặn / bỏ chặn / xoá / thêm trước / đổi vai trò cho bất kỳ tài khoản nào.

## 1. Bật đăng nhập Google trong Firebase

1. Vào [Firebase Console](https://console.firebase.google.com) → chọn project đang dùng (khớp `VITE_FIREBASE_PROJECT_ID` trong `.env.local`).
2. **Authentication → Sign-in method** → bật provider **Google** → Save.
3. **Authentication → Settings → Authorized domains** → thêm domain Vercel đang deploy (ví dụ `your-app.vercel.app`) nếu chưa có sẵn. `localhost` đã được thêm mặc định, dùng để test local.

## 2. Tạo bảng `users` trong Supabase

Mở **Supabase Dashboard → SQL Editor**, chạy nội dung file [`supabase/sql/users.sql`](supabase/sql/users.sql). Bảng lưu email (khoá chính), UID Firebase, tên/ảnh Google, `role` (1 trong 6 giá trị trên), `status` (`pending` / `approved` / `blocked`), và các cột `region/project/store_codes/department/brand` đã được `rls.sql` giả định sẵn.

Bảng bật RLS nhưng **không có policy nào** — theo thiết kế, mọi truy cập bảng này chỉ đi qua các API serverless bằng service role key (mục 3), việc kiểm tra "chỉ Dev mới được sửa" nằm ở tầng code (`api/_lib/requireDev.js`), không dựa vào RLS.

## 3. Thêm biến môi trường

Vào **Vercel → Project → Settings → Environment Variables**, thêm cho Production (và Preview/Development nếu cần):

| Biến | Giá trị | Ghi chú |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (Supabase → Project Settings → API) | **Không** thêm tiền tố `VITE_` — biến `VITE_` sẽ bị gửi xuống trình duyệt, lộ quyền ghi toàn bảng |
| `DEV_BOOTSTRAP_EMAILS` | `danghoanganhtrung1234@gmail.com` (có thể thêm nhiều email, cách nhau dấu phẩy) | Email nào trong danh sách này, khi đăng nhập Google lần đầu, tự động được gán `role=Dev`, `status=approved` — dùng để phá vỡ vòng lặp "cần có Dev để duyệt Dev đầu tiên" |

`FIREBASE_SERVICE_ACCOUNT` và `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` đã có sẵn từ trước (dùng chung cho các API khác) — không cần thêm lại.

Sau khi lưu biến môi trường, **phải Redeploy** (Vercel không tự áp dụng env var mới cho deployment đang chạy).

Để test local (`vercel dev` hoặc chạy `frontend` + `api` riêng), thêm 2 dòng tương ứng vào `.env.local` ở thư mục gốc:
```
SUPABASE_SERVICE_ROLE_KEY=...
DEV_BOOTSTRAP_EMAILS=danghoanganhtrung1234@gmail.com
```

## 4. Cách hoạt động

- Đăng nhập Google → frontend gọi `GET /api/users/sync` với Firebase ID token. Endpoint này tạo row `pending` nếu là email lần đầu đăng nhập, hoặc tự nâng lên `Dev/approved` nếu email nằm trong `DEV_BOOTSTRAP_EMAILS`.
- Trong lúc chờ duyệt / nếu bị chặn, người dùng thấy màn hình tương ứng ("Tài khoản đang chờ duyệt" / "Tài khoản đã bị chặn") thay vì vào được dashboard.
- Dev đăng nhập sẽ thấy thêm tab **Quản trị** → gọi `GET /api/users/list`, `POST /api/users/update` (đổi role/duyệt/chặn/bỏ chặn), `POST /api/users/create` (thêm trước theo email), `POST /api/users/delete` (thu hồi quyền truy cập — không xoá tài khoản Google/Firebase thật, nếu họ đăng nhập lại sẽ tạo lại row `pending`).
- Tất cả các endpoint `api/users/*` (trừ `sync`) đều yêu cầu người gọi là Dev đã được duyệt, kiểm tra qua `api/_lib/requireDev.js`.

## 5. Tra lỗi thường gặp

| Thông báo | Nguyên nhân | Cách xử lý |
| --- | --- | --- |
| `Server chưa cấu hình SUPABASE_SERVICE_ROLE_KEY...` | Thiếu biến `SUPABASE_SERVICE_ROLE_KEY` trên Vercel/`.env.local` | Thêm biến ở mục 3, redeploy |
| Đăng nhập Google xong bị kẹt ở "Đang kiểm tra quyền truy cập..." | `api/users/sync` lỗi (thiếu env, hoặc bảng `users` chưa tạo) | Mở Vercel → Functions → Logs xem lỗi cụ thể; kiểm tra đã chạy `supabase/sql/users.sql` chưa |
| Đăng nhập Google báo lỗi popup | Domain chưa nằm trong Authorized domains (mục 1) hoặc trình duyệt chặn popup | Thêm domain vào Firebase, thử lại; kiểm tra trình duyệt không chặn popup |
| Tài khoản Dev bootstrap không thấy tab Quản trị | Email đăng nhập không khớp chính xác với `DEV_BOOTSTRAP_EMAILS` (kiểm tra khoảng trắng/hoa-thường) | Sửa biến môi trường, redeploy, đăng xuất/đăng nhập lại |
