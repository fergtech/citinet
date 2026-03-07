/**
 * Citinet Hub Setup Script Generator
 *
 * Generates a fully pre-configured, OS-specific setup script from wizard data.
 * The hub creator downloads one script, runs one command, and the script handles
 * everything: Docker install check, Tailscale auth, writing all config, launching
 * the stack, and reporting back once the hub is live.
 */

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface HubSecrets {
  jwtSecret: string;
  dbPassword: string;
  storageAccessKey: string;
  storageSecretKey: string;
  redisPassword: string;
}

export interface HubScriptConfig {
  hubName: string;
  hubSlug: string;
  hubLocation: string;
  hubDescription: string;
  visibility: 'local' | 'tailscale';
  tailscaleAuthKey?: string;
  adminUsername: string;
  adminPassword: string;
  secrets: HubSecrets;
  generatedAt: string;
  /** Custom directory for Docker bind mounts (Postgres, MinIO, Redis data).
   *  If omitted, Docker-managed named volumes are used instead. */
  dataDir?: string;
}

// ─────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────

/** Generates a cryptographically secure random hex string. */
export function generateSecret(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Generates all hub secrets at once. */
export function generateSecrets(): HubSecrets {
  return {
    jwtSecret: generateSecret(48),        // 96-char hex
    dbPassword: generateSecret(24),       // 48-char hex
    storageAccessKey: generateSecret(16), // 32-char hex
    storageSecretKey: generateSecret(32), // 64-char hex
    redisPassword: generateSecret(20),    // 40-char hex
  };
}

/** Detects the current OS from the browser user-agent. */
export function detectOS(): 'windows' | 'mac' | 'linux' {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'mac';
  return 'linux';
}

/** Converts a hub name to a URL-safe slug. */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─────────────────────────────────────────────────────────
// .env content (fully filled — no "changeme" placeholders)
// ─────────────────────────────────────────────────────────

function generateEnvContent(config: HubScriptConfig): string {
  return [
    '# Citinet Hub -- ' + config.hubName,
    '# Generated: ' + config.generatedAt,
    '',
    '# Hub Identity',
    'HUB_NAME=' + config.hubName,
    'HUB_SLUG=' + config.hubSlug,
    'HUB_LOCATION=' + config.hubLocation,
    'HUB_DESCRIPTION=' + config.hubDescription,
    'HUB_VISIBILITY=' + config.visibility,
    'API_PORT=9090',
    '',
    '# Admin Account (first-run setup)',
    'ADMIN_USERNAME=' + config.adminUsername,
    'ADMIN_PASSWORD=' + config.adminPassword,
    '',
    '# Database',
    'DB_PASSWORD=' + config.secrets.dbPassword,
    '',
    '# Storage (MinIO)',
    'STORAGE_ACCESS_KEY=' + config.secrets.storageAccessKey,
    'STORAGE_SECRET_KEY=' + config.secrets.storageSecretKey,
    'STORAGE_BUCKET=hub-files',
    '',
    '# Redis',
    'REDIS_PASSWORD=' + config.secrets.redisPassword,
    '',
    '# Security',
    'JWT_SECRET=' + config.secrets.jwtSecret,
    '',
    '# CORS',
    'CORS_ORIGIN=*',
    '',
    '# Tunnel URL -- auto-filled by setup script if using Tailscale',
    'TUNNEL_URL=',
    '',
    '# Registry -- leave empty for local/private hubs',
    'REGISTRY_URL=',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────
// docker-compose.yml (production — published image, no local mounts)
//
// Note: every ${VAR} reference is a literal for docker-compose to read from
// the .env file at runtime. They appear as literal text in the output string
// because they use string concatenation, not TypeScript template interpolation.
// ─────────────────────────────────────────────────────────

function getComposeYaml(dataDir?: string): string {
  // Build the YAML using string concatenation so ${VAR} references are
  // literal in the output and not interpreted by TypeScript.
  const v = (name: string) => '${' + name + '}';
  const vd = (name: string, def: string) => '${' + name + ':-' + def + '}';

  // When a custom data directory is specified, use bind mounts so data lands
  // on the user's chosen drive. Otherwise fall back to Docker-managed named volumes.
  const toComposePath = (sub: string) =>
    dataDir ? dataDir.replace(/\\/g, '/') + '/' + sub : null;
  const dbVol      = toComposePath('db')      ?? 'citinet-db-data';
  const storageVol = toComposePath('storage') ?? 'citinet-storage-data';
  const redisVol   = toComposePath('redis')   ?? 'citinet-redis-data';

  return [
    'services:',
    '',
    '  citinet-api:',
    '    image: ghcr.io/fergtech/citinet-api:latest',
    '    container_name: citinet-api',
    '    restart: unless-stopped',
    '    ports:',
    '      - "' + vd('API_PORT', '9090') + ':9090"',
    '    environment:',
    '      - NODE_ENV=production',
    '      - PORT=9090',
    '      - HUB_NAME=' + v('HUB_NAME'),
    '      - HUB_SLUG=' + v('HUB_SLUG'),
    '      - HUB_LOCATION=' + v('HUB_LOCATION'),
    '      - HUB_DESCRIPTION=' + v('HUB_DESCRIPTION'),
    '      - HUB_VISIBILITY=' + vd('HUB_VISIBILITY', 'local'),
    '      - DATABASE_URL=postgresql://citinet:' + v('DB_PASSWORD') + '@citinet-db:5432/citinet',
    '      - STORAGE_URL=http://citinet-storage:9000',
    '      - STORAGE_ACCESS_KEY=' + v('STORAGE_ACCESS_KEY'),
    '      - STORAGE_SECRET_KEY=' + v('STORAGE_SECRET_KEY'),
    '      - STORAGE_BUCKET=' + vd('STORAGE_BUCKET', 'hub-files'),
    '      - REDIS_URL=redis://:' + v('REDIS_PASSWORD') + '@citinet-redis:6379',
    '      - JWT_SECRET=' + v('JWT_SECRET'),
    '      - CORS_ORIGIN=' + vd('CORS_ORIGIN', '*'),
    '      - REGISTRY_URL=' + vd('REGISTRY_URL', ''),
    '      - TUNNEL_URL=' + vd('TUNNEL_URL', ''),
    '      - ADMIN_USERNAME=' + v('ADMIN_USERNAME'),
    '      - ADMIN_PASSWORD=' + v('ADMIN_PASSWORD'),
    '    depends_on:',
    '      citinet-db:',
    '        condition: service_healthy',
    '      citinet-storage:',
    '        condition: service_healthy',
    '      citinet-redis:',
    '        condition: service_started',
    '    healthcheck:',
    '      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:9090/health"]',
    '      interval: 30s',
    '      timeout: 10s',
    '      retries: 3',
    '      start_period: 60s',
    '    networks:',
    '      - citinet-network',
    '',
    '  citinet-db:',
    '    image: postgres:16-alpine',
    '    container_name: citinet-db',
    '    restart: unless-stopped',
    '    environment:',
    '      - POSTGRES_DB=citinet',
    '      - POSTGRES_USER=citinet',
    '      - POSTGRES_PASSWORD=' + v('DB_PASSWORD'),
    '      - PGDATA=/var/lib/postgresql/data/pgdata',
    '    volumes:',
    '      - ' + dbVol + ':/var/lib/postgresql/data',
    '    healthcheck:',
    '      test: ["CMD-SHELL", "pg_isready -U citinet -d citinet"]',
    '      interval: 10s',
    '      timeout: 5s',
    '      retries: 5',
    '      start_period: 10s',
    '    networks:',
    '      - citinet-network',
    '',
    '  citinet-storage:',
    '    image: minio/minio:latest',
    '    container_name: citinet-storage',
    '    restart: unless-stopped',
    '    command: server /data --console-address ":9001"',
    '    environment:',
    '      - MINIO_ROOT_USER=' + v('STORAGE_ACCESS_KEY'),
    '      - MINIO_ROOT_PASSWORD=' + v('STORAGE_SECRET_KEY'),
    '    volumes:',
    '      - ' + storageVol + ':/data',
    '    ports:',
    '      - "127.0.0.1:9001:9001"',
    '    healthcheck:',
    '      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]',
    '      interval: 30s',
    '      timeout: 20s',
    '      retries: 3',
    '      start_period: 20s',
    '    networks:',
    '      - citinet-network',
    '',
    '  citinet-redis:',
    '    image: redis:7-alpine',
    '    container_name: citinet-redis',
    '    restart: unless-stopped',
    '    command: redis-server --appendonly yes --requirepass ' + v('REDIS_PASSWORD'),
    '    volumes:',
    '      - ' + redisVol + ':/data',
    '    healthcheck:',
    '      test: ["CMD", "redis-cli", "-a", "' + v('REDIS_PASSWORD') + '", "ping"]',
    '      interval: 10s',
    '      timeout: 5s',
    '      retries: 3',
    '    networks:',
    '      - citinet-network',
    '',
    'networks:',
    '  citinet-network:',
    '    driver: bridge',
    '',
    ...(dataDir ? [] : [
      'volumes:',
      '  citinet-db-data:',
      '  citinet-storage-data:',
      '  citinet-redis-data:',
    ]),
  ].join('\n');
}

// ─────────────────────────────────────────────────────────
// Bash script (macOS + Linux)
//
// Uses array-join to avoid TypeScript template literal conflicts
// with bash ${VAR} syntax. All bash variable references that use
// braces are written as string concatenation: '${' + 'VAR' + '}'
// ─────────────────────────────────────────────────────────

function buildBashTailscaleSection(config: HubScriptConfig): string[] {
  const tsKey = config.tailscaleAuthKey ?? '';
  return [
    '',
    '# === Tailscale (public access) ===',
    'step "Setting up Tailscale"',
    'if ! command -v tailscale >/dev/null 2>&1; then',
    '  warn "Tailscale not found -- installing..."',
    '  if [ "$OS_TYPE" = "macos" ]; then',
    '    if command -v brew >/dev/null 2>&1; then',
    '      brew install tailscale',
    '    else',
    '      err "Homebrew not found. Install Tailscale from https://tailscale.com/download/macos then re-run."',
    '    fi',
    '  elif [ "$OS_TYPE" = "linux" ]; then',
    '    curl -fsSL https://tailscale.com/install.sh | sh',
    '  fi',
    '  ok "Tailscale installed"',
    'fi',
    '',
    '# Authenticate with auth key -- no browser login needed',
    'ok "Authenticating with Tailscale..."',
    'if [ "$OS_TYPE" = "linux" ]; then',
    '  sudo tailscale up --authkey="' + tsKey + '" --accept-routes --hostname="' + config.hubSlug + '"',
    'else',
    '  tailscale up --authkey="' + tsKey + '" --accept-routes --hostname="' + config.hubSlug + '"',
    'fi',
    'ok "Tailscale connected"',
    '',
    '# Enable Funnel -- makes hub reachable worldwide at your Tailscale HTTPS URL',
    'ok "Enabling Tailscale Funnel on port 9090..."',
    'if [ "$OS_TYPE" = "linux" ]; then',
    '  sudo tailscale funnel 9090',
    'else',
    '  tailscale funnel 9090',
    'fi',
    'ok "Funnel active"',
    '',
    '# Capture the public URL and write it back to .env',
    'TSNAME=$(tailscale status --json 2>/dev/null \\',
    '  | grep -o \'"DNSName":"[^"]*"\' \\',
    '  | head -1 | cut -d\'"\' -f4 | sed \'s/\\.//\' || echo "")',
    'if [ -n "$TSNAME" ]; then',
    '  TUNNEL_URL="https://$TSNAME"',
    '  if [ "$OS_TYPE" = "macos" ]; then',
    '    sed -i \'\' "s|^TUNNEL_URL=.*|TUNNEL_URL=$TUNNEL_URL|" "$HUB_DIR/.env"',
    '  else',
    '    sed -i "s|^TUNNEL_URL=.*|TUNNEL_URL=$TUNNEL_URL|" "$HUB_DIR/.env"',
    '  fi',
    '  ok "Tunnel URL: $TUNNEL_URL"',
    'fi',
  ];
}

function generateBashScript(config: HubScriptConfig): string {
  const envContent = generateEnvContent(config);
  const composeYaml = getComposeYaml(config.dataDir);
  const isTailscale = config.visibility === 'tailscale';

  const tailscaleLines = isTailscale
    ? buildBashTailscaleSection(config)
    : ['', '# Access mode: local network only'];

  const lines = [
    '#!/usr/bin/env bash',
    '# ============================================================',
    '# Citinet Hub Setup -- ' + config.hubName,
    '# Generated: ' + config.generatedAt,
    '# Run: bash citinet-setup.sh',
    '# ============================================================',
    '',
    'set -euo pipefail',
    '',
    'HUB_DIR="$HOME/citinet-hub"',
    '',
    'ok()   { echo "  [ok] $1"; }',
    'warn() { echo "  [!!] $1"; }',
    'err()  { echo "  [ERROR] $1" >&2; exit 1; }',
    'step() { echo ""; echo "=== $1 ==="; }',
    '',
    'echo ""',
    'echo "  Citinet Hub Setup -- ' + config.hubName + '"',
    'echo "  This script will install dependencies, configure, and launch your hub."',
    'echo ""',
    '',
    '# === Detect OS ===',
    'step "Detecting system"',
    'OS_TYPE=""',
    'if [ "$(uname)" = "Darwin" ]; then',
    '  OS_TYPE="macos"',
    '  ok "macOS detected"',
    'elif [ "$(uname)" = "Linux" ]; then',
    '  OS_TYPE="linux"',
    '  ok "Linux detected"',
    'else',
    '  err "Unsupported OS: $(uname). This script supports macOS and Linux."',
    'fi',
    '',
    '# === Create hub directory ===',
    'step "Creating hub directory"',
    'mkdir -p "$HUB_DIR"',
    'ok "Directory: $HUB_DIR"',
    ...(config.dataDir ? [
      '',
      '# === Create data directories (bind-mount targets) ===',
      'DATA_DIR="' + config.dataDir + '"',
      'mkdir -p "$DATA_DIR/db" "$DATA_DIR/storage" "$DATA_DIR/redis"',
      'ok "Data directories: $DATA_DIR"',
    ] : []),
    '',
    '# === Write .env (all values pre-configured) ===',
    'step "Writing configuration"',
    "cat > \"$HUB_DIR/.env\" << 'CITINET_ENV_END'",
    envContent,
    'CITINET_ENV_END',
    'ok ".env written"',
    '',
    '# === Write docker-compose.yml ===',
    "cat > \"$HUB_DIR/docker-compose.yml\" << 'CITINET_COMPOSE_END'",
    composeYaml,
    'CITINET_COMPOSE_END',
    'ok "docker-compose.yml written"',
    '',
    '# === Check / install Docker ===',
    'step "Checking Docker"',
    'if command -v docker >/dev/null 2>&1; then',
    '  # Docker is installed — check if the daemon is actually responding',
    '  if docker info >/dev/null 2>&1; then',
    '    DOCKER_VER=$(docker --version | grep -oE \'[0-9]+\\.[0-9]+\\.[0-9]+\' | head -1)',
    '    ok "Docker $DOCKER_VER is running"',
    '  else',
    '    warn "Docker is installed but not running -- attempting to start it..."',
    '    if [ "$OS_TYPE" = "macos" ]; then',
    '      # Launch Docker Desktop app on macOS',
    '      open -a Docker 2>/dev/null || true',
    '      ok "Docker Desktop launched -- waiting up to 2 minutes for it to be ready..."',
    '      N=0',
    '      while [ $N -lt 40 ]; do',
    '        if docker info >/dev/null 2>&1; then break; fi',
    '        N=$((N + 1))',
    '        printf "  %ds elapsed...\\r" "$((N * 3))"',
    '        sleep 3',
    '      done',
    '      echo ""',
    '      if ! docker info >/dev/null 2>&1; then',
    '        err "Docker Desktop did not become ready in time. Make sure the whale icon in your menu bar has stopped animating, then re-run this script."',
    '      fi',
    '    elif [ "$OS_TYPE" = "linux" ]; then',
    '      sudo systemctl start docker 2>/dev/null || true',
    '      N=0',
    '      while [ $N -lt 10 ]; do',
    '        if docker info >/dev/null 2>&1; then break; fi',
    '        N=$((N + 1))',
    '        sleep 2',
    '      done',
    '      if ! docker info >/dev/null 2>&1; then',
    '        err "Docker daemon did not start. Run: sudo systemctl start docker -- then re-run this script."',
    '      fi',
    '    fi',
    '    DOCKER_VER=$(docker --version | grep -oE \'[0-9]+\\.[0-9]+\\.[0-9]+\' | head -1)',
    '    ok "Docker $DOCKER_VER is running"',
    '  fi',
    'else',
    '  # Docker is not installed at all',
    '  warn "Docker not found -- installing..."',
    '  if [ "$OS_TYPE" = "macos" ]; then',
    '    if command -v brew >/dev/null 2>&1; then',
    '      brew install --cask docker',
    '      ok "Docker Desktop installed via Homebrew"',
    '      open -a Docker 2>/dev/null || true',
    '      ok "Docker Desktop launched -- waiting up to 2 minutes for it to be ready..."',
    '      N=0',
    '      while [ $N -lt 40 ]; do',
    '        if docker info >/dev/null 2>&1; then break; fi',
    '        N=$((N + 1))',
    '        printf "  %ds elapsed...\\r" "$((N * 3))"',
    '        sleep 3',
    '      done',
    '      echo ""',
    '      if ! docker info >/dev/null 2>&1; then',
    '        echo "  -> Docker Desktop was installed but needs to start. Open it from Applications,"',
    '        echo "     wait for the whale icon in your menu bar to stop animating, then re-run this script."',
    '        exit 0',
    '      fi',
    '    else',
    '      err "Homebrew not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop then re-run."',
    '    fi',
    '  elif [ "$OS_TYPE" = "linux" ]; then',
    '    curl -fsSL https://get.docker.com | sh',
    '    sudo usermod -aG docker "$USER"',
    '    sudo systemctl enable --now docker',
    '    ok "Docker installed via get.docker.com"',
    '    # Verify it started after install',
    '    if ! docker info >/dev/null 2>&1; then',
    '      warn "Docker was installed. You may need to log out and back in for group changes to take effect,"',
    '      warn "then re-run this script."',
    '      exit 0',
    '    fi',
    '  fi',
    'fi',

    ...tailscaleLines,

    '',
    '# === Launch the hub ===',
    'step "Launching hub services"',
    'cd "$HUB_DIR"',
    '',
    '# Use docker compose v2 if available, fall back to docker-compose v1',
    'if docker compose version >/dev/null 2>&1; then',
    '  COMPOSE_CMD="docker compose"',
    'else',
    '  COMPOSE_CMD="docker-compose"',
    'fi',
    '',
    '$COMPOSE_CMD up -d',
    'ok "Services starting..."',
    '',
    '# === Wait for hub to come online ===',
    'step "Waiting for hub to come online"',
    'MAX=40',
    'N=0',
    'while [ $N -lt $MAX ]; do',
    '  if curl -sf http://localhost:9090/health >/dev/null 2>&1; then',
    '    break',
    '  fi',
    '  N=$((N + 1))',
    '  printf "  Attempt %d/%d...\\r" "$N" "$MAX"',
    '  sleep 3',
    'done',
    '',
    'if [ $N -ge $MAX ]; then',
    '  warn "Hub did not respond in time."',
    '  echo "  Check logs with: cd $HUB_DIR && $COMPOSE_CMD logs"',
    '  exit 1',
    'fi',
    '',
    'echo ""',
    'ok "Hub is online!"',
    '',
    'echo ""',
    'echo "  ============================================"',
    'echo "  ' + config.hubName + ' is live!"',
    'echo "  ============================================"',
    'echo ""',
    'echo "  Local URL: http://localhost:9090"',
    ...(isTailscale ? [
      'if [ -n "${TUNNEL_URL:-}" ]; then',
      '  echo "  Public URL: $TUNNEL_URL"',
      'fi',
    ] : []),
    'echo ""',
    'echo "  Return to the Citinet app -- your hub was detected automatically."',
    'echo "  Logs:  cd $HUB_DIR && $COMPOSE_CMD logs -f"',
    'echo "  Stop:  cd $HUB_DIR && $COMPOSE_CMD down"',
    'echo ""',
  ];

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────
// PowerShell script (Windows)
//
// Uses string concatenation and array-join to avoid conflicts.
// PowerShell variables ($VAR) are safe since TypeScript only
// interpolates ${...}. The only special case is $_ which we
// handle by capturing to a named variable first.
// ─────────────────────────────────────────────────────────

function buildPsTailscaleSection(config: HubScriptConfig): string[] {
  const tsKey = config.tailscaleAuthKey ?? '';
  return [
    '',
    '# === Tailscale (public access) ===',
    'Step "Setting up Tailscale"',
    '$tailscaleInstalled = $null -ne (Get-Command tailscale -ErrorAction SilentlyContinue)',
    '',
    'if (-not $tailscaleInstalled) {',
    '  Warn "Tailscale not found -- downloading installer..."',
    '  $TsInstaller = "$env:TEMP\\tailscale-setup.msi"',
    '  try {',
    '    Invoke-WebRequest -Uri "https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi" -OutFile $TsInstaller -UseBasicParsing',
    '    Start-Process msiexec.exe -ArgumentList "/i", $TsInstaller, "/quiet", "/qn", "/norestart" -Wait -NoNewWindow',
    '    Remove-Item $TsInstaller -Force -ErrorAction SilentlyContinue',
    '    # Refresh PATH so tailscale command is available immediately',
    '    $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")',
    '    Ok "Tailscale installed"',
    '  } catch {',
    '    $errMsg = $_.Exception.Message',
    '    Err "Tailscale installation failed: $errMsg -- Install manually from https://tailscale.com/download/windows"',
    '  }',
    '}',
    '',
    '# Authenticate with auth key -- no browser login needed',
    'Ok "Authenticating with Tailscale..."',
    'tailscale up --authkey="' + tsKey + '" --accept-routes --hostname="' + config.hubSlug + '"',
    'Ok "Tailscale connected"',
    '',
    '# Enable Funnel -- makes hub reachable worldwide at your Tailscale HTTPS URL.',
    '# Run via Start-Process so it is non-blocking (funnel keeps running after script exits).',
    'Ok "Enabling Tailscale Funnel on port 9090..."',
    '$FunnelProc = Start-Process -FilePath "tailscale" -ArgumentList "funnel", "9090" -WindowStyle Hidden -PassThru',
    'Start-Sleep 3  # give the funnel a moment to set up',
    'if ($FunnelProc.HasExited) {',
    '  Warn "Funnel could not start. HTTPS certificates must be enabled first:"',
    '  Write-Host "    1. Go to https://login.tailscale.com/admin/dns"',
    '  Write-Host "    2. Enable HTTPS Certificates"',
    '  Write-Host "    3. After your hub is running, run: tailscale funnel 9090"',
    '  Write-Host "    (Your hub is still reachable on your Tailscale network without Funnel)"',
    '} else {',
    '  Ok "Funnel active (background) -- hub will be publicly accessible"',
    '}',
    '',
    '# Capture the public URL and write it back to .env',
    '$TunnelUrl = ""',
    'try {',
    '  $TsStatus = tailscale status --json | ConvertFrom-Json',
    '  $TsHostname = $TsStatus.Self.DNSName.TrimEnd(".")',
    '  $TunnelUrl = "https://$TsHostname"',
    '  $EnvText = [System.IO.File]::ReadAllText("$HubDir\\.env")',
    '  $EnvText = $EnvText -replace "(?m)^TUNNEL_URL=.*$", "TUNNEL_URL=$TunnelUrl"',
    '  [System.IO.File]::WriteAllText("$HubDir\\.env", $EnvText, [System.Text.Encoding]::UTF8)',
    '  Ok "Tunnel URL: $TunnelUrl"',
    '} catch {',
    '  Warn "Could not determine Tailscale URL automatically. Check Tailscale admin console."',
    '}',
  ];
}

function generatePowerShellScript(config: HubScriptConfig): string {
  const envContent = generateEnvContent(config);
  const composeYaml = getComposeYaml(config.dataDir);
  const isTailscale = config.visibility === 'tailscale';

  // Escape single quotes in content for PS array literal ('...' -> '..''...')
  const envLines = envContent
    .split('\n')
    .map(l => "    '" + l.replace(/'/g, "''") + "'")
    .join(',\n');

  // Base64-encode the compose YAML for safe embedding in PowerShell
  // (avoids heredoc issues with single quotes in YAML version string, etc.)
  const composeB64 = btoa(unescape(encodeURIComponent(composeYaml)));

  const tailscaleLines = isTailscale
    ? buildPsTailscaleSection(config)
    : ['', '# Access mode: local network only'];

  const lines = [
    '# ============================================================',
    '# Citinet Hub Setup -- ' + config.hubName,
    '# Generated: ' + config.generatedAt,
    '# Run: powershell -ExecutionPolicy Bypass -File citinet-setup.ps1',
    '# ============================================================',
    '',
    '#Requires -Version 5.1',
    'Set-StrictMode -Version Latest',
    '$ErrorActionPreference = "Continue"  # "Stop" throws on native cmd stderr warnings (docker, tailscale)',
    '',
    '$HubDir = "$env:USERPROFILE\\citinet-hub"',
    '',
    'function Ok($msg)   { Write-Host "  [ok] $msg" -ForegroundColor Green }',
    'function Warn($msg) { Write-Host "  [!!] $msg" -ForegroundColor Yellow }',
    'function Step($msg) { Write-Host ""; Write-Host "=== $msg ===" -ForegroundColor Cyan }',
    'function Err($msg)  { Write-Host "  [ERROR] $msg" -ForegroundColor Red; exit 1 }',
    '',
    'Write-Host ""',
    'Write-Host "  Citinet Hub Setup -- ' + config.hubName + '"',
    'Write-Host "  This script installs dependencies, configures, and launches your hub."',
    'Write-Host ""',
    '',
    '# === Create hub directory ===',
    'Step "Creating hub directory"',
    'New-Item -ItemType Directory -Force -Path $HubDir | Out-Null',
    'Ok "Directory: $HubDir"',
    ...(config.dataDir ? [
      '',
      '# === Create data directories (bind-mount targets) ===',
      '$DataDir = "' + config.dataDir + '"',
      'New-Item -ItemType Directory -Force -Path "$DataDir\\db","$DataDir\\storage","$DataDir\\redis" | Out-Null',
      'Ok "Data directories: $DataDir"',
    ] : []),
    '',
    '# === Write .env (all values pre-configured, no editing needed) ===',
    'Step "Writing configuration"',
    '$EnvLines = @(',
    envLines,
    ')',
    '$EnvContent = $EnvLines -join "`n"',
    '[System.IO.File]::WriteAllText("$HubDir\\.env", $EnvContent, [System.Text.Encoding]::UTF8)',
    'Ok ".env written"',
    '',
    '# === Write docker-compose.yml (base64-embedded for safe PowerShell handling) ===',
    '$ComposeB64 = "' + composeB64 + '"',
    '$ComposeBytes = [System.Convert]::FromBase64String($ComposeB64)',
    '$ComposeContent = [System.Text.Encoding]::UTF8.GetString($ComposeBytes)',
    '[System.IO.File]::WriteAllText("$HubDir\\docker-compose.yml", $ComposeContent, [System.Text.Encoding]::UTF8)',
    'Ok "docker-compose.yml written"',
    '',
    '# === Check / install Docker ===',
    'Step "Checking Docker"',
    '$dockerInstalled = $null -ne (Get-Command docker -ErrorAction SilentlyContinue)',
    '',
    'if ($dockerInstalled) {',
    '  # Named-pipe check is instant and avoids docker-info hanging during startup.',
    '  # docker_engine = Windows containers; dockerDesktopLinuxEngine = WSL2/Linux containers.',
    '  $PipeReady = (Test-Path "\\\\.\\pipe\\docker_engine") -or (Test-Path "\\\\.\\pipe\\dockerDesktopLinuxEngine")',
    '  $dockerRunning = $false',
    '',
    '  if ($PipeReady) {',
    '    # Named pipe exists -- Docker daemon is accepting connections.',
    '    # Confirm CLI responds. If it fails, a stale Docker context is the usual cause.',
    '    # Use 2>$null (not 2>&1) -- stderr warnings with 2>&1 become NativeCommandErrors',
    '    # that throw under $ErrorActionPreference="Stop", even if docker info exits 0.',
    '    $null = docker info 2>$null',
    '    if ($LASTEXITCODE -eq 0) {',
    '      $dockerRunning = $true',
    '    } else {',
    '      Warn "Docker pipe is up but CLI did not respond -- resetting Docker context..."',
    '      docker context use default 2>$null | Out-Null',
    '      $null = docker info 2>$null',
    '      # Trust the pipe even if docker info still reports issues -- daemon is running.',
    '      $dockerRunning = $true',
    '      if ($LASTEXITCODE -eq 0) { Ok "Docker context reset -- CLI is now responding" }',
    '    }',
    '  }',
    '',
    '  if (-not $dockerRunning) {',
    '    Warn "Docker Desktop is installed but not running -- attempting to start it..."',
    '    $DockerDesktopPaths = @(',
    '      "$env:ProgramFiles\\Docker\\Docker\\Docker Desktop.exe",',
    '      "$env:LocalAppData\\Docker\\Docker Desktop.exe",',
    '      "$env:ProgramFiles(x86)\\Docker\\Docker\\Docker Desktop.exe"',
    '    )',
    '    $DockerDesktopExe = $DockerDesktopPaths | Where-Object { Test-Path $_ } | Select-Object -First 1',
    '',
    '    if ($DockerDesktopExe) {',
    '      Start-Process $DockerDesktopExe',
    '      Ok "Docker Desktop launched -- waiting up to 3 minutes for it to be ready..."',
    '      $WaitMax = 60',
    '      $Waited = 0',
    '      while ($Waited -lt $WaitMax) {',
    '        # Named-pipe: no subprocess hang risk, responds the moment Docker is ready.',
    '        if ((Test-Path "\\\\.\\pipe\\docker_engine") -or (Test-Path "\\\\.\\pipe\\dockerDesktopLinuxEngine")) {',
    '          $dockerRunning = $true; break',
    '        }',
    '        $Waited++',
    '        Write-Host ("  " + ($Waited * 3) + "s elapsed...") -NoNewline',
    '        Write-Host "`r" -NoNewline',
    '        Start-Sleep 3',
    '      }',
    '      Write-Host ""',
    '      if (-not $dockerRunning) {',
    '        Err "Docker Desktop did not become ready in time. Make sure the whale icon in your system tray has stopped animating, then re-run this script."',
    '      }',
    '      Ok "Docker Desktop is ready"',
    '    } else {',
    '      Err "Docker Desktop is not running and could not be found automatically. Open Docker Desktop from the Start menu, wait for the whale icon in your system tray to stop animating, then re-run this script."',
    '    }',
    '  }',
    '',
    '  # [regex]::Match avoids the $1 back-ref issue with Set-StrictMode -Version Latest',
    '  $dockerVer = [regex]::Match((docker --version 2>$null), "\\d+\\.\\d+\\.\\d+").Value',
    '  Ok "Docker $dockerVer is running"',
    '',
    '} else {',
    '  Warn "Docker not found -- downloading Docker Desktop installer..."',
    '  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
    '  if (-not $isAdmin) {',
    '    Err "Docker installation requires Administrator. Right-click PowerShell and choose Run as Administrator, then re-run."',
    '  }',
    '  $InstallerPath = "$env:TEMP\\DockerDesktopInstaller.exe"',
    '  try {',
    '    Invoke-WebRequest -Uri "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe" -OutFile $InstallerPath -UseBasicParsing',
    '    Start-Process -FilePath $InstallerPath -ArgumentList "install", "--quiet", "--accept-license" -Wait -NoNewWindow',
    '    Remove-Item $InstallerPath -Force -ErrorAction SilentlyContinue',
    '    Ok "Docker Desktop installed"',
    '    Warn "Restart your computer, then re-run this script to continue."',
    '    Read-Host "Press Enter to exit"',
    '    exit 0',
    '  } catch {',
    '    $errMsg = $_.Exception.Message',
    '    Err "Docker Desktop installation failed: $errMsg -- Install manually from https://www.docker.com/products/docker-desktop then re-run."',
    '  }',
    '}',

    ...tailscaleLines,

    '',
    '# === Launch the hub ===',
    'Step "Launching hub services"',
    'Set-Location $HubDir',
    '',
    '# Use docker compose v2 if available, fall back to docker-compose v1',
    '$ComposeCmd = "docker-compose"',
    '$null = docker compose version 2>$null',
    'if ($LASTEXITCODE -eq 0) { $ComposeCmd = "docker compose" }',
    '',
    'Invoke-Expression "$ComposeCmd up -d"',
    'Ok "Services starting..."',
    '',
    '# === Wait for hub to come online ===',
    'Step "Waiting for hub to come online"',
    '$MaxAttempts = 40',
    '$Attempt = 0',
    '$HubReady = $false',
    '',
    'while ($Attempt -lt $MaxAttempts) {',
    '  try {',
    '    $r = Invoke-WebRequest -Uri "http://localhost:9090/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop',
    '    if ($r.StatusCode -eq 200) { $HubReady = $true; break }',
    '  } catch {}',
    '  $Attempt++',
    '  Write-Host "  Attempt $Attempt/$MaxAttempts..." -NoNewline',
    '  Write-Host "`r" -NoNewline',
    '  Start-Sleep 3',
    '}',
    '',
    'if (-not $HubReady) {',
    '  Warn "Hub did not respond in time."',
    '  Write-Host "  Check logs with: cd $HubDir; $ComposeCmd logs"',
    '  exit 1',
    '}',
    '',
    'Write-Host ""',
    'Ok "Hub is online!"',
    'Write-Host ""',
    'Write-Host "  ============================================" -ForegroundColor Cyan',
    'Write-Host "  ' + config.hubName + ' is live!" -ForegroundColor Green',
    'Write-Host "  ============================================" -ForegroundColor Cyan',
    'Write-Host ""',
    'Write-Host "  Local URL: http://localhost:9090"',
    ...(isTailscale ? [
      'if ($TunnelUrl) { Write-Host "  Public URL: $TunnelUrl" -ForegroundColor Green }',
    ] : []),
    'Write-Host ""',
    'Write-Host "  Return to the Citinet app -- your hub was detected automatically."',
    'Write-Host "  Logs: cd $HubDir; $ComposeCmd logs -f"',
    'Write-Host "  Stop: cd $HubDir; $ComposeCmd down"',
    'Write-Host ""',
  ];

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

/** Generates and triggers a browser download of the setup script. */
export function downloadSetupScript(
  config: HubScriptConfig,
  os: 'windows' | 'mac' | 'linux'
): void {
  const isWindows = os === 'windows';
  const content = isWindows
    ? generatePowerShellScript(config)
    : generateBashScript(config);
  const filename = isWindows ? 'citinet-setup.ps1' : 'citinet-setup.sh';

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Returns the single command the user runs after downloading the script. */
export function getRunCommand(os: 'windows' | 'mac' | 'linux'): string {
  if (os === 'windows') return 'powershell -ExecutionPolicy Bypass -File citinet-setup.ps1';
  return 'bash citinet-setup.sh';
}

// Note: HubSecrets is already exported as an interface above.
