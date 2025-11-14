# PowerShell Script untuk menjalankan migration
# Usage: .\run-migration.ps1

$env:PGPASSWORD = 'Ortalayes1'
$DB_HOST = 'localhost'
$DB_PORT = '5432'
$DB_NAME = 'eaa'
$DB_USER = 'postgres'

Write-Host "Connecting to PostgreSQL at ${DB_HOST}:${DB_PORT}/${DB_NAME}..." -ForegroundColor Cyan

# Try common PostgreSQL installation paths
$psqlPaths = @(
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe",
    "C:\Program Files\PostgreSQL\14\bin\psql.exe",
    "C:\Program Files\PostgreSQL\13\bin\psql.exe",
    "C:\Program Files (x86)\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files (x86)\PostgreSQL\15\bin\psql.exe"
)

$psqlExe = $null
foreach ($path in $psqlPaths) {
    if (Test-Path $path) {
        $psqlExe = $path
        Write-Host "Found psql at: $psqlExe" -ForegroundColor Green
        break
    }
}

if (-not $psqlExe) {
    Write-Host "ERROR: psql not found in common PostgreSQL paths!" -ForegroundColor Red
    Write-Host "Please install PostgreSQL or add psql to PATH" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Alternatively, run these SQL commands manually in pgAdmin or any PostgreSQL client:" -ForegroundColor Yellow
    Write-Host ""
    Get-Content "migrations\005_enable_pg_trgm.sql"
    exit 1
}

# Run migration
Write-Host ""
Write-Host "Running migration: 005_enable_pg_trgm.sql" -ForegroundColor Cyan
Write-Host ""

try {
    & $psqlExe -U $DB_USER -d $DB_NAME -h $DB_HOST -p $DB_PORT -f "migrations\005_enable_pg_trgm.sql"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓ Migration completed successfully!" -ForegroundColor Green
        Write-Host ""
        
        # Verify extension
        Write-Host "Verifying pg_trgm extension..." -ForegroundColor Cyan
        & $psqlExe -U $DB_USER -d $DB_NAME -h $DB_HOST -p $DB_PORT -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_trgm';"
        
        Write-Host ""
        Write-Host "Verifying indexes..." -ForegroundColor Cyan
        & $psqlExe -U $DB_USER -d $DB_NAME -h $DB_HOST -p $DB_PORT -c "\di idx_jabatan_nama_jabatan_trgm"
        & $psqlExe -U $DB_USER -d $DB_NAME -h $DB_HOST -p $DB_PORT -c "\di idx_peta_jabatan_nama_jabatan_trgm"
    } else {
        Write-Host ""
        Write-Host "✗ Migration failed!" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "✗ Error running migration: $_" -ForegroundColor Red
    exit 1
}

Remove-Item Env:\PGPASSWORD
