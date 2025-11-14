# ============================================================================
# PANDAWA - Export Full Data Script
# File: export-data.ps1
# Purpose: Export semua data dari database development
# ============================================================================

# Konfigurasi
$DB_USER = "postgres"
$DB_HOST = "localhost"
$DB_PORT = "5432"
$DB_NAME = "pandawa_dev"  # Ganti dengan nama database Anda
$OUTPUT_FILE = "03-full-data-backup.sql"

Write-Host "================================" -ForegroundColor Cyan
Write-Host "PANDAWA Database Export" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Cek apakah pg_dump tersedia
try {
    $pgDumpVersion = & pg_dump --version
    Write-Host "✓ pg_dump found: $pgDumpVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ pg_dump tidak ditemukan!" -ForegroundColor Red
    Write-Host "  Pastikan PostgreSQL sudah terinstall dan ada di PATH" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Database: $DB_NAME" -ForegroundColor White
Write-Host "Output: $OUTPUT_FILE" -ForegroundColor White
Write-Host ""

# Prompt password
$securePassword = Read-Host "Enter PostgreSQL password" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

# Set PGPASSWORD environment variable
$env:PGPASSWORD = $password

Write-Host ""
Write-Host "Exporting data..." -ForegroundColor Yellow

try {
    # Export data only (no schema)
    & pg_dump -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME --data-only --inserts -f $OUTPUT_FILE
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Export berhasil!" -ForegroundColor Green
        Write-Host ""
        Write-Host "File tersimpan: $OUTPUT_FILE" -ForegroundColor White
        
        # Show file size
        $fileSize = (Get-Item $OUTPUT_FILE).Length / 1KB
        Write-Host "Ukuran file: $([math]::Round($fileSize, 2)) KB" -ForegroundColor White
    } else {
        Write-Host "✗ Export gagal!" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error: $_" -ForegroundColor Red
    exit 1
} finally {
    # Clear password from memory
    $env:PGPASSWORD = $null
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Cara restore:" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host "1. psql -U postgres -d database_name -f 01-schema.sql" -ForegroundColor White
Write-Host "2. psql -U postgres -d database_name -f 02-initial-data.sql" -ForegroundColor White
Write-Host "3. psql -U postgres -d database_name -f $OUTPUT_FILE" -ForegroundColor White
Write-Host ""
