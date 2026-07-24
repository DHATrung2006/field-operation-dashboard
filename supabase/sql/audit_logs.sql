-- supabase/sql/audit_logs.sql
-- Table to store audit logs for NPA compliance
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable INSERT policy for authenticated users
CREATE POLICY audit_insert_policy ON audit_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Enable SELECT policy for DEV/ADMIN only (optional, can be broader)
CREATE POLICY audit_select_policy ON audit_logs
  FOR SELECT USING (auth.role() IN ('DEV', 'ADMIN'));

-- Enable RLS on the table
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
