#!/usr/bin/env bash
# ============================================================
# umigent — install via curl (Linux / macOS)
#
# curl -fsSL https://raw.githubusercontent.com/.../install.sh | bash
# ============================================================
set -e

echo ""
echo "=========================================="
echo "  🧸 Teddy — AI agent CLI installer"
echo "=========================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js >= 18 is required. Install from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js >= 18 is required. Current: $(node -v)"
  exit 1
fi

echo "✔ Node.js $(node -v) detected"

# Create temp directory
TMPDIR=$(mktemp -d)
echo "📦 Downloading Teddy..."

# Download from GitHub
REPO_URL="https://github.com/itshaiheree/teddy/raw/refs/heads/main/umami.tar.gz"
if command -v curl &> /dev/null; then
  curl -fsSL "$REPO_URL" -o "$TMPDIR/Teddy.tar.gz"
elif command -v wget &> /dev/null; then
  wget -q "$REPO_URL" -O "$TMPDIR/Teddy.tar.gz"
else
  echo "❌ curl or wget is required"
  exit 1
fi

# Extract
tar xzf "$TMPDIR/umami.tar.gz" -C "$TMPDIR"
cd "$TMPDIR"/teddy-*

# Install globally
echo "📦 Installing teddy globally..."
npm install -g . --silent

# Cleanup
rm -rf "$TMPDIR"

echo ""
echo "✅ teddy installed successfully!"
echo ""
echo "   Run: teddy"
echo "   Or:  teddy \"your task here\""
echo ""
echo "   Set API keys in ~/.teddy/.env or as env vars:"
echo "     export PROVIDER=openai"
echo "     export OPENAI_API_KEY=sk-..."
echo ""
echo "   Enjoy! 🚀"