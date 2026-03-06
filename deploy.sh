#!/bin/bash
# Deploy script: publish to GitHub and Railway

cd "$(dirname "$0")"

echo "📦 Staging changes..."
git add .

if [ -z "$(git status --porcelain)" ]; then
  echo "Nothing to commit. Working tree clean."
else
  echo "💬 Committing..."
  git commit -m "Update: $(date '+%Y-%m-%d %H:%M')"

  echo "🚀 Pushing to GitHub..."
  git push origin main
fi

# Deploy to Railway (if CLI is installed and project is linked)
if command -v railway &> /dev/null; then
  echo "🚂 Deploying to Railway..."
  railway up
else
  echo "ℹ️  Railway CLI not found. Install with: npm i -g @railway/cli"
  echo "   (If Railway is connected to this GitHub repo, it will auto-deploy on push.)"
fi

echo "✅ Done! Published to GitHub and Railway."
