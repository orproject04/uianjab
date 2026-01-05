-- Migration: Change nama_pejabat from text[] to jsonb and rename to pejabat
-- Date: 2026-01-05
-- Purpose: Store pegawai info as JSON with {name, nip, role} structure

-- Step 1: Add temporary column
ALTER TABLE peta_jabatan 
ADD COLUMN IF NOT EXISTS pejabat_new jsonb DEFAULT '[]'::jsonb;

-- Step 2: Migrate existing data (convert text[] to jsonb array of objects)
UPDATE peta_jabatan 
SET pejabat_new = (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('name', name_val, 'nip', '', 'role', 'PNS')
    ),
    '[]'::jsonb
  )
  FROM unnest(nama_pejabat) AS name_val
)
WHERE nama_pejabat IS NOT NULL AND array_length(nama_pejabat, 1) > 0;

-- Step 3: Drop old column
ALTER TABLE peta_jabatan DROP COLUMN nama_pejabat;

-- Step 4: Rename new column to 'pejabat'
ALTER TABLE peta_jabatan RENAME COLUMN pejabat_new TO pejabat;

-- Step 5: Set default value and NOT NULL constraint
ALTER TABLE peta_jabatan ALTER COLUMN pejabat SET DEFAULT '[]'::jsonb;
ALTER TABLE peta_jabatan ALTER COLUMN pejabat SET NOT NULL;

-- Verify the migration
SELECT 
  id, 
  nama_jabatan, 
  pejabat,
  bezetting
FROM peta_jabatan 
WHERE jsonb_array_length(pejabat) > 0
LIMIT 5;
