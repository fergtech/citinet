/**
 * Citinet Windows Access-Point Setup Script Generator
 *
 * Generates a PowerShell script that turns the hub machine ITSELF into the
 * guest Wi-Fi bridge — no second device needed. Uses Windows' native Mobile
 * Hotspot (NetworkOperatorTetheringManager) plus a small custom DNS
 * responder (the `dns2` npm package) that takes over answering exactly one
 * hostname once ICS's own DNS proxy is disabled.
 *
 * Every mechanism here (hotspot start/stop + SSID/password config via WinRT,
 * EnableDNS=0 disabling ICS's DNS proxy, a dns2 responder binding the
 * hotspot's gateway IP and forwarding everything else upstream) was
 * live-verified end-to-end on real hardware on 2026-07-31 — see
 * hub_wireless_reach_https_bridge memory and the approved plan this was
 * built from. The Scheduled Task persistence and firewall rules are new,
 * built directly on those verified primitives.
 *
 * Unlike the Raspberry Pi path (apScriptGenerator.ts), this never needs a
 * separate `hubLanIp` — Windows' Mobile Hotspot gateway is always
 * 192.168.137.1, and Caddy's docker-compose port mapping already binds all
 * host interfaces, so the hotspot's own gateway IP reaches the same Caddy
 * container with zero extra plumbing.
 */

export interface WindowsApScriptConfig {
  /** SSID guests will see and join. */
  apSsid: string;
  /** WPA2 password for the hotspot. Must be >= 8 characters. */
  apPassword: string;
  /** The hub's HTTPS hostname guests will type, e.g. `<hubslug>.hub.citinet.cloud`. */
  hubHostname: string;
  /** Port guests may reach on this machine. Default 443 (Caddy's HTTPS listener). */
  guestHttpsPort?: number;
}

const HOTSPOT_GATEWAY_IP = '192.168.137.1';
const DEFAULT_GUEST_HTTPS_PORT = 443;

/** The dns2-based responder, generalized from tonight's live-verified test script. */
function buildResponderJs(hubHostname: string, guestHttpsPort: number): string {
  return [
    "const dns2 = require('dns2');",
    'const { Packet } = dns2;',
    '',
    "const GATEWAY_IP = '" + HOTSPOT_GATEWAY_IP + "';",
    "const HUB_HOSTNAME = '" + hubHostname + "';",
    "const UPSTREAM_DNS = '1.1.1.1';",
    '',
    'const forward = new dns2({ nameServers: [UPSTREAM_DNS] });',
    '',
    '// The gateway IP only exists while the hotspot is actually up. A bind',
    "// failure (e.g. hotspot briefly cycling) shouldn't crash the process --",
    '// retry instead of letting an unhandled error event take down node.',
    'function startServer() {',
    'const dnsServer = dns2.createServer({',
    '  udp: true,',
    '  handle: async (request, send) => {',
    '    const response = Packet.createResponseFromRequest(request);',
    '    const [question] = request.questions;',
    "    const name = question.name.replace(/\\.$/, '');",
    '',
    '    if (name === HUB_HOSTNAME) {',
    '      response.answers.push({',
    '        name: question.name,',
    '        type: Packet.TYPE.A,',
    '        class: Packet.CLASS.IN,',
    '        ttl: 60,',
    '        address: GATEWAY_IP,',
    '      });',
    '      return send(response);',
    '    }',
    '',
    '    try {',
    '      const upstream = await forward.resolveA(name);',
    '      for (const a of upstream.answers) {',
    '        if (a.address) {',
    '          response.answers.push({',
    '            name: question.name,',
    '            type: Packet.TYPE.A,',
    '            class: Packet.CLASS.IN,',
    '            ttl: a.ttl ?? 60,',
    '            address: a.address,',
    '          });',
    '        }',
    '      }',
    '      send(response);',
    '    } catch {',
    '      response.header.rcode = Packet.RCODE.SERVFAIL;',
    '      send(response);',
    '    }',
    '  },',
    '});',
    '',
    "dnsServer.on('requestError', () => {});",
    "dnsServer.on('error', (err) => {",
    "  console.error('DNS bridge error: ' + err.message + ' -- retrying in 10s');",
    '  setTimeout(startServer, 10000);',
    '});',
    "dnsServer.on('listening', () => {",
    "  console.log('Citinet DNS bridge listening on ' + GATEWAY_IP + ':53 for ' + HUB_HOSTNAME);",
    "  console.log('Guest HTTPS reaches this same machine on port " + guestHttpsPort + " via Caddy.');",
    '});',
    'dnsServer.listen({ udp: { port: 53, address: GATEWAY_IP } });',
    '}',
    '',
    'startServer();',
  ].join('\n');
}

