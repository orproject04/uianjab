# Simple migration runner
$env:PGPASSWORD = 'Ortalayes1'

# Find psql.exe
$psqlPaths = @(
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe",
    "C:\Program Files\PostgreSQL\14\bin\psql.exe",
    "C:\Program Files\PostgreSQL\13\bin\psql.exe"
)

$psql = $null
foreach ($path in $psqlPaths) {
    if (Test-Path $path) {
        $psql = $path
        break
    }
}

if ($psql) {
    Write-Host "Running migration..." -ForegroundColor Cyan
    & $psql -U postgres -d eaa -h localhost -p 5432 -f "migrations\005_enable_pg_trgm.sql"
    Write-Host "Done!" -ForegroundColor Green
} else {
    Write-Host "psql not found. Please run these SQL commands manually in pgAdmin:" -ForegroundColor Yellow
    Write-Host ""
    Get-Content "migrations\005_enable_pg_trgm.sql"
}

$env:PGPASSWORD = $null
