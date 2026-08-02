/**
 * Citinet Access-Point Setup Script Generator
 *
 * Generates a bash script for a Raspberry Pi (or similar Linux SBC running
 * NetworkManager, e.g. Raspberry Pi OS Bookworm — see docs/hub-setup.md) that
 * turns it into a dedicated, isolated Wi-Fi bridge to a "Local Network Only"
 * hub: broadcasts its own AP, hands out DHCP on its own subnet, overrides DNS
 * for exactly one hostname to the hub's LAN IP, and scopes forwarding so
 * guests can reach only that hub's HTTPS port — not the internet, not the
 * rest of the LAN.
 *
 * The Pi never holds any hub secrets and never terminates TLS — that stays
 * on the hub machine itself via Caddy (see docs/hub-https-bridge.md). This
 * script only configures networking.
 *
 * See docs/hub-wireless-reach-standard.md for the physical-layer standard
 * this automates, and the approved plan this was built from.
 */

export interface ApScriptConfig {
  /** SSID guests will see and join. */
  apSsid: string;
  /** WPA2-PSK password for the AP. Must be >= 8 characters. */
  apPassword: string;
  /** The hub's LAN IP — where Caddy listens on `guestHttpsPort`. */
  hubLanIp: string;
  /** The hub's HTTPS hostname guests will type, e.g. `<hubslug>.hub.citinet.cloud`. */
  hubHostname: string;
  /** Port guests may reach on `hubLanIp`. Default 443 (Caddy's HTTPS listener). */
  guestHttpsPort?: number;
  /** Dedicated subnet for the AP's own guest network. Default '10.55.55.0/24'. */
  apSubnet?: string;
  /** Wi-Fi interface on the Pi to use as the AP radio. Default 'wlan0'. */
  wifiInterface?: string;
}

const DEFAULTS = {
  guestHttpsPort: 443,
  apSubnet: '10.55.55.0/24',
  wifiInterface: 'wlan0',
} as const;

/** Derives the gateway IP for a subnet CIDR by setting its last octet to 1 (e.g. '10.55.55.0/24' -> '10.55.55.1'). */
function deriveGatewayIp(subnetCidr: string): string {
  const [network] = subnetCidr.split('/');
  const octets = network.split('.');
  if (octets.length !== 4) throw new Error(`Invalid subnet: ${subnetCidr}`);
  octets[3] = '1';
  return octets.join('.');
}

