-- Enable pg_trgm extension for fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create index on jabatan.nama_jabatan for faster similarity search
CREATE INDEX IF NOT EXISTS idx_jabatan_nama_jabatan_trgm 
ON jabatan USING gin (nama_jabatan gin_trgm_ops);

-- Optional: Create index on peta_jabatan.nama_jabatan juga
CREATE INDEX IF NOT EXISTS idx_peta_jabatan_nama_jabatan_trgm 
ON peta_jabatan USING gin (nama_jabatan gin_trgm_ops);
