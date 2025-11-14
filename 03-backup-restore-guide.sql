/* ============================================================================
   PANDAWA - Portal Anjab dan ABK Berbasis Web Terintegrasi
   Full Database Backup & Restore Guide
   
   File: 03-backup-restore-guide.sql
   Purpose: Panduan untuk backup dan restore database lengkap dengan data
   Version: 1.0
   Date: 2025-11-14
   ============================================================================ */

-- ============================================================================
-- CARA BACKUP DATABASE (Export semua data)
-- ============================================================================

-- Gunakan perintah berikut di command line / PowerShell:

-- Windows PowerShell:
-- pg_dump -U postgres -h localhost -d nama_database -F p -f 03-full-data-backup.sql

-- Dengan schema dan data terpisah:
-- pg_dump -U postgres -h localhost -d nama_database --schema-only -F p -f schema-only.sql
-- pg_dump -U postgres -h localhost -d nama_database --data-only -F p -f data-only.sql

-- Backup dalam format custom (compressed):
-- pg_dump -U postgres -h localhost -d nama_database -F c -f backup.dump

-- ============================================================================
-- CARA RESTORE DATABASE
-- ============================================================================

-- 1. Buat database baru (jika belum ada):
-- CREATE DATABASE nama_database_baru;

-- 2. Restore dari file SQL:
-- psql -U postgres -h localhost -d nama_database_baru -f 01-schema.sql
-- psql -U postgres -h localhost -d nama_database_baru -f 02-initial-data.sql
-- psql -U postgres -h localhost -d nama_database_baru -f 03-full-data-backup.sql

-- 3. Restore dari custom format:
-- pg_restore -U postgres -h localhost -d nama_database_baru backup.dump

-- ============================================================================
-- CARA MIGRASI KE SERVER PRODUCTION
-- ============================================================================

-- STEP 1: Di server DEVELOPMENT
-- ----------------------------------------
-- Export schema:
-- pg_dump -U postgres -h localhost -d pandawa_dev --schema-only -F p -f 01-schema.sql

-- Export data:
-- pg_dump -U postgres -h localhost -d pandawa_dev --data-only -F p -f 03-full-data.sql

-- STEP 2: Transfer file ke server PRODUCTION
-- ----------------------------------------
-- Copy file 01-schema.sql dan 03-full-data.sql ke server production

-- STEP 3: Di server PRODUCTION
-- ----------------------------------------
-- Buat database baru:
-- CREATE DATABASE pandawa_production;

-- Jalankan schema:
-- psql -U postgres -h localhost -d pandawa_production -f 01-schema.sql

-- Import data:
-- psql -U postgres -h localhost -d pandawa_production -f 03-full-data.sql

-- STEP 4: Update connection string di aplikasi
-- ----------------------------------------
-- Edit file .env:
-- DATABASE_URL="postgresql://user:password@host:5432/pandawa_production"

-- ============================================================================
-- BACKUP OTOMATIS (Recommended untuk Production)
-- ============================================================================

-- Buat script backup harian (Windows Task Scheduler / Linux Cron)
-- backup.bat (Windows):
-- 
-- @echo off
-- set PGPASSWORD=your_password
-- set BACKUP_DIR=D:\backups\pandawa
-- set DB_NAME=pandawa_production
-- set DATE=%date:~-4,4%%date:~-10,2%%date:~-7,2%
-- 
-- pg_dump -U postgres -h localhost -d %DB_NAME% -F c -f %BACKUP_DIR%\backup_%DATE%.dump
-- 
-- echo Backup selesai: backup_%DATE%.dump

-- ============================================================================
-- CLEANUP DATA LAMA (Optional)
-- ============================================================================

-- Hapus session yang expired:
-- DELETE FROM user_session WHERE expires_at < now();

-- Hapus email verification yang expired:
-- DELETE FROM email_verification WHERE expires_at < now() AND used_at IS NULL;

-- Hapus password reset yang expired:
-- DELETE FROM password_reset WHERE expires_at < now() AND used_at IS NULL;

-- ============================================================================
-- MONITORING DATABASE SIZE
-- ============================================================================

-- Check ukuran database:
-- SELECT pg_size_pretty(pg_database_size('pandawa_production'));

-- Check ukuran per tabel:
-- SELECT 
--   schemaname,
--   tablename,
--   pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ============================================================================
-- VACUUM & ANALYZE (Maintenance)
-- ============================================================================

-- Jalankan secara berkala untuk optimasi:
-- VACUUM ANALYZE;

-- Atau per tabel:
-- VACUUM ANALYZE peta_jabatan;
-- VACUUM ANALYZE jabatan;

-- ============================================================================
-- REINDEX (Jika performance menurun)
-- ============================================================================

-- Rebuild semua index:
-- REINDEX DATABASE pandawa_production;

-- Atau per tabel:
-- REINDEX TABLE peta_jabatan;
-- REINDEX TABLE jabatan;

-- ============================================================================
-- NOTES PENTING
-- ============================================================================

-- 1. SELALU backup sebelum melakukan perubahan besar
-- 2. Test restore di environment development dulu
-- 3. Gunakan format custom (.dump) untuk backup production (lebih cepat & compress)
-- 4. Set up backup otomatis harian
-- 5. Simpan minimal 7 backup terakhir
-- 6. Encrypt backup file jika berisi data sensitif
-- 7. Store backup di lokasi terpisah dari server database

-- ============================================================================
-- END OF GUIDE
-- ============================================================================
