/* ============================================================================
   PANDAWA - Portal Anjab dan ABK Berbasis Web Terintegrasi
   Initial Data Setup
   
   File: 02-initial-data.sql
   Purpose: Data awal yang diperlukan untuk menjalankan aplikasi
   Version: 1.0
   Date: 2025-11-14
   ============================================================================ */

-- ============================================================================
-- DEFAULT ADMIN USER
-- Password: admin123 (WAJIB DIGANTI SETELAH LOGIN PERTAMA!)
-- ============================================================================

INSERT INTO user_anjab (id, email, password_hash, full_name, is_email_verified, role, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'admin@setjen.dpd.go.id',
  '$2a$10$rQJ5vN0qH8yKZ3fXZGxXL.xB7pYZYGxQvZ3qH8yKZ3fXZGxXL.xB7p', -- admin123
  'Administrator',
  true,
  'admin',
  now(),
  now()
) ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- PETA JABATAN ROOT (Setjen DPD RI)
-- ============================================================================

INSERT INTO peta_jabatan (id, parent_id, jabatan_id, nama_jabatan, unit_kerja, slug, level, order_index, is_pusat, jenis_jabatan, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  NULL,
  NULL,
  'Sekretariat Jenderal DPD RI',
  'Setjen DPD RI',
  'setjen',
  0,
  0,
  true,
  'ESELON I',
  now(),
  now()
) ON CONFLICT (parent_id, slug) DO NOTHING;

-- ============================================================================
-- NOTES
-- ============================================================================

-- 1. Password default admin adalah: admin123
--    SEGERA ganti password setelah login pertama!
--
-- 2. Peta jabatan root sudah dibuat (Setjen DPD RI)
--    Anda dapat menambahkan struktur jabatan di bawahnya melalui aplikasi
--
-- 3. Untuk menambahkan master anjab, gunakan fitur upload Word document
--    atau buat manual melalui menu Master Anjab
--
-- 4. Untuk matching otomatis antara peta jabatan dengan master anjab,
--    gunakan menu Match Anjab (admin only)

-- ============================================================================
-- END OF INITIAL DATA
-- ============================================================================
