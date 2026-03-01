# Docker installation script for Windows
# Run as Administrator

Write-Host "🐳 Installing Docker Desktop for Windows..." -ForegroundColor Cyan

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "❌ This script must be run as Administrator" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Check if Docker is already installed
if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host "✓ Docker is already installed" -ForegroundColor Green
    docker --version
    exit 0
}

# Download Docker Desktop installer
$downloadUrl = "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
$installerPath = "$env:TEMP\DockerDesktopInstaller.exe"

Write-Host "Downloading Docker Desktop installer..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath
    Write-Host "✓ Download complete" -ForegroundColor Green
} catch {
    Write-Host "❌ Download failed: $_" -ForegroundColor Red
    Write-Host "Please download manually from: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Run installer
Write-Host "Running Docker Desktop installer..." -ForegroundColor Yellow
Write-Host "(This may take several minutes)" -ForegroundColor Gray

try {
    Start-Process -FilePath $installerPath -ArgumentList "install", "--quiet" -Wait -NoNewWindow
    Write-Host "✓ Docker Desktop installed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚠ Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Restart your computer"
    Write-Host "  2. Start Docker Desktop from the Start menu"
    Write-Host "  3. Accept the service agreement"
    Write-Host "  4. Wait for Docker to start (Docker icon in system tray)"
    Write-Host "  5. Re-run the hub setup: npm run hub:setup"
} catch {
    Write-Host "❌ Installation failed: $_" -ForegroundColor Red
    Write-Host "Please install manually: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Cleanup
Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue
