# Đồng bộ Báo cáo UFF qua API

Tab **Báo cáo UFF** gọi `GET /api/uff/report` trên chính website Vercel. Serverless Function này đăng nhập UFF ở phía server, sau đó lấy:

- `GET /api/Schedule/get-schedules`
- `GET /api/CICO/history`

Browser chỉ nhận bản ghi check-in đã được chuẩn hóa (`ngày`, `giờ CI`, `store`, `nhân viên`, `ảnh CI` nếu UFF trả về), nên không còn phải tải ZIP và chạy OCR cho các bản ghi đó.

## Cấu hình trên Vercel

Vào **Project → Settings → Environment Variables**, thêm các biến sau cho Production, Preview và Development khi cần:

| Biến | Giá trị |
| --- | --- |
| `UFF_BASE_URL` | `https://uff.interdist.com.vn/` |
| `UFF_USERNAME` | Tài khoản UFF được cấp quyền xem CICO/Báo cáo |
| `UFF_PASSWORD` | Mật khẩu của tài khoản UFF |
| `FIREBASE_SERVICE_ACCOUNT` | Toàn bộ JSON của Firebase service account trên một dòng |

Không thêm các biến trên với tiền tố `VITE_`: biến `VITE_` sẽ bị gửi xuống trình duyệt. Sau khi lưu biến môi trường, redeploy Vercel rồi bấm **Đồng Bộ Ngày ...** trong tab Báo cáo UFF.

## Quyền UFF cần có

Tài khoản UFF phải có quyền đọc lịch và lịch sử check-in của phạm vi BA cần đối soát. Theo tài liệu UFF, quyền liên quan bao gồm `VIEW_CICO`; nếu endpoint chỉ trả lịch sử của chính tài khoản đăng nhập, cần Ez Net cấp endpoint quản trị hoặc mở rộng quyền cho tài khoản tích hợp.

## Khi dữ liệu không hiện

Function đã hỗ trợ các tên trường CICO phổ biến như `checkInTime`, `storeId`, `storeName` và `checkInPhotoUrl`. Nếu UFF trả về cấu trúc khác, gửi một response JSON mẫu đã che thông tin nhạy cảm để cập nhật bộ chuyển đổi trong `api/uff/report.js`.
