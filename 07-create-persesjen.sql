-- Migration: Create persesjen table for storing Persesjen documents
-- Date: 2026-01-23

-- Create extension for UUID generation if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create persesjen table
CREATE TABLE IF NOT EXISTS persesjen (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nama VARCHAR(255) NOT NULL,
  jenis_persesjen VARCHAR(100) NOT NULL,
  persesjen_path VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on nama for faster searches
CREATE INDEX IF NOT EXISTS idx_persesjen_nama ON persesjen(nama);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_persesjen_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_persesjen_updated_at ON persesjen;
CREATE TRIGGER trigger_persesjen_updated_at
  BEFORE UPDATE ON persesjen
  FOR EACH ROW
  EXECUTE FUNCTION update_persesjen_updated_at();

-- Comments
COMMENT ON TABLE persesjen IS 'Stores Persesjen documents';
COMMENT ON COLUMN persesjen.id IS 'Primary key UUID';
COMMENT ON COLUMN persesjen.nama IS 'Name/title of the Persesjen document';
COMMENT ON COLUMN persesjen.jenis_persesjen IS 'Type of Persesjen document (Peta Jabatan or Kelas Jabatan)';
COMMENT ON COLUMN persesjen.persesjen_path IS 'File path to Persesjen PDF';
