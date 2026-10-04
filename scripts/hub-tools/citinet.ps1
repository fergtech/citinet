# citinet - one command for looking after this hub.
#
# Lives in the hub's own folder (next to docker-compose.yml), so there are no
# paths to remember:   .\citinet.ps1 <command>
#   (if scripts are blocked:  powershell -ExecutionPolicy Bypass -File .\citinet.ps1 <command>)
#
#   status            what is running, and is it healthy
#   diagnose          check everything that commonly goes wrong; says what to run next
#   fix               safe repair: start anything that should be running (never touches data)
#   logs [svc] [-f]   recent logs for one service (or all); -f to follow
#   restart [svc|all] restart a service (default: all)
#   start | stop      start / stop the whole hub
#   update [svc]      update to the latest version: backs up first, can roll back
#   rollback [svc]    go back to the version from before the last update
#   backup-now        take a backup right now
#   restore-test      prove the newest backup can really be restored
#   support-bundle    collect logs + settings (secrets removed) into one zip to send for help
#   info              where things live
#
# Services: api db storage caddy backup admin livekit ollama
# Compatible with Windows PowerShell 5.1 and PowerShell 7.

$ErrorActionPreference = 'Continue'
$HubDir = if ($env:CITINET_HUB_DIR) { $env:CITINET_HUB_DIR } else { $PSScriptRoot }
Set-Location -LiteralPath $HubDir

$Command = if ($args.Count -gt 0) { [string]$args[0] } else { 'help' }
$Rest = @(); if ($args.Count -gt 1) { $Rest = @($args[1..($args.Count - 1)]) }

# -- output helpers ------------------------------------------------------------
function Die($m)   { Write-Host "x $m" -ForegroundColor Red; exit 1 }
function Say($m)   { Write-Host $m }
function Head1($m) { Write-Host ''; Write-Host $m -ForegroundColor White }
$script:Pass = 0; $script:Warn = 0; $script:Fail = 0
function Ok($m)    { $script:Pass++; Write-Host '  ' -NoNewline; Write-Host 'ok' -ForegroundColor Green -NoNewline; Write-Host " $m" }
function Warn2($m, $hint) { $script:Warn++; Write-Host '  ' -NoNewline; Write-Host '!' -ForegroundColor Yellow -NoNewline; Write-Host " $m"; if ($hint) { Write-Host "      -> $hint" -ForegroundColor DarkGray } }
function Bad($m, $hint)   { $script:Fail++; Write-Host '  ' -NoNewline; Write-Host 'x' -ForegroundColor Red -NoNewline; Write-Host " $m"; if ($hint) { Write-Host "      -> $hint" -ForegroundColor DarkGray } }

if (-not (Test-Path -LiteralPath (Join-Path $HubDir 'docker-compose.yml'))) { Die "No docker-compose.yml in $HubDir - run this from your hub's folder." }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Die 'Docker is not installed or not on PATH.' }

$script:UseV1 = $false
$null = docker compose version 2>$null
if ($LASTEXITCODE -ne 0) {
  if (Get-Command docker-compose -ErrorAction SilentlyContinue) { $script:UseV1 = $true } else { Die "Neither 'docker compose' nor 'docker-compose' is available." }
}
function Dc { if ($script:UseV1) { & docker-compose @args } else { & docker compose @args } }

function EnvGet($key) {
  $f = Join-Path $HubDir '.env'
  if (-not (Test-Path -LiteralPath $f)) { return '' }
  $line = Get-Content -LiteralPath $f | Where-Object { $_ -match "^$([regex]::Escape($key))=" } | Select-Object -Last 1
  if ($line) { return ($line -replace "^$([regex]::Escape($key))=", '').Trim() }
  return ''
}
$HubName = EnvGet 'HUB_NAME'
$ApiPort = EnvGet 'API_PORT'; if (-not $ApiPort) { $ApiPort = '9090' }

