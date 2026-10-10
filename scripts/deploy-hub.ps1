<#
.SYNOPSIS
  Build, publish and roll out the Citinet hub images to a hub on THIS machine.

.DESCRIPTION
  A hub runs two images of ours - citinet-api (the app + API) and citinet-admin
  (the stack sidecar: self-healing, backup checks, restore tests). They are built
  from different folders and are easy to deploy one without the other, which leaves
  the hub half-updated (e.g. a new API asking an old sidecar for routes it lacks).
  So the default is BOTH, and the script verifies afterwards that each running
  container really is on the image just built.

  For each service: save the current image as a rollback tag -> build -> push ->
  pull -> recreate -> wait for health -> confirm the container runs the new image.
  Roll back any time with:  .\citinet.ps1 rollback   (in the hub's folder)

.PARAMETER Service   api | admin | all   (default: all)
.PARAMETER ComposeFile  the hub's docker-compose.yml (default: ~\citinet-hub\docker-compose.yml)
.PARAMETER NoPush    local-only: skip push + pull, just build and recreate from the local image
.PARAMETER DryRun    print what would happen, change nothing

.EXAMPLE
  .\scripts\deploy-hub.ps1                  # both images (recommended)
  .\scripts\deploy-hub.ps1 -Service api     # only the API
  .\scripts\deploy-hub.ps1 -NoPush          # try it locally without publishing
#>
param(
    [ValidateSet('api', 'admin', 'all')][string]$Service = 'all',
    [string]$ComposeFile = (Join-Path $env:USERPROFILE 'citinet-hub\docker-compose.yml'),
    [switch]$NoPush,
    [switch]$DryRun
)

# 'Continue', not 'Stop': Windows PowerShell 5.1 turns ANY stderr output from a native command
# (docker prints warnings there) into a terminating error once it is redirected. Failures are
# caught explicitly instead, via each command's exit code (see Run).
$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent $PSScriptRoot

# service name in the hub's compose file -> how to build it
$targets = @{
    api   = @{ Compose = 'citinet-api';   Image = 'ghcr.io/fergtech/citinet-api:latest';   Context = '.';             Dockerfile = 'api/Dockerfile';           Watch = @('api/', 'src/', 'public/', 'package.json', 'index.html', 'vite.config.ts') }
    admin = @{ Compose = 'citinet-admin'; Image = 'ghcr.io/fergtech/citinet-admin:latest'; Context = 'admin-sidecar'; Dockerfile = 'admin-sidecar/Dockerfile'; Watch = @('admin-sidecar/') }
}
$selected = if ($Service -eq 'all') { @('api', 'admin') } else { @($Service) }

function Step($m) { Write-Host ''; Write-Host "== $m" -ForegroundColor Cyan }
function Run([string]$what, [scriptblock]$cmd) {
    & $cmd
    if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)." }
}
# "$(...)" not [string](...): in Windows PowerShell 5.1 a [string] cast of empty command output
# yields $null, and .Trim() on that throws.
function ImageId($ref) { "$(docker image inspect -f '{{.Id}}' $ref 2>$null)".Trim() }
function ContainerImageId($svc) {
    $cid = "$(docker compose -f $ComposeFile ps -q $svc 2>$null)".Trim()
    if (-not $cid) { return '' }
    "$(docker inspect -f '{{.Image}}' $cid 2>$null)".Trim()
}
function ContainerHealthy($svc) {
    $cid = "$(docker compose -f $ComposeFile ps -q $svc 2>$null)".Trim()
    if (-not $cid) { return $false }
    $st = "$(docker inspect -f '{{.State.Status}}' $cid)".Trim()
    $h  = "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' $cid)".Trim()
    return ($st -eq 'running' -and (-not $h -or $h -eq 'healthy'))
}

if (-not (Test-Path -LiteralPath $ComposeFile -PathType Leaf)) { Write-Error "Docker Compose file not found: $ComposeFile"; exit 1 }
$null = docker info 2>$null
if ($LASTEXITCODE -ne 0) { Write-Error "Docker isn't running. Start Docker Desktop first."; exit 1 }

