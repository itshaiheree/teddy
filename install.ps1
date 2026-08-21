# ============================================================
# Teddy — install via curl (Windows PowerShell)
#
# irm https://raw.githubusercontent.com/.../install.ps1 | iex
# ============================================================

Write-Host ""
Write-Host "==========================================" -ForegroundColor Gray
Write-Host "  🧸 Teddy — AI agent CLI installer" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Gray
Write-Host ""

# Check Node.js
try {
    $nodeVersion = node -v
    Write-Host "✔ Node.js $nodeVersion detected" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed. Please install from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Create temp directory
$tmpDir = Join-Path $env:TEMP "Teddy-install-$(Get-Random)"
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

Write-Host "📦 Downloading Teddy..." -ForegroundColor Gray

$archivePath = Join-Path $tmpDir "umami.tar.gz"
$repoUrl = "https://github.com/itshaiheree/Teddy/raw/refs/heads/main/umami.tar.gz"

try {
    Invoke-WebRequest -Uri $repoUrl -OutFile $archivePath -ErrorAction Stop
} catch {
    Write-Host "❌ Failed to download Teddy. Check your internet connection." -ForegroundColor Red
    exit 1
}

# Extract
Write-Host "📦 Extracting..." -ForegroundColor Gray
tar xzf $archivePath -C $tmpDir

$extractedDir = Get-ChildItem -Path $tmpDir -Directory | Select-Object -First 1
Set-Location $extractedDir.FullName

# Install globally
Write-Host "📦 Installing Teddy globally..." -ForegroundColor Gray
npm install -g . --silent

# Cleanup
Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "✅ Teddy installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "   Run: teddy" -ForegroundColor Gray
Write-Host "   Or:  teddy `"your task here`"" -ForegroundColor Gray
Write-Host ""
Write-Host "   Set API keys in %USERPROFILE%\.teddy\.env or as env vars:" -ForegroundColor Gray
Write-Host "     set PROVIDER=openai" -ForegroundColor Gray
Write-Host "     set OPENAI_API_KEY=sk-..." -ForegroundColor Gray
Write-Host ""
Write-Host "   Enjoy! 🚀" -ForegroundColor Cyan