function Norm($n) { if ($n -like 'citinet-*') { return $n } else { return "citinet-$n" } }
function AllServices { @(Dc config --services 2>$null | Where-Object { $_ } | Sort-Object) }
function HasService($s) { (AllServices) -contains $s }
function Cid($s) { $r = Dc ps -aq $s 2>$null; if ($r) { return ([string]($r | Select-Object -First 1)).Trim() } else { return '' } }
function StateOf($c)  { if (-not $c) { return '' }; ([string](docker inspect -f '{{.State.Status}}' $c 2>$null)).Trim() }
function HealthOf($c) { if (-not $c) { return '' }; ([string](docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' $c 2>$null)).Trim() }
function NeedDocker { $null = docker info 2>$null; if ($LASTEXITCODE -ne 0) { Die "Docker isn't running. Start Docker Desktop and wait for it to say 'running', then try again." } }
function ApiHealth { try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "http://127.0.0.1:$ApiPort/health"; return $r.Content } catch { return $null } }

# -- status ---------------------------------------------------------------------
function Cmd-Status {
  NeedDocker
  $title = if ($HubName) { $HubName } else { 'Hub' }
  Head1 "$title - containers"
  '  {0,-18} {1,-11} {2,-10} {3}' -f 'SERVICE', 'STATE', 'HEALTH', 'SINCE' | Write-Host
  foreach ($s in AllServices) {
    $c = Cid $s
    if (-not $c) { Write-Host ('  {0,-18} ' -f $s) -NoNewline; Write-Host 'not created' -ForegroundColor Red; continue }
    $st = StateOf $c; $h = HealthOf $c
    $since = ([string](docker inspect -f '{{.State.StartedAt}}' $c)).Substring(0, 19).Replace('T', ' ')
    $col = 'Green'; if ($st -ne 'running' -or $h -eq 'unhealthy') { $col = 'Red' }
    Write-Host ('  {0,-18} ' -f $s) -NoNewline; Write-Host ('{0,-11}' -f $st) -ForegroundColor $col -NoNewline
    Write-Host (' {0,-10} {1}' -f $(if ($h) { $h } else { '-' }), $since)
  }
  Head1 'Hub API'
  $out = ApiHealth
  if ($out) { Write-Host "  ok answering on port $ApiPort " -ForegroundColor Green -NoNewline; Write-Host $out.Substring(0, [Math]::Min(80, $out.Length)) -ForegroundColor DarkGray }
  else { Write-Host "  x not answering on port $ApiPort  -> run: .\citinet.ps1 diagnose" -ForegroundColor Red }
}

# -- diagnose -------------------------------------------------------------------
function Cmd-Diagnose {
  NeedDocker
  $script:Pass = 0; $script:Warn = 0; $script:Fail = 0
  Head1 'Settings'
  if (-not (Test-Path -LiteralPath (Join-Path $HubDir '.env'))) { Bad '.env is missing' "Re-run your hub's setup script to recreate it" }
  else {
    $missing = @('DB_PASSWORD', 'JWT_SECRET', 'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY') | Where-Object { -not (EnvGet $_) }
    if (-not $missing) { Ok '.env has its required secrets' } else { Bad (".env has blank values: " + ($missing -join ' ')) 'Blank passwords make services restart forever - restore them from your setup script / password manager' }
  }

  Head1 'Containers'
  foreach ($s in AllServices) {
    $short = $s -replace '^citinet-', ''
    $c = Cid $s
    if (-not $c) { Bad "$s was never created" '.\citinet.ps1 fix'; continue }
    $st = StateOf $c; $h = HealthOf $c
    $rc = [int](docker inspect -f '{{.RestartCount}}' $c); $err = ([string](docker inspect -f '{{.State.Error}}' $c)).Trim(); $code = ([string](docker inspect -f '{{.State.ExitCode}}' $c)).Trim()
    if ($st -eq 'running' -and $h -eq 'unhealthy') { Bad "$s is running but failing its health check" ".\citinet.ps1 logs $short" }
    elseif ($st -eq 'running' -and $rc -ge 5) { Warn2 "$s has restarted $rc times" ".\citinet.ps1 logs $short" }
    elseif ($st -eq 'running') { Ok "$s is running" }
    elseif ($st -eq 'restarting') { Bad "$s is stuck restarting" ".\citinet.ps1 logs $short" }
    else { $extra = ''; if ($err) { $extra = " ($err)" }; Bad "$s is $st$extra - exit code $code" ".\citinet.ps1 fix   (then .\citinet.ps1 logs $short if it keeps stopping)" }
  }

  Head1 'Network'
  if (ApiHealth) { Ok "API answers on port $ApiPort" } else { Bad "API does not answer on port $ApiPort" '.\citinet.ps1 logs api' }
  if ((HasService 'citinet-caddy') -and (StateOf (Cid 'citinet-caddy')) -ne 'running') {
    foreach ($p in 443, 80) {
      $conn = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($conn) {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        Warn2 "Port $p is already in use by $(if ($proc) { $proc.ProcessName } else { "process $($conn.OwningProcess)" })" 'Stop that program (or another hub using this port), then: .\citinet.ps1 fix'
      }
    }
  }

  Head1 'Disk & backups'
  $dataRoot = EnvGet 'FILES_DIR'; if (-not $dataRoot -or -not (Test-Path -LiteralPath $dataRoot)) { $dataRoot = $HubDir }
  try {
    $drive = (Get-Item -LiteralPath $dataRoot).PSDrive
    if ($drive -and $null -ne $drive.Free) {
      $total = $drive.Used + $drive.Free; $usePct = [int](100 * $drive.Used / $total); $freeGb = [int]($drive.Free / 1GB)
      if ($usePct -ge 95) { Bad "Disk is $usePct% full ($freeGb GB free)" 'Free space now - a full disk stops the database and uploads' }
      elseif ($usePct -ge 85) { Warn2 "Disk is $usePct% full ($freeGb GB free)" 'Plan to free space or move the data folder' }
      else { Ok "Disk has room ($usePct% used, $freeGb GB free)" }
    }
  } catch { }
  $bc = Cid 'citinet-backup'
  if ($bc -and (StateOf $bc) -eq 'running') {
    $nAll = [int](([string](Dc exec -T citinet-backup sh -c 'ls /backups/db-*.sql.gz 2>/dev/null | wc -l')).Trim())
    $nNew = [int](([string](Dc exec -T citinet-backup sh -c "find /backups -maxdepth 1 -name 'db-*.sql.gz' -mtime -2 2>/dev/null | wc -l")).Trim())
    if ($nNew -gt 0) { Ok "A database backup exists from the last 2 days ($nAll kept)" }
    elseif ($nAll -gt 0) { Warn2 'Newest database backup is older than 2 days' '.\citinet.ps1 backup-now   (then .\citinet.ps1 logs backup)' }
    else { Warn2 'No database backups found yet' '.\citinet.ps1 backup-now' }
  }
  elseif (HasService 'citinet-backup') { Bad 'Backup service is not running, so nothing is being backed up' '.\citinet.ps1 fix' }
  else { Warn2 'This hub has no backup service' 'Re-run the hub setup script to add one' }
  if (EnvGet 'RESTIC_REPOSITORY') { Ok 'Off-site backup is configured' } else { Warn2 'Off-site backup is not set up' "Local backups can't help if this machine is lost - see Hub Management -> Off-site Backup" }

  Head1 'Summary'
  Write-Host "  $($script:Pass) ok   $($script:Warn) to look at   $($script:Fail) problems"
  if ($script:Fail -gt 0) { Say ''; Say '  Most problems clear with:  .\citinet.ps1 fix'; Say '  Still stuck? Run .\citinet.ps1 support-bundle and send the zip to whoever is helping you.' }
}

# -- fix ------------------------------------------------------------------------
function Cmd-Fix {
  NeedDocker
  Say 'Starting anything that should be running (your data is never touched)...'
  Dc up -d
  Say ''; Cmd-Diagnose
}

# -- logs / restart / start / stop ---------------------------------------------
function Cmd-Logs {
  NeedDocker; $svc = ''; $follow = $false; $n = 150
  for ($i = 0; $i -lt $Rest.Count; $i++) {
    switch ($Rest[$i]) { '-f' { $follow = $true } '--follow' { $follow = $true } '-n' { $i++; $n = $Rest[$i] } default { $svc = Norm $Rest[$i] } }
  }
  if ($svc -and -not (HasService $svc)) { Die "No such service: $svc (try: $(((AllServices) -replace '^citinet-', '') -join ' '))" }
  $a = @('logs', '--tail', "$n"); if ($follow) { $a += '-f' }; if ($svc) { $a += $svc }
  Dc @a
}
function Cmd-Restart {
  NeedDocker; $t = if ($Rest.Count) { $Rest[0] } else { 'all' }
  if ($t -eq 'all') { Say 'Restarting every service...'; Dc restart }
  else { $s = Norm $t; if (-not (HasService $s)) { Die "No such service: $s" }; Say "Restarting $s..."; Dc restart $s }
}
function Cmd-Start { NeedDocker; Dc up -d }
function Cmd-Stop {
  NeedDocker; $a = Read-Host 'Stop the whole hub? Members will be disconnected. [y/N]'
  if ($a -match '^(y|yes)$') { Dc stop } else { Say 'Cancelled.' }
}

# -- backups ---------------------------------------------------------------------
function Do-BackupNow {
  if (-not (HasService 'citinet-backup')) { Say '  (no backup service on this hub)'; return $false }
  Say 'Taking a backup now (the backup service runs one the moment it starts)...'
  $since = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss')
  Dc restart citinet-backup *> $null
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 3
    $out = (Dc logs --since $since citinet-backup 2>&1 | Out-String)
    if ($out -match '\[backup\] db ok') {
      Write-Host '  ok database backup done' -ForegroundColor Green
      if ($out -match 'storage ok') { Write-Host '  ok file backup done' -ForegroundColor Green }
      if ($out -match 'off-site \(restic\) ok') { Write-Host '  ok off-site copy done' -ForegroundColor Green }
      return $true
    }
    if ($out -match '\[backup\] db FAILED') { Write-Host '  x database backup failed:' -ForegroundColor Red; ($out -split "`n" | Select-String -Pattern 'FAILED' -Context 0, 3 | Out-String) | Write-Host; return $false }
  }
  Write-Host '  ! Still running after 3 minutes - check: .\citinet.ps1 logs backup' -ForegroundColor Yellow; return $false
}
function Cmd-BackupNow { NeedDocker; $null = Do-BackupNow }

# Calls the stack sidecar THROUGH citinet-api, which already holds its token. Single quotes
# only + a backslash-escaped space: Windows PowerShell 5.1 mangles embedded double quotes.
function Sidecar-Call($path, [switch]$Post) {
  $cmd = 'wget -qO- --header=x-admin-token:\ $ADMIN_SIDECAR_TOKEN ' + $(if ($Post) { '--post-data=x ' } else { '' }) + "http://citinet-admin:7070$path"
  [string](Dc exec -T citinet-api sh -c $cmd 2>$null)
}
function Cmd-RestoreTest {
  NeedDocker
  if (-not (HasService 'citinet-admin')) { Die 'This hub has no citinet-admin service - run: .\citinet.ps1 update admin' }
  Say 'Starting a restore test (loads the newest backup into a throwaway database)...'
  $r = Sidecar-Call '/drill' -Post
  if ($r -notmatch 'started') {
    if ($r -match 'already running') { Say '  One is already running - waiting for it.' }
    else { Die "Could not start it: $(if ($r) { $r } else { 'no answer from citinet-admin' }). Is it up to date? Try: .\citinet.ps1 update admin" }
  }
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 4
    $h = Sidecar-Call '/health'; if (-not $h) { continue }
    try { $d = ($h | ConvertFrom-Json).backups.drill } catch { continue }
    if ($d.running -or -not $d.lastRunAt) { continue }
    foreach ($x in $d.results) {
      if ($x.ok) { Write-Host ("  ok {0}: restored ({1} tables, {2} accounts)" -f $x.source, $x.tables, $x.users) -ForegroundColor Green }
      else { Write-Host ("  x {0}: {1}" -f $x.source, $x.detail) -ForegroundColor Red }
    }
    if ($d.ok) { Write-Host 'ok Backups restore correctly.' -ForegroundColor Green } else { Write-Host 'x A restore failed - details above.' -ForegroundColor Red }
    return
  }
  Say 'Taking longer than expected - see Hub Management -> System for the result.'
}

