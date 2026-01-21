# Deploy Script Windows
# Usage: .\deploy.ps1

Write-Host "🚀 Starting deployment..." -ForegroundColor Green

Write-Host "📦 Stopping containers..." -ForegroundColor Yellow
docker-compose down

Write-Host "🧹 Cleaning up unused Docker resources..." -ForegroundColor Yellow
docker system prune -f

Write-Host "🔨 Building fresh image (no cache)..." -ForegroundColor Yellow
docker-compose build --no-cache

Write-Host "✅ Starting application..." -ForegroundColor Yellow
docker-compose up -d

Write-Host "📊 Checking container status..." -ForegroundColor Yellow
docker-compose ps

Write-Host ""
Write-Host "✨ Deployment complete!" -ForegroundColor Green
Write-Host "📱 Application: http://localhost:8087" -ForegroundColor Cyan
Write-Host "📝 View logs: docker-compose logs -f anjab-app" -ForegroundColor Cyan
