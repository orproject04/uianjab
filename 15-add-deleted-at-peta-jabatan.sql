-- 15-add-deleted-at-peta-jabatan.sql
-- Migration script to add soft delete functionality to peta_jabatan

BEGIN;

ALTER TABLE peta_jabatan 
ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

-- Create an index to optimize filtering active records
CREATE INDEX IF NOT EXISTS idx_so_deleted_at ON peta_jabatan(deleted_at);

COMMIT;
