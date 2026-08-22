# ============================================================
# Teddy — install via curl (Windows PowerShell)
# No npm/pnpm required — installs pre-built binary
#
# irm https://raw.githubusercontent.com/itshaiheree/teddy/main/install.ps1 | iex
# ============================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ""
Write-Host "==========================================" -ForegroundColor Gray
Write-Host "  Teddy — AI agent CLI installer" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Gray
Write-Host ""

# Check Node.js
$nodeVersion = node -v 2>$null
if (-not $nodeVersion) {
    Write-Host "Node.js is not installed. Please install from https://nodejs.org" -ForegroundColor Red
    exit 1
}
Write-Host "Node.js $nodeVersion detected" -ForegroundColor Green

# Check Node.js version
$versionParts = $nodeVersion.TrimStart('v').Split('.')
if ([int]$versionParts[0] -lt 18) {
    Write-Host "Node.js >= 18 is required. Current: $nodeVersion" -ForegroundColor Red
    exit 1
}

# Installation directories
$installDir = Join-Path $env:USERPROFILE ".teddy\bin"
$binDir = Join-Path $env:USERPROFILE ".local\bin"

# Create directories
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
New-Item -ItemType Directory -Path $binDir -Force | Out-Null

# Create temp directory
$tmpDir = Join-Path $env:TEMP "Teddy-install-$(Get-Random)"
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

Write-Host "Downloading Teddy..." -ForegroundColor Gray

$archivePath = Join-Path $tmpDir "umami.tar.gz"
$repoUrl = "https://github.com/itshaiheree/teddy/raw/refs/heads/main/umami.tar.gz"

try {
    Invoke-WebRequest -Uri $repoUrl -OutFile $archivePath -ErrorAction Stop
} catch {
    Write-Host "Failed to download Teddy. Check your internet connection." -ForegroundColor Red
    exit 1
}

# Sanity check: the downloaded file MUST be a real gzip archive.
# If the release asset is missing or saved in another format (e.g. 7-Zip),
# `tar xzf` would fail with "gzip: stdin: not in gzip format".
$bytes = Get-Content -Path $archivePath -Encoding Byte -TotalCount 2 -ErrorAction SilentlyContinue
if (-not $bytes -or $bytes[0] -ne 0x1F -or $bytes[1] -ne 0x8B) {
    Write-Host "ERROR: Downloaded file is not a valid gzip archive." -ForegroundColor Red
    Write-Host "   The release asset may be missing or misconfigured." -ForegroundColor Gray
    Write-Host "   Expected URL: $repoUrl" -ForegroundColor Gray
    Write-Host "   Please report this at: https://github.com/itshaiheree/teddy/issues" -ForegroundColor Gray
    exit 1
}

# Extract
Write-Host "Extracting..." -ForegroundColor Gray
tar xzf $archivePath -C $installDir

# Verify the main entry point was extracted
if (-not (Test-Path (Join-Path $installDir "index.js"))) {
    Write-Host "ERROR: Extraction failed - index.js not found in $installDir" -ForegroundColor Red
    exit 1
}

# Create package.json with type:module so Node.js treats .js as ESM
$packageJsonPath = Join-Path $installDir "package.json"
Set-Content -Path $packageJsonPath -Value '{"type":"module"}' -Encoding UTF8

# Create wrapper script (teddy.cmd for Windows)
$wrapperPath = Join-Path $binDir "teddy.cmd"
$wrapperContent = '@echo off
node --no-deprecation "%USERPROFILE%\.teddy\bin\index.js" %*'
Set-Content -Path $wrapperPath -Value $wrapperContent -Encoding ASCII

# Also create teddy.ps1 for PowerShell
$wrapperPs1Path = Join-Path $binDir "teddy.ps1"
$wrapperPs1Content = '# Teddy CLI wrapper for PowerShell
& node --no-deprecation "$env:USERPROFILE\.teddy\bin\index.js" @args'
Set-Content -Path $wrapperPs1Path -Value $wrapperPs1Content -Encoding UTF8

# Cleanup
Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue

# Check if bin directory is in PATH
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$binDirExpanded = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($binDir)
if ($userPath -notlike "*$binDirExpanded*") {
    Write-Host ""
    Write-Host "Note: $binDir is not in your user PATH." -ForegroundColor Yellow
    Write-Host "Run this command to add it permanently:" -ForegroundColor Gray
    $cmd = "[Environment]::SetEnvironmentVariable('Path', '$userPath;$binDirExpanded', 'User')"
    Write-Host "  $cmd" -ForegroundColor Cyan
    Write-Host "Then restart your terminal." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Teddy installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "  Run: teddy" -ForegroundColor Gray
Write-Host "  Or:  teddy `"your task here`"" -ForegroundColor Gray
Write-Host ""
Write-Host "  Set API keys in %USERPROFILE%\.teddy\.env or as env vars:" -ForegroundColor Gray
Write-Host "    set PROVIDER=openai" -ForegroundColor Gray
Write-Host "    set OPENAI_API_KEY=sk-..." -ForegroundColor Gray
Write-Host ""
Write-Host "Enjoy!" -ForegroundColor Cyan
Write-Host ""