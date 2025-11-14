-- Migration 004: Cleanup Redundant Jabatan Data
-- Menghapus data redundan di tabel jabatan dan child tables

-- 1. Identifikasi dan hapus duplikat di tabel jabatan
-- Strategi: Keep the oldest record (based on created_at) for each unique nama_jabatan

-- Pertama, lihat data duplikat
DO $$
DECLARE
    dup_record RECORD;
    duplicate_groups INTEGER;
BEGIN
    -- Hitung jumlah duplikat berdasarkan nama_jabatan
    SELECT COUNT(*) INTO duplicate_groups
    FROM (
        SELECT nama_jabatan, COUNT(*) as cnt
        FROM jabatan
        GROUP BY nama_jabatan
        HAVING COUNT(*) > 1
    ) duplicates;
    
    RAISE NOTICE 'Found % duplicate nama_jabatan groups', duplicate_groups;
    
    -- Tampilkan detail duplikat
    FOR dup_record IN 
        SELECT nama_jabatan, COUNT(*) as cnt
        FROM jabatan
        GROUP BY nama_jabatan
        HAVING COUNT(*) > 1
        ORDER BY cnt DESC
    LOOP
        RAISE NOTICE 'Duplicate: % (% records)', dup_record.nama_jabatan, dup_record.cnt;
    END LOOP;
END $$;

-- 2. Backup data sebelum delete
CREATE TABLE IF NOT EXISTS jabatan_backup_004 AS 
SELECT * FROM jabatan;

CREATE TABLE IF NOT EXISTS peta_jabatan_backup_004 AS 
SELECT * FROM peta_jabatan;

-- 3. Update peta_jabatan untuk menggunakan jabatan_id yang akan dipertahankan
-- (oldest record per nama_jabatan)
WITH oldest_jabatan AS (
    SELECT DISTINCT ON (nama_jabatan)
        id as keep_id,
        nama_jabatan
    FROM jabatan
    ORDER BY nama_jabatan, created_at ASC
),
duplicate_jabatan AS (
    SELECT j.id as remove_id, oj.keep_id
    FROM jabatan j
    INNER JOIN oldest_jabatan oj ON j.nama_jabatan = oj.nama_jabatan
    WHERE j.id != oj.keep_id
)
UPDATE peta_jabatan
SET jabatan_id = dj.keep_id
FROM duplicate_jabatan dj
WHERE peta_jabatan.jabatan_id = dj.remove_id;

-- 4. Hapus jabatan duplikat (child records akan cascade delete)
WITH oldest_jabatan AS (
    SELECT DISTINCT ON (nama_jabatan)
        id as keep_id,
        nama_jabatan
    FROM jabatan
    ORDER BY nama_jabatan, created_at ASC
)
DELETE FROM jabatan
WHERE id NOT IN (SELECT keep_id FROM oldest_jabatan);

-- 5. Verifikasi hasil
DO $$
DECLARE
    total_jabatan INTEGER;
    duplicate_count INTEGER;
    peta_without_jabatan INTEGER;
BEGIN
    -- Total jabatan tersisa
    SELECT COUNT(*) INTO total_jabatan FROM jabatan;
    RAISE NOTICE 'Total jabatan after cleanup: %', total_jabatan;
    
    -- Cek masih ada duplikat atau tidak
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT nama_jabatan, COUNT(*) as cnt
        FROM jabatan
        GROUP BY nama_jabatan
        HAVING COUNT(*) > 1
    ) duplicates;
    RAISE NOTICE 'Remaining duplicates: %', duplicate_count;
    
    -- Cek peta_jabatan yang jabatan_id-nya NULL atau tidak valid
    SELECT COUNT(*) INTO peta_without_jabatan
    FROM peta_jabatan
    WHERE jabatan_id IS NULL OR jabatan_id NOT IN (SELECT id FROM jabatan);
    RAISE NOTICE 'Peta jabatan without valid jabatan_id: %', peta_without_jabatan;
END $$;

-- 6. Tambahkan UNIQUE constraint untuk mencegah duplikat di masa depan
-- ALTER TABLE jabatan ADD CONSTRAINT jabatan_nama_jabatan_unique UNIQUE (nama_jabatan);
-- Commented out - uncomment if you want to enforce uniqueness

-- RAISE NOTICE 'Migration 004 completed successfully';