# -- update / rollback ------------------------------------------------------------
$DefaultUpdate = @('citinet-api', 'citinet-admin')
function ImgOf($svc) {
  $lines = @(Dc config 2>$null); $in = $false
  foreach ($l in $lines) {
    if ($l -match '^  ([A-Za-z0-9_.-]+):\s*$') { $in = ($Matches[1] -eq $svc); continue }
    if ($in -and $l -match '^\s{4}image:\s*(\S+)') { return $Matches[1] }
  }
  return ''
}
function LocalId($img) { ([string](docker image inspect -f '{{.Id}}' $img 2>$null)).Trim() }
function Wait-Healthy($svc, $seconds) {
  $c = Cid $svc; $end = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $end) {
    $st = StateOf $c; $h = HealthOf $c
    if ($st -eq 'running' -and (-not $h -or $h -eq 'healthy')) { Start-Sleep -Seconds 2; if ((StateOf $c) -eq 'running') { return $true } }
    Start-Sleep -Seconds 3
  }
  return $false
}
function RollbackTags($repo) { @(docker images --format '{{.Repository}}:{{.Tag}}' 2>$null | Where-Object { $_ -like "${repo}:rollback-*" } | Sort-Object -Descending) }

function Cmd-Update {
  NeedDocker; $dry = $false; $targets = @()
  foreach ($a in $Rest) { if ($a -eq '--dry-run') { $dry = $true } else { $targets += (Norm $a) } }
  if (-not $targets) { $targets = $DefaultUpdate }
  $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
  Head1 'Update plan'
  $plan = @()
  foreach ($s in $targets) {
    if (-not (HasService $s)) { Say "  - ${s}: not part of this hub, skipping"; continue }
    $img = ImgOf $s; if (-not $img) { Say "  - ${s}: no image to pull, skipping"; continue }
    Say "  - $s  ($img)"; $plan += $s
  }
  if (-not $plan) { Die 'Nothing to update.' }
  if ($dry) { Say ''; Say 'Dry run - nothing was changed.'; return }

  Head1 '1/4  Backing up first'
  if (-not (Do-BackupNow)) { $a = Read-Host '  Backup did not finish cleanly. Continue the update anyway? [y/N]'; if ($a -notmatch '^(y|yes)$') { Die 'Update cancelled - nothing changed.' } }

  Head1 '2/4  Saving the current version (so you can roll back)'
  foreach ($s in $plan) { $img = ImgOf $s; $repo = ($img -replace ':[^:/]+$', ''); if (LocalId $img) { docker tag $img "${repo}:rollback-$ts"; Say "  saved ${repo}:rollback-$ts" } }

  Head1 '3/4  Downloading the new version'
  $changed = @()
  foreach ($s in $plan) {
    $img = ImgOf $s; $before = LocalId $img
    Dc pull $s
    if ($before -eq (LocalId $img)) { Say "  $s is already the latest" } else { $changed += $s }
  }
  if (-not $changed) { Say ''; Write-Host 'Everything is already up to date.' -ForegroundColor Green; return }

  Head1 '4/4  Restarting the updated services'
  foreach ($s in $changed) { Dc up -d --no-deps $s }
  $failed = @()
  foreach ($s in $changed) {
    if (Wait-Healthy $s 120) { Write-Host "  ok $s is healthy" -ForegroundColor Green } else { Write-Host "  x $s did not become healthy" -ForegroundColor Red; $failed += $s }
  }
  if ($failed) {
    Say ''; Write-Host 'The new version did not start properly - going back to the previous one.' -ForegroundColor Red
    $script:Rest = @($failed | ForEach-Object { $_ -replace '^citinet-', '' }); Cmd-Rollback; exit 1
  }
  Say ''; Write-Host "ok Updated: $($changed -join ' ')" -ForegroundColor Green
  foreach ($s in $changed) { $img = ImgOf $s; $repo = ($img -replace ':[^:/]+$', ''); RollbackTags $repo | Select-Object -Skip 3 | ForEach-Object { docker rmi $_ *> $null } }
}

