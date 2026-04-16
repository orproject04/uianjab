-- Menambahkan dan/atau mengubah tipe kolom updated_by menjadi text pada tabel peta_jabatan
ALTER TABLE peta_jabatan 
ADD COLUMN IF NOT EXISTS updated_by text;

ALTER TABLE peta_jabatan 
ALTER COLUMN updated_by TYPE text;
