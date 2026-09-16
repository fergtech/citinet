/**
 * Citinet Off-site Backup Configuration Script Generator
 *
 * The `citinet-backup` container (see scriptGenerator.ts's getComposeYaml) can
 * push nightly encrypted, incremental backups to any restic-supported remote,
 * but only once RESTIC_REPOSITORY/RESTIC_PASSWORD (and that backend's own
 * credential vars) are set in the hub's .env and the container is recreated.
 * Doing that by hand means opening a text editor and a terminal — not
 * something every hub admin (a HOA president, a neighborhood mod, a parent
 * running a family hub) wants to do.
 *
 * This generates a small, focused patch script instead of the full hub setup
 * script: it only touches the handful of off-site-backup keys in .env (never
 * the rest of the file — DB_PASSWORD, JWT_SECRET, etc. are never read or
 * touched), then restarts just the one container. Deliberately NOT a live
 * "save" button through the API: credentials never pass through citinet-api
 * or any server at all, matching this project's decentralization stance (see
 * upside_down_funnel_philosophy) and avoiding any need to grant citinet-api
 * Docker-socket access just to recreate a sibling container.
 *
 * Mirrors scriptGenerator.ts's dual bash/PowerShell generation and
 * windowsApScriptGenerator.ts's "ASCII-only generated content" discipline —
 * both sidestep the PowerShell 5.1 default-codepage corruption trap that bit
 * a real hub1 edit done by hand (see windows_bash_powershell_fs_boundary
 * memory) by using explicit -Encoding UTF8 throughout and never emitting
 * non-ASCII characters of our own into the script.
 */

export type OffsiteBackupProvider = 'b2' | 'r2' | 's3' | 'custom';

export interface OffsiteBackupScriptConfig {
  provider: OffsiteBackupProvider;
  /** Used as the restic repository path suffix and --host tag so multiple hubs can safely share one remote. */
  hubSlug: string;
  /** Encrypts every backup. Losing it makes backups permanently unreadable — never sent anywhere but into this hub's own .env. */
  password: string;
  /** Days of off-site snapshots to keep before restic prunes older ones. Default 30. */
  retentionDays?: number;

  // Backblaze B2 (native restic backend)
  b2Bucket?: string;
  b2AccountId?: string;
  b2AccountKey?: string;

  // Cloudflare R2 -- S3-compatible, addressed via restic's s3 backend against
  // R2's own endpoint. Free egress is the real differentiator for a backup's
  // actual job (restoring everything after losing the machine), which is why
  // this gets its own named option instead of living under generic S3.
  r2AccountId?: string;
  r2Bucket?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;

  // S3 / S3-compatible (AWS, Wasabi, MinIO elsewhere, ...)
  s3Bucket?: string;
  /** Host[:port], no scheme. Blank = AWS's own default (s3.amazonaws.com). */
  s3Endpoint?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3Region?: string;

  // Advanced / any other restic backend (sftp:, azure:, gs:, rest:, ...)
  customRepository?: string;
  /** Raw multi-line KEY=VALUE text for whatever credential vars that backend needs. */
  customEnvText?: string;
}