function Cmd-Rollback {
  NeedDocker; $targets = @($Rest | ForEach-Object { Norm $_ }); if (-not $targets) { $targets = $DefaultUpdate }
  foreach ($s in $targets) {
    if (-not (HasService $s)) { continue }
    $img = ImgOf $s; $repo = ($img -replace ':[^:/]+$', ''); $prev = RollbackTags $repo | Select-Object -First 1
    if (-not $prev) { Write-Host "  ! ${s}: no saved previous version to go back to" -ForegroundColor Yellow; continue }
    docker tag $prev $img; Dc up -d --no-deps --force-recreate $s
    if (Wait-Healthy $s 120) { Write-Host "  ok $s is back on $prev" -ForegroundColor Green } else { Write-Host "  x $s still unhealthy after rollback - run: .\citinet.ps1 logs $($s -replace '^citinet-', '')" -ForegroundColor Red }
  }
}

# -- support bundle ----------------------------------------------------------------
function Redact([string[]]$lines) {
  $lines | ForEach-Object {
    $l = $_
    $l = [regex]::Replace($l, '((PASS(WORD)?|SECRET|TOKEN|KEY|CERT_SECRET|REPOSITORY|SMTP_[A-Z]*|ACCESS_KEY_ID|USERNAME)[A-Z_]*=).*', '$1***removed***', 'IgnoreCase')
    $l = [regex]::Replace($l, '(Bearer )[A-Za-z0-9._~+/=-]+', '$1***removed***')
    $l = [regex]::Replace($l, '("(password|pass|token|secret|authorization)"\s*:\s*")[^"]*', '$1***removed***', 'IgnoreCase')
    $l
  }
}
function Cmd-SupportBundle {
  NeedDocker; $name = 'citinet-support-' + (Get-Date -Format 'yyyyMMdd-HHmmss'); $out = Join-Path $HubDir $name
  New-Item -ItemType Directory -Path $out | Out-Null
  Say 'Collecting information (secrets are removed)...'
  @("Hub: $HubName ($(EnvGet 'HUB_SLUG'))", (Get-Date).ToUniversalTime().ToString('o'), [System.Environment]::OSVersion.VersionString, ([string](docker version --format 'Docker {{.Server.Version}}' 2>$null))) | Set-Content -LiteralPath (Join-Path $out 'system.txt')
  (Cmd-Status 6>&1 | Out-String) | Set-Content -LiteralPath (Join-Path $out 'status.txt')
  (Cmd-Diagnose 6>&1 | Out-String) | Set-Content -LiteralPath (Join-Path $out 'diagnose.txt')
  if (Test-Path -LiteralPath (Join-Path $HubDir '.env')) { Redact (Get-Content -LiteralPath (Join-Path $HubDir '.env')) | Set-Content -LiteralPath (Join-Path $out 'env-redacted.txt') }
  Redact (Get-Content -LiteralPath (Join-Path $HubDir 'docker-compose.yml')) | Set-Content -LiteralPath (Join-Path $out 'docker-compose-redacted.yml')
  foreach ($s in AllServices) {
    # WriteAllLines (not Set-Content): an empty log must still produce a file, like the bash version.
    $logLines = [string[]]@(Redact (@(Dc logs --tail 300 $s 2>&1 | ForEach-Object { "$_" })))
    [System.IO.File]::WriteAllLines((Join-Path $out ('log-' + ($s -replace '^citinet-', '') + '.txt')), $logLines)
  }
  Compress-Archive -Path $out -DestinationPath "$out.zip" -Force; Remove-Item -Recurse -Force $out
  Write-Host "ok Created $name.zip" -ForegroundColor Green
  Say '  Passwords, keys and tokens were removed, but skim it before sharing publicly.'
}

