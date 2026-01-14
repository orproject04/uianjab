-- Migration: Create rekom_jf table for storing JF recommendation letters
-- Date: 2026-01-14

-- Create extension for UUID generation if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create rekom_jf table
CREATE TABLE IF NOT EXISTS rekom_jf (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nama VARCHAR(255) NOT NULL,
    kemenpan_path VARCHAR(500),
    instansi_pembina_path VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on nama for faster searches
CREATE INDEX idx_rekom_jf_nama ON rekom_jf(nama);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_rekom_jf_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_rekom_jf_updated_at
    BEFORE UPDATE ON rekom_jf
    FOR EACH ROW
    EXECUTE FUNCTION update_rekom_jf_updated_at();

-- Comments
COMMENT ON TABLE rekom_jf IS 'Stores JF recommendation letters from KEMENPAN and Instansi Pembina';
COMMENT ON COLUMN rekom_jf.id IS 'Primary key UUID';
COMMENT ON COLUMN rekom_jf.nama IS 'Name/title of the recommendation letter';
COMMENT ON COLUMN rekom_jf.kemenpan_path IS 'File path to KEMENPAN recommendation PDF';
COMMENT ON COLUMN rekom_jf.instansi_pembina_path IS 'File path to Instansi Pembina recommendation PDF';