function generateApBashScript(config: ApScriptConfig): string {
  if (config.apPassword.length < 8) {
    throw new Error('AP password must be at least 8 characters (WPA2-PSK minimum)');
  }

  const guestHttpsPort = config.guestHttpsPort ?? DEFAULTS.guestHttpsPort;
  const apSubnet = config.apSubnet ?? DEFAULTS.apSubnet;
  const wifiInterface = config.wifiInterface ?? DEFAULTS.wifiInterface;
  const apGatewayIp = deriveGatewayIp(apSubnet);
  const generatedAt = new Date().toISOString();

  const lines = [
    '#!/usr/bin/env bash',
    '# ============================================================',
    '# Citinet Access Point Setup',
    '# Bridges guests with zero internet access to hub: ' + config.hubHostname,
    '# Generated: ' + generatedAt,
    '# Run: sudo bash citinet-ap-setup.sh',
    '# ============================================================',
    '',
    'set -euo pipefail',
    '',
    'ok()   { echo "  [ok] $1"; }',
    'warn() { echo "  [!!] $1"; }',
    'err()  { echo "  [ERROR] $1" >&2; exit 1; }',
    'step() { echo ""; echo "=== $1 ==="; }',
    '',
    'AP_SSID="' + config.apSsid + '"',
    'AP_PASSWORD="' + config.apPassword + '"',
    'HUB_LAN_IP="' + config.hubLanIp + '"',
    'HUB_HOSTNAME="' + config.hubHostname + '"',
    'GUEST_HTTPS_PORT="' + guestHttpsPort + '"',
    'AP_SUBNET="' + apSubnet + '"',
    'AP_GATEWAY_IP="' + apGatewayIp + '"',
    'WIFI_IF="' + wifiInterface + '"',
    '',
    'echo ""',
    'echo "  Citinet Access Point Setup"',
    'echo "  This configures this device to broadcast a guest Wi-Fi network that"',
    'echo "  reaches ONLY your hub -- no internet required on either end after setup."',
    'echo ""',
    '',
    '# === Prerequisites ===',
    'step "Checking prerequisites"',
    'if [ "$(id -u)" -ne 0 ]; then',
    '  err "Run this script with sudo: sudo bash citinet-ap-setup.sh"',
    'fi',
    'command -v nmcli >/dev/null 2>&1 || err "nmcli not found -- this script requires NetworkManager (e.g. Raspberry Pi OS Bookworm). See docs/hub-setup.md."',
    'command -v nft >/dev/null 2>&1 || err "nft not found -- this script requires nftables (Raspberry Pi OS Bookworm default)."',
    'ok "NetworkManager + nftables present"',
    '',
    '# === Broadcast the access point ===',
    '# NetworkManager\'s "shared" ipv4 method auto-provisions its own dnsmasq',
    '# instance for DHCP + NAT on this connection -- the idiomatic approach on',
    '# NetworkManager-based systems, rather than hand-rolling hostapd.conf.',
    'step "Configuring Wi-Fi access point"',
    'nmcli radio wifi on',
    'if nmcli -t -f NAME connection show | grep -qx "citinet-ap"; then',
    '  ok "citinet-ap connection already exists -- updating it"',
    '  nmcli connection delete citinet-ap',
    'fi',
    'nmcli connection add type wifi ifname "$WIFI_IF" con-name citinet-ap autoconnect yes ssid "$AP_SSID"',
    'nmcli connection modify citinet-ap 802-11-wireless.mode ap 802-11-wireless.band bg',
    'nmcli connection modify citinet-ap wifi-sec.key-mgmt wpa-psk',
    'nmcli connection modify citinet-ap wifi-sec.psk "$AP_PASSWORD"',
    'nmcli connection modify citinet-ap ipv4.method shared',
    'nmcli connection modify citinet-ap ipv4.addresses "${AP_GATEWAY_IP}/24"',
    'nmcli connection up citinet-ap',
    'ok "Broadcasting \\"$AP_SSID\\" on $WIFI_IF"',
    '',
    '# === DNS override: this one hostname resolves to the hub, everything else',
    '# falls through to whatever upstream resolver this device has (if any). ===',
    'step "Configuring DNS override"',
    'mkdir -p /etc/NetworkManager/dnsmasq-shared.d',
    'cat > /etc/NetworkManager/dnsmasq-shared.d/citinet-hub.conf << CITINET_DNSMASQ_END',
    'address=/${HUB_HOSTNAME}/${HUB_LAN_IP}',
    'CITINET_DNSMASQ_END',
    '# Bounce the connection so NetworkManager regenerates its shared-mode dnsmasq instance',
    'nmcli connection down citinet-ap',
    'nmcli connection up citinet-ap',
    'ok "$HUB_HOSTNAME -> $HUB_LAN_IP for anyone on this AP"',
    '',
    '# === Scope guest traffic: reach the hub\'s HTTPS port, nothing else ===',
    '# Overrides NetworkManager\'s default (more permissive) shared-mode NAT with',
    '# a tighter nftables ruleset evaluated at a higher priority, so this decides',
    '# what gets forwarded before NM\'s own rules get a say.',
    'step "Scoping guest traffic to the hub only"',
    "cat > /usr/local/bin/citinet-ap-firewall.sh << 'CITINET_FIREWALL_END'",
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    'AP_IF="' + wifiInterface + '"',
    'AP_SUBNET="' + apSubnet + '"',
    'HUB_IP="' + config.hubLanIp + '"',
    'HUB_PORT="' + guestHttpsPort + '"',
    '',
    'nft add table inet citinet_ap 2>/dev/null || true',
    'nft flush table inet citinet_ap',
    "nft add chain inet citinet_ap forward '{ type filter hook forward priority -10 ; policy accept ; }'",
    'nft add rule  inet citinet_ap forward iifname "$AP_IF" ip saddr $AP_SUBNET ip daddr $HUB_IP tcp dport $HUB_PORT accept',
    'nft add rule  inet citinet_ap forward ct state established,related accept',
    'nft add rule  inet citinet_ap forward iifname "$AP_IF" drop',
    '',
    'nft add table ip citinet_ap_nat 2>/dev/null || true',
    'nft flush table ip citinet_ap_nat',
    "nft add chain ip citinet_ap_nat postrouting '{ type nat hook postrouting priority 100 ; }'",
    'nft add rule  ip citinet_ap_nat postrouting ip saddr $AP_SUBNET ip daddr $HUB_IP tcp dport $HUB_PORT masquerade',
    'CITINET_FIREWALL_END',
    'chmod +x /usr/local/bin/citinet-ap-firewall.sh',
    '/usr/local/bin/citinet-ap-firewall.sh',
    'ok "Guests on $AP_SUBNET can reach only $HUB_LAN_IP:$GUEST_HTTPS_PORT"',
    '',
    '# Make the scoping survive reboot (nftables rules are in-kernel state only)',
    'cat > /etc/systemd/system/citinet-ap-firewall.service << CITINET_SERVICE_END',
    '[Unit]',
    'Description=Citinet AP firewall scoping (guest subnet -> hub only)',
    'After=NetworkManager.service NetworkManager-wait-online.service',
    'Wants=NetworkManager-wait-online.service',
    '',
    '[Service]',
    'Type=oneshot',
    'ExecStart=/usr/local/bin/citinet-ap-firewall.sh',
    'RemainAfterExit=yes',
    '',
    '[Install]',
    'WantedBy=multi-user.target',
    'CITINET_SERVICE_END',
    'systemctl daemon-reload',
    'systemctl enable --now citinet-ap-firewall.service',
    'ok "Firewall scoping will persist across reboots"',
    '',
    '# Re-apply if the AP interface bounces (driver reset, dongle replug), not just at boot',
    'mkdir -p /etc/NetworkManager/dispatcher.d',
    "cat > /etc/NetworkManager/dispatcher.d/90-citinet-ap-firewall << 'CITINET_DISPATCH_END'",
    '#!/bin/sh',
    '[ "$1" = "' + wifiInterface + '" ] && [ "$2" = "up" ] && /usr/local/bin/citinet-ap-firewall.sh',
    'CITINET_DISPATCH_END',
    'chmod +x /etc/NetworkManager/dispatcher.d/90-citinet-ap-firewall',
    'ok "Firewall scoping will re-apply if the Wi-Fi interface bounces"',
    '',
    'echo ""',
    'echo "  ============================================"',
    'echo "  Access point is up"',
    'echo "  ============================================"',
    'echo ""',
    'echo "  SSID:      $AP_SSID"',
    'echo "  Guests go to:  https://$HUB_HOSTNAME"',
    'echo ""',
    'echo "  Verify: nmcli connection show citinet-ap"',
    'echo "          iw dev $WIFI_IF info   (should report type AP)"',
    'echo "          systemctl status citinet-ap-firewall.service"',
    'echo ""',
    'echo "  Real test: put a phone in airplane mode, turn Wi-Fi back on, join"',
    'echo "  \\"$AP_SSID\\", then open https://$HUB_HOSTNAME -- see docs/hub-wireless-reach-standard.md"',
    'echo "  for the full checklist."',
    'echo ""',
  ];

  return lines.join('\n');
}

/** Generates and triggers a browser download of the AP setup script. */
export function downloadApSetupScript(config: ApScriptConfig): void {
  const content = generateApBashScript(config);
  const filename = 'citinet-ap-setup.sh';

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

export { generateApBashScript as generateApSetupScript };
