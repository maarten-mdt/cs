#!/bin/bash
# Double-click to deploy: pushes to GitHub and deploys to Railway

cd "$(dirname "$0")"

# Load shell profile so railway/npm are in PATH (needed when opened from Finder)
[ -f ~/.zshrc ] && source ~/.zshrc 2>/dev/null
[ -f ~/.bash_profile ] && source ~/.bash_profile 2>/dev/null
export PATH="/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH"

echo "📦 Staging changes..."
git add .

if [ -z "$(git status --porcelain)" ]; then
  echo "Nothing to commit. Working tree clean."
else
  echo "💬 Committing..."
  git commit -m "Update: $(date '+%Y-%m-%d %H:%M')"

  echo "🚀 Pushing to GitHub..."
  if ! git push origin main; then
    echo ""
    echo "❌ Push failed. If GitHub asks for a password, use a Personal Access Token:"
    echo "   GitHub → Settings → Developer settings → Personal access tokens"
    echo ""
    read -p "Press Enter to close..."
    exit 1
  fi
fi

echo "🚂 Deploying to Railway..."
if command -v railway &>/dev/null; then
  railway up
  echo ""
  echo "✅ Done! Published to GitHub and Railway."
else
  echo ""
  echo "⚠️  Railway CLI not found. Install it with:"
  echo "    npm i -g @railway/cli"
  echo ""
  echo "Then run 'railway login' and 'railway link' in this folder."
  echo "GitHub push completed successfully."
fi

echo ""
read -p "Press Enter to close..."