function buildRepository(config: OffsiteBackupScriptConfig): string {
  switch (config.provider) {
    case 'b2':
      return `b2:${(config.b2Bucket ?? '').trim()}:${config.hubSlug}`;
    case 'r2': {
      const endpoint = `${(config.r2AccountId ?? '').trim()}.r2.cloudflarestorage.com`;
      return `s3:${endpoint}/${(config.r2Bucket ?? '').trim()}/${config.hubSlug}`;
    }
    case 's3': {
      const endpoint = (config.s3Endpoint ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') || 's3.amazonaws.com';
      return `s3:${endpoint}/${(config.s3Bucket ?? '').trim()}/${config.hubSlug}`;
    }
    case 'custom':
      return (config.customRepository ?? '').trim();
  }
}

function parseCustomEnvText(text: string): Array<[string, string]> {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map((line): [string, string] | null => {
      const idx = line.indexOf('=');
      if (idx === -1) return null;
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    })
    .filter((pair): pair is [string, string] => pair !== null && pair[0].length > 0);
}

function buildCredentialPairs(config: OffsiteBackupScriptConfig): Array<[string, string]> {
  switch (config.provider) {
    case 'b2':
      return [
        ['B2_ACCOUNT_ID', (config.b2AccountId ?? '').trim()],
        ['B2_ACCOUNT_KEY', (config.b2AccountKey ?? '').trim()],
      ];
    case 'r2':
      // restic's s3 backend (which R2's S3-compatible API goes through) reads
      // the same AWS_* variable names regardless of provider -- these are R2
      // API token credentials, not real AWS ones. R2 ignores region, but
      // some S3 client libraries still expect a non-empty value, so "auto"
      // (Cloudflare's own documented recommendation) is always set.
      return [
        ['AWS_ACCESS_KEY_ID', (config.r2AccessKeyId ?? '').trim()],
        ['AWS_SECRET_ACCESS_KEY', (config.r2SecretAccessKey ?? '').trim()],
        ['AWS_DEFAULT_REGION', 'auto'],
      ];
    case 's3': {
      const pairs: Array<[string, string]> = [
        ['AWS_ACCESS_KEY_ID', (config.s3AccessKeyId ?? '').trim()],
        ['AWS_SECRET_ACCESS_KEY', (config.s3SecretAccessKey ?? '').trim()],
      ];
      if ((config.s3Region ?? '').trim()) pairs.push(['AWS_DEFAULT_REGION', config.s3Region!.trim()]);
      return pairs;
    }
    case 'custom':
      return parseCustomEnvText(config.customEnvText ?? '');
  }
}

/** Every KEY=VALUE pair that needs to land in .env, in write order. */
function buildEnvPairs(config: OffsiteBackupScriptConfig): Array<[string, string]> {
  return [
    ['RESTIC_REPOSITORY', buildRepository(config)],
    ['RESTIC_PASSWORD', config.password],
    ...buildCredentialPairs(config),
    ['OFFSITE_BACKUP_RETENTION_DAYS', String(config.retentionDays ?? 30)],
  ];
}

/** Returns a user-facing error string, or null if the config is ready to generate a script from. */
export function validateOffsiteBackupConfig(config: OffsiteBackupScriptConfig): string | null {
  if (!config.hubSlug.trim()) return 'Missing hub slug.';
  if (config.password.length < 12) return 'The backup passphrase must be at least 12 characters.';
  if (config.provider === 'b2') {
    if (!config.b2Bucket?.trim()) return 'Enter your Backblaze B2 bucket name.';
    if (!config.b2AccountId?.trim()) return 'Enter your B2 key ID (account ID).';
    if (!config.b2AccountKey?.trim()) return 'Enter your B2 application key.';
  } else if (config.provider === 'r2') {
    if (!config.r2AccountId?.trim()) return 'Enter your Cloudflare account ID.';
    if (!config.r2Bucket?.trim()) return 'Enter your R2 bucket name.';
    if (!config.r2AccessKeyId?.trim()) return 'Enter your R2 access key ID.';
    if (!config.r2SecretAccessKey?.trim()) return 'Enter your R2 secret access key.';
  } else if (config.provider === 's3') {
    if (!config.s3Bucket?.trim()) return 'Enter your S3 bucket name.';
    if (!config.s3AccessKeyId?.trim()) return 'Enter your access key ID.';
    if (!config.s3SecretAccessKey?.trim()) return 'Enter your secret access key.';
  } else {
    if (!config.customRepository?.trim()) return 'Enter a restic repository string.';
  }
  return null;
}

// ─────────────────────────────────────────────────────────
// Shell-safe quoting -- credentials are admin-typed and could contain
// anything (quotes, $, backticks, ...). Both helpers produce a single-quoted
// literal, the one form neither shell tries to interpret.
// ─────────────────────────────────────────────────────────

function shQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function psQuote(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

// ─────────────────────────────────────────────────────────
// bash/sh (macOS + Linux)
// ─────────────────────────────────────────────────────────

function generateOffsiteBackupBashScript(config: OffsiteBackupScriptConfig): string {
  const pairs = buildEnvPairs(config);
  const generatedAt = new Date().toISOString();

  const lines = [
    '#!/bin/sh',
    '# ============================================================',
    '# Citinet Off-site Backup Configuration',
    '# Updates ONLY the off-site-backup keys in .env (never touches any other',
    '# secret in this file), then restarts citinet-backup to pick them up.',
    '# Generated: ' + generatedAt,
    '# Run this from inside your hub folder: sh citinet-backup-config.sh',
    '# ============================================================',
    '',
    'set -e',
    '',
    'ok()  { printf "  [ok] %s\\n" "$1"; }',
    'err() { printf "  [ERROR] %s\\n" "$1"; exit 1; }',
    '',
    'if [ ! -f docker-compose.yml ] || [ ! -f .env ]; then',
    '  err "docker-compose.yml or .env not found here -- run this script from inside your hub folder (the one that has those two files)."',
    'fi',
    '',
    'if ! grep -q "RESTIC_REPOSITORY" docker-compose.yml; then',
    '  err "This hub\'s docker-compose.yml predates off-site backup support. Re-download and re-run your hub\'s citinet-setup.sh first (safe -- it only updates docker-compose.yml, never your data), then run this script again."',
    'fi',
    '',
    'cp .env ".env.bak-$(date +%Y%m%d-%H%M%S)"',
    'ok "Backed up current .env"',
    '',
    'set_env_var() {',
    '  key="$1"; value="$2"',
    '  if grep -q "^${key}=" .env; then',
    '    awk -v k="$key" -v v="$value" \'BEGIN{FS="="} { if ($1==k) print k"="v; else print $0 }\' .env > .env.tmp && mv .env.tmp .env',
    '  else',
    '    printf "%s=%s\\n" "$key" "$value" >> .env',
    '  fi',
    '}',
    '',
    ...pairs.map(([key, value]) => `set_env_var ${shQuote(key)} ${shQuote(value)}`),
    'ok "Wrote off-site backup settings to .env"',
    '',
    'echo ""',
    'echo "Restarting the backup service..."',
    'docker compose up -d --force-recreate citinet-backup',
    'ok "citinet-backup is restarting with the new settings"',
    'echo ""',
    'echo "Watch progress:  docker compose logs -f citinet-backup"',
    'echo "It backs up once a day; this restart triggers an immediate first run."',
    'echo ""',
    'echo "IMPORTANT: your backup passphrase is required to ever restore these"',
    'echo "backups. Make sure you saved it somewhere other than this machine"',
    'echo "(a password manager) -- it only lives in this .env file from here on."',
    'echo ""',
  ];

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────
// PowerShell (Windows)
// ─────────────────────────────────────────────────────────

function generateOffsiteBackupPowerShellScript(config: OffsiteBackupScriptConfig): string {
  const pairs = buildEnvPairs(config);
  const generatedAt = new Date().toISOString();

  const lines = [
    '# ============================================================',
    '# Citinet Off-site Backup Configuration',
    '# Updates ONLY the off-site-backup keys in .env (never touches any other',
    '# secret in this file), then restarts citinet-backup to pick them up.',
    '# Generated: ' + generatedAt,
    '# Run from inside your hub folder:',
    '#   powershell -ExecutionPolicy Bypass -File citinet-backup-config.ps1',
    '# ============================================================',
    '',
    '$ErrorActionPreference = "Stop"',
    'function Ok($msg)  { Write-Host "  [ok] $msg" -ForegroundColor Green }',
    'function Err($msg) { Write-Host "  [ERROR] $msg" -ForegroundColor Red; exit 1 }',
    '',
    'if (-not (Test-Path ".\\docker-compose.yml") -or -not (Test-Path ".\\.env")) {',
    '  Err "docker-compose.yml or .env not found here -- run this script from inside your hub folder (the one that has those two files)."',
    '}',
    '',
    '$composeContent = Get-Content ".\\docker-compose.yml" -Raw -Encoding UTF8',
    'if ($composeContent -notmatch "RESTIC_REPOSITORY") {',
    '  Err "This hub\'s docker-compose.yml predates off-site backup support. Re-download and re-run your hub\'s citinet-setup.ps1 first (safe -- it only updates docker-compose.yml, never your data), then run this script again."',
    '}',
    '',
    '$BackupName = ".env.bak-" + (Get-Date -Format "yyyyMMdd-HHmmss")',
    'Copy-Item ".\\.env" $BackupName',
    'Ok "Backed up current .env to $BackupName"',
    '',
    'function Set-EnvVar($Key, $Value) {',
    '  $lines = Get-Content ".\\.env" -Encoding UTF8',
    '  $pattern = "^" + [regex]::Escape($Key) + "="',
    '  $found = $false',
    '  $newLines = foreach ($line in $lines) {',
    '    if ($line -match $pattern) { $found = $true; "$Key=$Value" } else { $line }',
    '  }',
    '  if (-not $found) { $newLines = $newLines + "$Key=$Value" }',
    '  $envPath = (Resolve-Path ".\\.env").Path',
    '  [System.IO.File]::WriteAllLines($envPath, $newLines, (New-Object System.Text.UTF8Encoding($true)))',
    '}',
    '',
    ...pairs.map(([key, value]) => `Set-EnvVar ${psQuote(key)} ${psQuote(value)}`),
    'Ok "Wrote off-site backup settings to .env"',
    '',
    'Write-Host ""',
    'Write-Host "Restarting the backup service..."',
    'docker compose up -d --force-recreate citinet-backup',
    'Ok "citinet-backup is restarting with the new settings"',
    'Write-Host ""',
    'Write-Host "Watch progress:  docker compose logs -f citinet-backup"',
    'Write-Host "It backs up once a day; this restart triggers an immediate first run."',
    'Write-Host ""',
    'Write-Host "IMPORTANT: your backup passphrase is required to ever restore these"',
    'Write-Host "backups. Make sure you saved it somewhere other than this machine"',
    'Write-Host "(a password manager) -- it only lives in this .env file from here on."',
    'Write-Host ""',
  ];

  return lines.join('\n');
}

/** Generates and triggers a browser download of the off-site backup config script. Throws if config is incomplete. */
export function downloadOffsiteBackupScript(config: OffsiteBackupScriptConfig, os: 'windows' | 'mac' | 'linux'): void {
  const error = validateOffsiteBackupConfig(config);
  if (error) throw new Error(error);

  const isWindows = os === 'windows';
  const content = isWindows ? generateOffsiteBackupPowerShellScript(config) : generateOffsiteBackupBashScript(config);
  const filename = isWindows ? 'citinet-backup-config.ps1' : 'citinet-backup-config.sh';

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

export { generateOffsiteBackupBashScript, generateOffsiteBackupPowerShellScript, buildRepository };
