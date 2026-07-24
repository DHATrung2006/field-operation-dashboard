-- supabase/sql/user_consents.sql
-- Table to store user consent flag for NPA compliance
CREATE TABLE IF NOT EXISTS user_consents (
  user_id UUID PRIMARY KEY,
  consented BOOLEAN NOT NULL DEFAULT FALSE,
  consented_at TIMESTAMPTZ DEFAULT now()
);

-- Enable SELECT/INSERT policy for authenticated users
CREATE POLICY user_consents_insert_policy ON user_consents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_consents_select_policy ON user_consents
  FOR SELECT USING (auth.uid() = user_id);

-- Enable RLS
ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;
