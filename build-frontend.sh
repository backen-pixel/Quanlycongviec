#!/bin/bash
set -e
echo "🔧 Building frontend..."
cd "$(dirname "$0")/frontend"
npm ci --prefer-offline --no-audit
npm run build
echo "✅ Frontend built → dist/"
ls -la dist/index.html
