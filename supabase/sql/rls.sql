-- supabase/sql/rls.sql
-- Row Level Security policies for Field Operation Dashboard

-- Users table must already have columns: role, region, project, store_codes, department, brand

-- Enable RLS on the main data tables (example: hr_data, schedule_data)

-- HR data table
CREATE POLICY hr_select_policy ON hr_data
  FOR SELECT USING (
    auth.role() = 'HR'               -- HR sees all rows
    OR auth.role() = 'PM'           -- PM sees all rows
    OR (auth.role() = 'SUP' AND region = auth.region())
    OR (auth.role() = 'ADMIN' AND project = ANY (SELECT project FROM admin_projects WHERE admin_id = auth.uid()))
    OR auth.role() = 'DEV'
  );

CREATE POLICY hr_insert_policy ON hr_data
  FOR INSERT WITH CHECK (
    auth.role() IN ('HR', 'DEV')
  );

CREATE POLICY hr_update_policy ON hr_data
  FOR UPDATE USING (
    auth.role() IN ('HR', 'DEV')
  );

CREATE POLICY hr_delete_policy ON hr_data
  FOR DELETE USING (
    auth.role() = 'DEV'
  );

-- Schedule data table (example)
CREATE POLICY schedule_select_policy ON schedule_data
  FOR SELECT USING (
    auth.role() = 'PM'
    OR (auth.role() = 'SUP' AND region = auth.region())
    OR (auth.role() = 'ADMIN' AND project = ANY (SELECT project FROM admin_projects WHERE admin_id = auth.uid()))
    OR auth.role() = 'DEV'
  );

-- Enable RLS on tables
ALTER TABLE hr_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_data ENABLE ROW LEVEL SECURITY;

-- Helper functions to extract JWT claims (PostgreSQL)
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.region() RETURNS text AS $$
  SELECT nullif(current_setting('request.jwt.claim.region', true), '');
$$ LANGUAGE sql STABLE;
