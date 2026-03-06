#!/bin/bash
# Double-click to deploy: pushes to GitHub and deploys to Railway

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

echo "🚂 Deploying to Railway..."
railway up

echo ""
echo "✅ Done! Published to GitHub and Railway."
echo ""
read -p "Press Enter to close..."
