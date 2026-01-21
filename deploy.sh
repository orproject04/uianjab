#!/bin/bash
# Deployment script untuk rebuild aplikasi dengan 1 command
# Usage: ./deploy.sh

set -e  # Stop on error

echo "🚀 Starting deployment..."

echo "📦 Stopping containers..."
docker-compose down

echo "🧹 Cleaning up unused Docker resources..."
docker system prune -f

echo "🔨 Building fresh image (no cache)..."
docker-compose build --no-cache

echo "✅ Starting application..."
docker-compose up -d

echo "📊 Checking container status..."
docker-compose ps

echo ""
echo "✨ Deployment complete!"
echo "📱 Application: http://localhost:8087"
echo "📝 View logs: docker-compose logs -f anjab-app"
