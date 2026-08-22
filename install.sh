#!/usr/bin/env bash
# ============================================================
# Teddy — install via curl (Linux / macOS)
# No npm/pnpm required — installs pre-built binary
#
# curl -fsSL https://raw.githubusercontent.com/itshaiheree/teddy/main/install.sh | bash
# ============================================================
set -e

echo ""
echo "=========================================="
echo "  Teddy — AI agent CLI installer"
echo "=========================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "Node.js >= 18 is required. Install from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "Node.js >= 18 is required. Current: $(node -v)"
  exit 1
fi

echo "Node.js $(node -v) detected"

# Installation directory
INSTALL_DIR="$HOME/.teddy/bin"
BIN_DIR="$HOME/.local/bin"

# Create directories
mkdir -p "$INSTALL_DIR"
mkdir -p "$BIN_DIR"

# Create temp directory
TMPDIR=$(mktemp -d)
echo "Downloading Teddy..."

# Download from GitHub
REPO_URL="https://github.com/itshaiheree/teddy/raw/refs/heads/main/umami.tar.gz"
if command -v curl &> /dev/null; then
  curl -fsSL "$REPO_URL" -o "$TMPDIR/umami.tar.gz"
elif command -v wget &> /dev/null; then
  wget -q "$REPO_URL" -O "$TMPDIR/umami.tar.gz"
else
  echo "curl or wget is required"
  exit 1
fi

# Sanity check: the downloaded file MUST be a real gzip archive.
# The repo's release asset is a .tar.gz; if it is missing, misconfigured,
# or accidentally saved in another format (e.g. 7-Zip), `tar xzf` would
# fail with "gzip: stdin: not in gzip format". Catch that early instead.
if [ ! -s "$TMPDIR/umami.tar.gz" ] || ! gzip -t "$TMPDIR/umami.tar.gz" 2>/dev/null; then
  echo "ERROR: Downloaded file is not a valid gzip archive."
  echo "   The release asset may be missing or misconfigured."
  echo "   Expected URL: $REPO_URL"
  echo "   Please report this at: https://github.com/itshaiheree/teddy/issues"
  rm -rf "$TMPDIR"
  exit 1
fi

# Extract to install directory
echo "Extracting..."
tar xzf "$TMPDIR/umami.tar.gz" -C "$INSTALL_DIR"

# Verify the main entry point was extracted
if [ ! -f "$INSTALL_DIR/index.js" ]; then
  echo "ERROR: Extraction failed — index.js not found in $INSTALL_DIR"
  rm -rf "$TMPDIR"
  exit 1
fi

# Create package.json with type:module so Node.js treats .js as ESM
echo '{"type":"module"}' > "$INSTALL_DIR/package.json"

# Create wrapper script
WRAPPER="$BIN_DIR/teddy"
cat > "$WRAPPER" << 'EOF'
#!/usr/bin/env bash
# Teddy CLI wrapper - runs the pre-built Node.js CLI
exec node --no-deprecation "$HOME/.teddy/bin/index.js" "$@"
EOF

chmod +x "$WRAPPER"

# Cleanup
rm -rf "$TMPDIR"

# Check if ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  echo ""
  echo "Note: $HOME/.local/bin is not in your PATH."
  echo "   Add this to your ~/.bashrc, ~/.zshrc, or ~/.profile:"
  echo ""
  echo "     export PATH=\"\$HOME/.local/bin:\$PATH\""
  echo ""
  echo "   Then restart your shell or run: source ~/.bashrc"
fi

echo ""
echo "Teddy installed successfully!"
echo ""
echo "   Run: teddy"
echo "   Or:  teddy \"your task here\""
echo ""
echo "   Set API keys in ~/.teddy/.env or as env vars:"
echo "     export PROVIDER=openai"
echo "     export OPENAI_API_KEY=sk-..."
echo ""
echo "Enjoy! 🚀"