# -- info --------------------------------------------------------------------------
function Cmd-Info {
  Head1 $(if ($HubName) { $HubName } else { 'Hub' })
  Say "  Folder:        $HubDir"
  Say "  Address:       $(EnvGet 'TUNNEL_URL')"
  Say "  Local API:     http://127.0.0.1:$ApiPort"
  Say "  Files:         $(EnvGet 'FILES_DIR')"
  Say "  Off-site:      $(if (EnvGet 'RESTIC_REPOSITORY') { 'configured' } else { 'not set up' })"
}
function Cmd-Help { Get-Content -LiteralPath $PSCommandPath | Select-Object -First 22 | ForEach-Object { $_ -replace '^# ?', '' } }

switch ($Command) {
  'status'         { Cmd-Status }
  { $_ -in 'diagnose', 'doctor', 'check' } { Cmd-Diagnose }
  { $_ -in 'fix', 'repair' }               { Cmd-Fix }
  'logs'           { Cmd-Logs }
  'restart'        { Cmd-Restart }
  { $_ -in 'start', 'up' }                 { Cmd-Start }
  { $_ -in 'stop', 'down' }                { Cmd-Stop }
  { $_ -in 'update', 'upgrade' }           { Cmd-Update }
  'rollback'       { Cmd-Rollback }
  { $_ -in 'backup-now', 'backup' }        { Cmd-BackupNow }
  'restore-test'   { Cmd-RestoreTest }
  { $_ -in 'support-bundle', 'bundle' }    { Cmd-SupportBundle }
  'info'           { Cmd-Info }
  { $_ -in 'help', '-h', '--help' }        { Cmd-Help }
  default          { Write-Host "Unknown command: $Command"; Write-Host ''; Cmd-Help; exit 1 }
}
