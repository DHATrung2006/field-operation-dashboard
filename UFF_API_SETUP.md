# Đồng bộ Báo cáo UFF qua API

Tab **Báo cáo UFF** gọi `GET /api/uff/report` trên chính website Vercel. Serverless Function (`api/uff/report.js`) giả lập một trình duyệt đăng nhập vào UFF Web Portal (MVC) ở phía server:

1. Tải trang `GET /Account/Login` để lấy cookie chống CSRF và `__RequestVerificationToken`.
2. `POST /Account/Login` với `UFF_USERNAME` / `UFF_PASSWORD` (+ token ở bước 1).
3. Dùng cookie đăng nhập để gọi `POST /CICO/GetDataAsync` (endpoint DataTables của trang CICO) lấy toàn bộ check-in trong khoảng ngày.

Browser chỉ nhận bản ghi đã chuẩn hóa (`date`, `ciTime`, `storeName`, `empName`, `cicoId`, ...) — endpoint này không kèm ảnh.

Ảnh CI được nạp riêng, theo yêu cầu (chỉ khi người dùng bấm xem 1 dòng), qua `GET /api/uff/photo?cicoId=...` (`api/uff/photo.js`): đăng nhập lại UFF (dùng chung `api/uff/uffAuth.js` với `report.js`), mở trang chi tiết `CICO/ViewCICO?id=...`, lấy các link ảnh, rồi tải ảnh về base64 để trả cho trình duyệt. Tab không còn hỗ trợ upload Zip/OCR.

## Cấu hình trên Vercel

Vào **Project → Settings → Environment Variables**, thêm các biến sau cho Production (và Preview/Development nếu cần):

| Biến | Giá trị |
| --- | --- |
| `UFF_BASE_URL` | `https://uff.interdist.com.vn/` (không có `/` thừa ở cuối cũng được, code tự strip) |
| `UFF_USERNAME` | Tài khoản UFF được cấp quyền xem CICO/Báo cáo |
| `UFF_PASSWORD` | Mật khẩu của tài khoản UFF |
| `FIREBASE_SERVICE_ACCOUNT` | Toàn bộ JSON của Firebase service account trên một dòng (dùng cho các API khác như `role.check`, `audit.log`; **không bắt buộc** để đồng bộ UFF hoạt động vì bước xác thực Firebase ở `api/uff/report.js` hiện chỉ cảnh báo chứ không chặn) |

Không thêm các biến trên với tiền tố `VITE_`: biến `VITE_` sẽ bị gửi xuống trình duyệt. Sau khi lưu biến môi trường, **phải Redeploy** (Vercel không tự áp dụng env var mới cho deployment đang chạy) rồi mới bấm **Đồng Bộ Ngày ...**.

## Tra lỗi theo thông báo hiện trên tab Báo cáo UFF

| Thông báo | Nguyên nhân | Cách xử lý |
| --- | --- | --- |
| `Biến môi trường UFF_BASE_URL chưa được cấu hình` | Chưa set `UFF_BASE_URL` trên Vercel | Thêm biến, redeploy |
| `UFF chưa được cấu hình. Hãy thêm UFF_USERNAME và UFF_PASSWORD...` | Thiếu 1 trong 2 biến | Thêm biến, redeploy |
| `Đăng nhập UFF Web Portal thất bại (HTTP ...)` | Sai tài khoản/mật khẩu, tài khoản bị khóa, hoặc UFF đổi cấu trúc form login (tên field khác `UserName`/`Password`) | Kiểm tra lại `UFF_USERNAME`/`UFF_PASSWORD`; nếu chắc chắn đúng, mở **Vercel → Deployments → Functions → Logs** đọc dòng `UFF login thất bại` (có kèm HTTP status + đoạn HTML trả về) để biết UFF từ chối vì lý do gì |
| `Lỗi khi lấy dữ liệu: HTTP ...` | Đăng nhập được nhưng gọi `CICO/GetDataAsync` lỗi (hết quyền, đổi endpoint...) | Xem chi tiết lỗi kèm theo trong thông báo |
| `UFF không trả về lượt check-in nào cho ngày đã chọn` | Đăng nhập + gọi API thành công nhưng không có check-in nào khớp ngày/quyền tài khoản | Thử ngày khác chắc chắn có check-in; kiểm tra tài khoản UFF có quyền xem toàn bộ team hay chỉ xem của chính mình |
| `Có dữ liệu từ UFF nhưng hệ thống không khớp được định dạng` | UFF trả về dữ liệu (`meta.cicos > 0`) nhưng field bị lọc hết (ví dụ toàn `00:00` hoặc thiếu `cI_DateStr`) | Nhấn F12 mở Console, xem `Mẫu 1 dòng dữ liệu gốc chưa xử lý` (`meta.debug.sampleRaw`) rồi đối chiếu với logic chuẩn hoá trong `api/uff/report.js` |

## Quyền UFF cần có

Tài khoản UFF phải có quyền `MNG_DATA_VIEW` hoặc `MNG_DATA_EXPORT` (tương đương quyền xem trang CICO trên Web Portal). Thiếu quyền này thì login vẫn thành công nhưng `GetDataAsync`/`ViewCICO` trả về từ chối truy cập — biểu hiện giống lỗi HTTP khác, không phải sai UserName/Password. Nếu tài khoản chỉ thấy dữ liệu cá nhân, cần nhờ quản trị UFF cấp quyền xem toàn team/khu vực cho tài khoản tích hợp.
