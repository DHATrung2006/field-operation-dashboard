-- supabase/sql/users.sql
-- Bảng người dùng đăng nhập (Firebase Auth: email/password + Google) và trạng thái duyệt/vai trò.
-- Khoá chính là email để Dev có thể "thêm trước" (pre-invite) một email trước khi người đó
-- từng đăng nhập; cột `id` (Firebase UID) được điền vào khi họ đăng nhập lần đầu.

CREATE TABLE IF NOT EXISTS public.users (
  email        TEXT PRIMARY KEY,
  id           TEXT UNIQUE,
  display_name TEXT,
  photo_url    TEXT,
  role         TEXT CHECK (role IN ('Dev', 'GD', 'PM', 'HR', 'KT', 'SUP')),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'blocked')),
  region       TEXT,
  project      TEXT,
  store_codes  TEXT[],
  department   TEXT,
  brand        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by  TEXT,
  approved_at  TIMESTAMPTZ
);

-- RLS bật nhưng KHÔNG có policy nào cho anon/authenticated: mọi truy cập bảng này
-- chỉ được thực hiện từ các API serverless dùng SUPABASE_SERVICE_ROLE_KEY (bypass RLS),
-- việc phân quyền (chỉ Dev mới sửa được) nằm ở tầng code trong api/_lib/requireDev.js.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
