/* ============================================================================
   PANDAWA - Portal Anjab dan ABK Berbasis Web Terintegrasi
   Database Migration: Versioning Peta Jabatan
   
   File: 16-versi-peta.sql
   Purpose: Menambahkan struktur multi-versi untuk Peta Jabatan
   ============================================================================ */

-- 1. Buat Tabel Versi Peta
CREATE TABLE IF NOT EXISTS peta_jabatan_versi (
    id VARCHAR(50) PRIMARY KEY,
    nama_versi VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'DRAFT', -- 'AKTIF', 'DRAFT', 'ARSIP'
    keterangan TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Aturan Best Practice: Menjamin hanya ada TEPAT 1 versi yang AKTIF di publik
CREATE UNIQUE INDEX IF NOT EXISTS uq_peta_versi_aktif 
ON peta_jabatan_versi (status) 
WHERE status = 'AKTIF';

-- Masukkan versi AKTIF pertama kali (disesuaikan dari judul Peta Jabatan Oktober 2026)
INSERT INTO peta_jabatan_versi (id, nama_versi, status) 
VALUES ('PETA_JABATAN_OKTOBER_2026', 'Peta Jabatan Oktober 2026', 'AKTIF')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. Migrasi Tabel peta_jabatan
-- ============================================================================

-- Tambahkan kolom versi_id
ALTER TABLE peta_jabatan ADD COLUMN IF NOT EXISTS versi_id VARCHAR(50) DEFAULT 'PETA_JABATAN_OKTOBER_2026';

-- Pastikan semua data lama masuk ke versi AKTIF
UPDATE peta_jabatan SET versi_id = 'PETA_JABATAN_OKTOBER_2026' WHERE versi_id IS NULL;

-- Jadikan versi_id NOT NULL
ALTER TABLE peta_jabatan ALTER COLUMN versi_id SET NOT NULL;

-- Tambahkan Foreign Key ke tabel versi (tanpa duplikasi constraint)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_peta_versi') THEN
        ALTER TABLE peta_jabatan ADD CONSTRAINT fk_peta_versi FOREIGN KEY (versi_id) REFERENCES peta_jabatan_versi(id) ON UPDATE CASCADE;
    END IF;
END $$;

-- Hapus constraints lama yang bergantung pada id tunggal
ALTER TABLE peta_jabatan DROP CONSTRAINT IF EXISTS peta_jabatan_pkey CASCADE;
ALTER TABLE peta_jabatan DROP CONSTRAINT IF EXISTS uq_so_parent_slug CASCADE;
ALTER TABLE peta_jabatan DROP CONSTRAINT IF EXISTS fk_peta_parent CASCADE; -- Hapus manual fk lama jika ada

-- Buat Primary Key baru gabungan (id, versi_id)
ALTER TABLE peta_jabatan ADD PRIMARY KEY (id, versi_id);

-- Kembalikan Foreign Key parent_id agar mengikuti versi_id yang sama
ALTER TABLE peta_jabatan ADD CONSTRAINT fk_peta_parent 
FOREIGN KEY (parent_id, versi_id) REFERENCES peta_jabatan (id, versi_id) ON DELETE CASCADE ON UPDATE CASCADE;

-- Kembalikan Unique Constraint
ALTER TABLE peta_jabatan ADD CONSTRAINT uq_so_parent_slug_versi UNIQUE (parent_id, slug, versi_id);


-- ============================================================================
-- 3. Migrasi Tabel tugas_pokok_abk
-- ============================================================================

-- Tambahkan kolom versi_id
ALTER TABLE tugas_pokok_abk ADD COLUMN IF NOT EXISTS versi_id VARCHAR(50) DEFAULT 'PETA_JABATAN_OKTOBER_2026';

-- Pastikan semua data lama masuk ke versi AKTIF
UPDATE tugas_pokok_abk SET versi_id = 'PETA_JABATAN_OKTOBER_2026' WHERE versi_id IS NULL;

-- Jadikan versi_id NOT NULL
ALTER TABLE tugas_pokok_abk ALTER COLUMN versi_id SET NOT NULL;

-- Hapus constraints lama
ALTER TABLE tugas_pokok_abk DROP CONSTRAINT IF EXISTS tugas_pokok_abk_peta_jabatan_id_fkey CASCADE;
ALTER TABLE tugas_pokok_abk DROP CONSTRAINT IF EXISTS uq_peta_tugas CASCADE;
ALTER TABLE tugas_pokok_abk DROP CONSTRAINT IF EXISTS tugas_pokok_abk_pkey CASCADE;

-- Buat Primary Key baru gabungan (id, versi_id)
ALTER TABLE tugas_pokok_abk ADD PRIMARY KEY (id, versi_id);

-- Kembalikan Foreign Key ke peta_jabatan dengan composite key
ALTER TABLE tugas_pokok_abk ADD CONSTRAINT fk_abk_peta 
FOREIGN KEY (peta_jabatan_id, versi_id) REFERENCES peta_jabatan (id, versi_id) ON DELETE CASCADE ON UPDATE CASCADE;

-- Kembalikan Unique Constraint
ALTER TABLE tugas_pokok_abk ADD CONSTRAINT uq_peta_tugas_versi UNIQUE (peta_jabatan_id, tugas_pokok_id, versi_id);
