# Tailscale installation script for Windows
# Run as Administrator

Write-Host "🔗 Installing Tailscale for Windows..." -ForegroundColor Cyan

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "❌ This script must be run as Administrator" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Check if Tailscale is already installed
if (Get-Command tailscale -ErrorAction SilentlyContinue) {
    Write-Host "✓ Tailscale is already installed" -ForegroundColor Green
    tailscale version
    exit 0
}

# Download Tailscale installer
$downloadUrl = "https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi"
$installerPath = "$env:TEMP\tailscale-setup.msi"

Write-Host "Downloading Tailscale installer..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath
    Write-Host "✓ Download complete" -ForegroundColor Green
} catch {
    Write-Host "❌ Download failed: $_" -ForegroundColor Red
    Write-Host "Please download manually from: https://tailscale.com/download/windows" -ForegroundColor Yellow
    exit 1
}

# Run installer
Write-Host "Running Tailscale installer..." -ForegroundColor Yellow

try {
    Start-Process msiexec.exe -ArgumentList "/i", $installerPath, "/quiet", "/qn", "/norestart" -Wait -NoNewWindow
    Write-Host "✓ Tailscale installed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚠ Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Open Tailscale from the Start menu or system tray"
    Write-Host "  2. Log in with your Tailscale account"
    Write-Host "  3. Enable Funnel: tailscale funnel 9090"
    Write-Host "  4. Copy the public URL and add to .env as TUNNEL_URL"
} catch {
    Write-Host "❌ Installation failed: $_" -ForegroundColor Red
    Write-Host "Please install manually: https://tailscale.com/download/windows" -ForegroundColor Yellow
    exit 1
}

# Cleanup
Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue

Write-Host "✓ Tailscale installation complete!" -ForegroundColor Green