# Pre-flight: compose can publish the API on this machine's LAN / Tailscale address (${LAN_IP},
# ${TAILSCALE_IP} from the hub's .env). If that address is no longer on this machine - e.g. you
# moved from Ethernet to Wi-Fi, or Tailscale is logged out - Docker can't bind it and the API
# container never starts. Catch that up front with a plain-English message instead.
$envFile = Join-Path (Split-Path -Parent $ComposeFile) '.env'
if (Test-Path -LiteralPath $envFile -PathType Leaf) {
    $envText = [System.IO.File]::ReadAllText($envFile)
    $composeText = [System.IO.File]::ReadAllText($ComposeFile)
    $localIps = @()
    try { $localIps = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | ForEach-Object { $_.IPAddress }) } catch {}
    if ($localIps.Count -gt 0) {
        $addrProblem = $false
        foreach ($name in 'LAN_IP', 'TAILSCALE_IP') {
            $m = [regex]::Match($envText, "(?m)^$name=(.+?)\s*$")
            if (-not $m.Success) { continue }
            $val = $m.Groups[1].Value.Trim().Trim('"').Trim("'")
            if (-not $val -or $localIps -contains $val) { continue }
            $bound = $composeText -match ('\$\{' + $name + '\}:')   # published in a ports: entry => fatal if missing
            $others = ($localIps | Where-Object { $_ -notlike '127.*' -and $_ -notlike '169.254.*' }) -join ', '
            $hint = if ($name -eq 'TAILSCALE_IP') { "Is Tailscale logged in? (run: tailscale ip -4)" } else { "Check your current address (Windows: ipconfig, Mac/Linux: ip addr or ifconfig), then set $name in $envFile." }
            if ($bound) {
                Write-Host "x $name=$val (in $envFile) is not an address on this machine, and docker-compose.yml publishes the API on it." -ForegroundColor Red
                Write-Host "  Addresses present now: $others" -ForegroundColor Red
                Write-Host "  $hint" -ForegroundColor Red
                $addrProblem = $true
            } else {
                Write-Host "!  $name=$val (in $envFile) is not an address on this machine. Not fatal here, but anything using it is stale." -ForegroundColor Yellow
                Write-Host "   Addresses present now: $others. $hint" -ForegroundColor Yellow
            }
        }
        if ($addrProblem -and -not $DryRun) { Write-Host '  Fix that, then re-run this script.' -ForegroundColor Red; exit 1 }
    }
}

Push-Location $repoRoot
try {
    # Heads-up when you deploy one image but changed files that belong to the other.
    if ($selected.Count -lt $targets.Count) {
        $changed = @(git status --porcelain 2>$null | ForEach-Object { $_.Substring(3) })
        foreach ($other in ($targets.Keys | Where-Object { $selected -notcontains $_ })) {
            $hits = @($changed | Where-Object { $p = $_; $targets[$other].Watch | Where-Object { $p -like "$_*" } })
            if ($hits.Count -gt 0) {
                Write-Host ''
                Write-Host "!  You are not deploying '$other', but $($hits.Count) changed file(s) belong to it (e.g. $($hits[0]))." -ForegroundColor Yellow
                Write-Host "   Run with -Service all (or -Service $other) so the hub isn't left half-updated." -ForegroundColor Yellow
            }
        }
    }

    $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
    $summary = @()
    foreach ($key in $selected) {
        $t = $targets[$key]; $repo = ($t.Image -replace ':[^:/]+$', '')
        Step "$key  ($($t.Image))"
        if ($DryRun) { Write-Host "   would: save rollback tag, build ($($t.Dockerfile)), $(if ($NoPush) { 'skip push/pull' } else { 'push, pull' }), recreate $($t.Compose), verify"; continue }

        $beforeContainer = ContainerImageId $t.Compose
        if (ImageId $t.Image) { Run 'tag rollback' { docker tag $t.Image "${repo}:rollback-$ts" }; Write-Host "   saved ${repo}:rollback-$ts" }

        Write-Host '   building...'
        Run "docker build ($key)" { docker build -t $t.Image -f $t.Dockerfile $t.Context }
        $built = ImageId $t.Image

        if (-not $NoPush) {
            Write-Host '   pushing...'
            Run "docker push ($key)" { docker push $t.Image }
            Run "compose pull ($key)" { docker compose -f $ComposeFile pull $t.Compose }
        }

        Write-Host '   recreating...'
        Run "compose up ($key)" { docker compose -f $ComposeFile up -d --force-recreate --no-deps $t.Compose }

        # Verify - don't just trust that the commands ran.
        $deadline = (Get-Date).AddSeconds(120); $healthy = $false
        while ((Get-Date) -lt $deadline) { if (ContainerHealthy $t.Compose) { Start-Sleep 2; if (ContainerHealthy $t.Compose) { $healthy = $true; break } }; Start-Sleep 3 }
        $running = ContainerImageId $t.Compose
        $onNew = ($running -eq $built)
        $summary += [pscustomobject]@{ Service = $key; Healthy = $healthy; RunningNewImage = $onNew; Image = $built.Substring(7, 12) }
        if (-not $healthy) { Write-Host "   x $key did not become healthy - roll back with:  .\citinet.ps1 rollback $key  (in the hub folder)" -ForegroundColor Red }
        elseif (-not $onNew) { Write-Host "   x $key is healthy but NOT running the image just built (container: $($running.Substring(7,12)), built: $($built.Substring(7,12)))." -ForegroundColor Red }
        else { Write-Host "   ok $key is healthy and running the new image ($($built.Substring(7, 12)))" -ForegroundColor Green }
    }

    if ($summary.Count -gt 0) {
        Step 'Result'
        $summary | Format-Table -AutoSize | Out-String | Write-Host
        if ($summary | Where-Object { -not $_.Healthy -or -not $_.RunningNewImage }) { exit 1 }
    }
}
catch { Write-Error $_; exit 1 }
finally { Pop-Location }
