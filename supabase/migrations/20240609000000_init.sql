-- Initial schema: single assemblies table for JSONB blob storage.
-- This matches the current production schema.

CREATE TABLE IF NOT EXISTS assemblies (
  id   integer PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '[]'::jsonb
);

-- Enable RLS with permissive policies (single shared row for all users).
ALTER TABLE assemblies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to assemblies"
  ON assemblies
  USING (true)
  WITH CHECK (true);

-- Seed the single row that the application expects.
INSERT INTO assemblies (id, data)
VALUES (1, '[]'::jsonb)
ON CONFLICT (id) DO UPDATE SET data = assemblies.data;
