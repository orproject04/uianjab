-- Migration: Reverse relation from jabatan.peta_id to peta_jabatan.jabatan_id
-- Description: Move relation from jabatan to peta_jabatan and add tugas_pokok_abk table
BEGIN;

-- Step 1: Add jabatan_id to peta_jabatan
ALTER TABLE peta_jabatan 
ADD COLUMN IF NOT EXISTS jabatan_id uuid REFERENCES jabatan(id) ON DELETE SET NULL;

-- Step 2: Migrate data - copy peta_id from jabatan to peta_jabatan.jabatan_id
UPDATE peta_jabatan pj
SET jabatan_id = j.id
FROM jabatan j
WHERE j.peta_id = pj.id;

-- Step 3: Create tugas_pokok_abk table
CREATE TABLE IF NOT EXISTS tugas_pokok_abk (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  peta_jabatan_id          uuid NOT NULL REFERENCES peta_jabatan(id) ON DELETE CASCADE,
  tugas_pokok_id           int NOT NULL REFERENCES tugas_pokok(id) ON DELETE CASCADE,
  jumlah_hasil             numeric(10,2),
  waktu_penyelesaian_jam   numeric(10,2),
  waktu_efektif            numeric(10,2),
  kebutuhan_pegawai        numeric(10,2),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_peta_tugas UNIQUE (peta_jabatan_id, tugas_pokok_id)
);

CREATE INDEX IF NOT EXISTS idx_tugas_pokok_abk_peta  ON tugas_pokok_abk(peta_jabatan_id);
CREATE INDEX IF NOT EXISTS idx_tugas_pokok_abk_tugas ON tugas_pokok_abk(tugas_pokok_id);

CREATE OR REPLACE FUNCTION trg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS tugas_pokok_abk_touch ON tugas_pokok_abk;
CREATE TRIGGER tugas_pokok_abk_touch
BEFORE UPDATE ON tugas_pokok_abk
FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

-- Step 4: Migrate ABK data from tugas_pokok to tugas_pokok_abk
INSERT INTO tugas_pokok_abk (
  peta_jabatan_id,
  tugas_pokok_id,
  jumlah_hasil,
  waktu_penyelesaian_jam,
  waktu_efektif,
  kebutuhan_pegawai
)
SELECT 
  j.peta_id,
  tp.id,
  tp.jumlah_hasil::numeric(10,2),
  tp.waktu_penyelesaian_jam::numeric(10,2),
  tp.waktu_efektif::numeric(10,2),
  tp.kebutuhan_pegawai::numeric(10,2)
FROM tugas_pokok tp
INNER JOIN jabatan j ON j.id = tp.jabatan_id
WHERE j.peta_id IS NOT NULL
ON CONFLICT (peta_jabatan_id, tugas_pokok_id) DO NOTHING;

-- Step 5: Create index for jabatan_id in peta_jabatan
CREATE INDEX IF NOT EXISTS idx_so_jabatan ON peta_jabatan(jabatan_id);

-- Step 6: Drop old columns and indexes from jabatan
DROP INDEX IF EXISTS idx_jabatan_peta_id;
DROP INDEX IF EXISTS idx_jabatan_slug;

ALTER TABLE jabatan DROP COLUMN IF EXISTS peta_id;
ALTER TABLE jabatan DROP COLUMN IF EXISTS slug;

-- Verification
DO $$
DECLARE
    v_peta_with_jabatan INTEGER;
    v_abk_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_peta_with_jabatan FROM peta_jabatan WHERE jabatan_id IS NOT NULL;
    SELECT COUNT(*) INTO v_abk_count FROM tugas_pokok_abk;
    
    RAISE NOTICE '=== Migration Complete ===';
    RAISE NOTICE 'Peta jabatan with jabatan_id: %', v_peta_with_jabatan;
    RAISE NOTICE 'ABK records migrated: %', v_abk_count;
    RAISE NOTICE 'Columns removed from jabatan: peta_id, slug';
    RAISE NOTICE 'Column added to peta_jabatan: jabatan_id';
    RAISE NOTICE 'New table created: tugas_pokok_abk';
END $$;

COMMIT;