function generateWindowsApPowerShellScript(config: WindowsApScriptConfig): string {
  if (config.apPassword.length < 8) {
    throw new Error('AP password must be at least 8 characters (WPA2 minimum)');
  }

  const guestHttpsPort = config.guestHttpsPort ?? DEFAULT_GUEST_HTTPS_PORT;
  const generatedAt = new Date().toISOString();
  const responderJs = buildResponderJs(config.hubHostname, guestHttpsPort);
  const responderB64 = btoa(unescape(encodeURIComponent(responderJs)));

  const packageJson = JSON.stringify({ name: 'citinet-dns-bridge', private: true, dependencies: { dns2: '^2.1.0' } }, null, 2);
  const packageJsonB64 = btoa(unescape(encodeURIComponent(packageJson)));

  const lines = [
    '# ============================================================',
    '# Citinet Windows Access Point Setup',
    '# Turns this machine into the guest Wi-Fi bridge for: ' + config.hubHostname,
    '# Generated: ' + generatedAt,
    '# Run: powershell -ExecutionPolicy Bypass -File citinet-ap-setup.ps1',
    '# ============================================================',
    '',
    '#Requires -Version 5.1',
    'Set-StrictMode -Version Latest',
    '$ErrorActionPreference = "Continue"',
    '',
    '$HubDir = "$env:USERPROFILE\\citinet-hub"',
    '$BridgeDir = "$HubDir\\dns-bridge"',
    '$ApSsid = "' + config.apSsid + '"',
    '$ApPassword = "' + config.apPassword + '"',
    '$GuestHttpsPort = ' + guestHttpsPort,
    '',
    'function Ok($msg)   { Write-Host "  [ok] $msg" -ForegroundColor Green }',
    'function Warn($msg) { Write-Host "  [!!] $msg" -ForegroundColor Yellow }',
    'function Step($msg) { Write-Host ""; Write-Host "=== $msg ===" -ForegroundColor Cyan }',
    'function Err($msg)  { Write-Host "  [ERROR] $msg" -ForegroundColor Red; exit 1 }',
    '',
    'Write-Host ""',
    'Write-Host "  Citinet Windows Access Point Setup"',
    'Write-Host "  This turns this machine into a dedicated guest Wi-Fi bridge -- no"',
    'Write-Host "  second device needed. Guests with zero internet of their own can join"',
    'Write-Host "  and reach this hub over real, trusted HTTPS."',
    'Write-Host ""',
    '',
    '# === Prerequisites ===',
    'Step "Checking prerequisites"',
    '$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
    'if (-not $isAdmin) {',
    '  Err "Run this script as Administrator: right-click PowerShell, choose Run as Administrator, then re-run."',
    '}',
    '$nodeInstalled = $null -ne (Get-Command node -ErrorAction SilentlyContinue)',
    'if (-not $nodeInstalled) {',
    '  Warn "Node.js not found -- installing via winget..."',
    '  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements',
    '  $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")',
    '  if ($null -eq (Get-Command node -ErrorAction SilentlyContinue)) {',
    '    Err "Node.js installation did not complete -- install manually from https://nodejs.org and re-run."',
    '  }',
    '}',
    'Ok "Administrator + Node.js present"',
    '',
    '# === Write the DNS bridge (dns2-based responder) ===',
    'Step "Writing DNS bridge"',
    'New-Item -ItemType Directory -Force -Path $BridgeDir | Out-Null',
    '$ResponderB64 = "' + responderB64 + '"',
    '$ResponderBytes = [System.Convert]::FromBase64String($ResponderB64)',
    '$ResponderContent = [System.Text.Encoding]::UTF8.GetString($ResponderBytes)',
    '[System.IO.File]::WriteAllText("$BridgeDir\\responder.js", $ResponderContent, [System.Text.Encoding]::UTF8)',
    '$PackageB64 = "' + packageJsonB64 + '"',
    '$PackageBytes = [System.Convert]::FromBase64String($PackageB64)',
    '$PackageContent = [System.Text.Encoding]::UTF8.GetString($PackageBytes)',
    '[System.IO.File]::WriteAllText("$BridgeDir\\package.json", $PackageContent, [System.Text.Encoding]::UTF8)',
    'Push-Location $BridgeDir',
    'npm install --no-fund --no-audit 2>$null | Out-Null',
    'Pop-Location',
    'Ok "DNS bridge written to $BridgeDir"',
    '',
    '# === Disable ICS\'s own DNS proxy so our responder can take over ===',
    'Step "Configuring DNS override"',
    'New-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\SharedAccess\\Parameters" -Name "EnableDNS" -Value 0 -PropertyType DWord -Force | Out-Null',
    'Ok "ICS DNS proxy disabled -- our responder will answer instead"',
    '',
    '# Windows normally shuts the hotspot off after ~20 min with no connected',
    '# devices -- fine for a phone tethering, wrong for a guest AP that needs',
    "# to just sit there waiting. Disabling this is what makes it actually",
    '# reliable for this use case.',
    'New-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\icssvc\\Settings" -Name "PeerlessTimeoutEnabled" -Value 0 -PropertyType DWord -Force | Out-Null',
    'Ok "Hotspot idle auto-shutoff disabled -- it will stay up waiting for guests"',
    '',
    '# === Configure and start the Mobile Hotspot ===',
    'Step "Starting access point"',
    'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
    '$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq \'AsTask\' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq \'IAsyncOperation`1\' })[0]',
    '$asTaskAction  = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq \'AsTask\' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq \'IAsyncAction\' })[0]',
    'function Await($WinRtTask, $ResultType) {',
    '  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)',
    '  $netTask = $asTask.Invoke($null, @($WinRtTask))',
    '  $netTask.Wait(-1) | Out-Null',
    '  $netTask.Result',
    '}',
    'function AwaitAction($WinRtAction) {',
    '  $netTask = $asTaskAction.Invoke($null, @($WinRtAction))',
    '  $netTask.Wait(-1) | Out-Null',
    '}',
    'try {',
    '  $connProfile = [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]::GetInternetConnectionProfile()',
    '  $tm = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime]::CreateFromConnectionProfile($connProfile)',
    '  $apConfig = New-Object Windows.Networking.NetworkOperators.NetworkOperatorTetheringAccessPointConfiguration',
    '  $apConfig.Ssid = $ApSsid',
    '  $apConfig.Passphrase = $ApPassword',
    '  AwaitAction ($tm.ConfigureAccessPointAsync($apConfig))',
    '  $result = Await ($tm.StartTetheringAsync()) ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])',
    '  if ($tm.TetheringOperationalState.ToString() -ne "On") {',
    '    Err "Hotspot did not start (status: $($result.Status)). Check that this machine has an active network connection and Wi-Fi hardware that supports hosted networks."',
    '  }',
    '  Ok "Broadcasting `"$ApSsid`" -- guests connect to this Wi-Fi network"',
    '} catch {',
    '  Err "Failed to start Mobile Hotspot: $($_.Exception.Message)"',
    '}',
    '',
    '# === Persist the DNS bridge across reboots/crashes ===',
    'Step "Registering DNS bridge as a startup task"',
    'if (Get-ScheduledTask -TaskName "CitinetDnsBridge" -ErrorAction SilentlyContinue) {',
    '  Unregister-ScheduledTask -TaskName "CitinetDnsBridge" -Confirm:$false',
    '}',
    '# Resolve Node\'s full path now (while it\'s known-good) -- the SYSTEM',
    '# account the task runs as may not share this session\'s PATH, so a bare',
    '# "node.exe" can silently fail to resolve at task-run-time.',
    '$NodePath = (Get-Command node).Source',
    '$Action = New-ScheduledTaskAction -Execute $NodePath -Argument "`"$BridgeDir\\responder.js`"" -WorkingDirectory $BridgeDir',
    '$Trigger = New-ScheduledTaskTrigger -AtStartup',
    '$Settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable',
    'Register-ScheduledTask -TaskName "CitinetDnsBridge" -Action $Action -Trigger $Trigger -Settings $Settings -User "SYSTEM" -RunLevel Highest -Force | Out-Null',
    'Start-ScheduledTask -TaskName "CitinetDnsBridge"',
    'Ok "DNS bridge will start automatically on every boot, and restart if it ever crashes"',
    '',
    '# === Firewall: let guests actually reach the responder + Caddy ===',
    'Step "Configuring firewall"',
    'Remove-NetFirewallRule -DisplayName "Citinet DNS Bridge" -ErrorAction SilentlyContinue',
    'Remove-NetFirewallRule -DisplayName "Citinet Guest HTTPS" -ErrorAction SilentlyContinue',
    'New-NetFirewallRule -DisplayName "Citinet DNS Bridge" -Direction Inbound -Protocol UDP -LocalPort 53 -Action Allow | Out-Null',
    'New-NetFirewallRule -DisplayName "Citinet Guest HTTPS" -Direction Inbound -Protocol TCP -LocalPort $GuestHttpsPort -Action Allow | Out-Null',
    'Ok "Firewall allows guest DNS + HTTPS traffic"',
    '',
    'Write-Host ""',
    'Write-Host "  ============================================"',
    'Write-Host "  Access point is up"',
    'Write-Host "  ============================================"',
    'Write-Host ""',
    'Write-Host "  SSID:          $ApSsid"',
    'Write-Host "  Guests go to:  https://' + config.hubHostname + '"',
    'Write-Host ""',
    'Write-Host "  Verify: Get-ScheduledTask -TaskName CitinetDnsBridge"',
    'Write-Host "          Get-NetFirewallRule -DisplayName `"Citinet*`""',
    'Write-Host ""',
    'Write-Host "  Real test: put a phone in airplane mode, turn Wi-Fi back on, join"',
    'Write-Host "  `"$ApSsid`", then open https://' + config.hubHostname + ' -- see"',
    'Write-Host "  docs/hub-wireless-reach-standard.md for the full checklist."',
    'Write-Host ""',
  ];

  return lines.join('\n');
}

/** Generates and triggers a browser download of the Windows AP setup script. */
export function downloadWindowsApSetupScript(config: WindowsApScriptConfig): void {
  const content = generateWindowsApPowerShellScript(config);
  const filename = 'citinet-ap-setup.ps1';

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

export { generateWindowsApPowerShellScript as generateWindowsApSetupScript };
