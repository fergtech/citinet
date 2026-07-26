# Router DNS Quick Reference

Use this when you want `http://citinet:9090` to resolve to your Citinet hub on the LAN.

**Before you start:** many ISP-supplied routers (Xfinity xFi gateways, most
mesh systems like eero or Google Wifi, and various AT&T/Spectrum boxes) don't
expose a local DNS / host override setting at all — there's simply no menu
for it. If that's your situation, skip straight to
[**Alternative: mDNS (works with any router)**](#alternative-mdns-works-with-any-router)
below instead of hunting for a setting that doesn't exist.

## Goal

Map the hostname `citinet` to the hub machine's fixed LAN IP, for example:

- `citinet` -> `192.168.1.170`

That lets devices on your main Wi-Fi open `http://citinet:9090` instead of typing the raw IP.

## A Real Limitation of Plain HTTP

Everything in this doc gets `citinet` or `citinet.local` to resolve, but the
connection is still plain HTTP once the browser gets there. Two concrete
consequences — not theoretical ones:

- **E2E encryption breaks.** The app's message/note/file encryption runs
  entirely on the browser's Web Crypto API (`crypto.subtle`), which browsers
  only expose on secure contexts: HTTPS, or the exact hostnames `localhost` /
  `127.0.0.1`. `http://citinet.local` and `http://<lan-ip>` don't qualify, so
  encryption silently fails for anyone who isn't on the hub machine itself.
- **Auth tokens travel in the clear over the air.** Every authenticated
  request sends a Bearer token over plain HTTP. On an open Wi-Fi network,
  anyone else in range can capture it with a packet sniffer; on WPA2-PSK,
  anyone who knows the shared password and captures a handshake can too.

Nothing in this doc fixes either of those — they're inherent to plain HTTP,
not a missing setting. See [`SECURITY.md`](../SECURITY.md) for the current
state and mitigation options (a self-signed/local CA certificate, or treating
this as a known limitation of LAN-only access and reserving Tailscale/HTTPS
access for anything that needs encryption or credential protection).

## Before You Start

1. Make sure the hub has a stable LAN IP.
1. Prefer a DHCP reservation or a static IP on the hub machine.
1. Do not use the guest Wi-Fi network if it isolates clients from the LAN.

## What To Change In The Router

Look for one of these router features in the admin portal:

- Local DNS
- DNS host override
- Static DNS entry
- Host mapping
- LAN DNS

Create a record like this:

- Hostname: `citinet`
- IP address: `192.168.1.170`

If the router asks for a full domain name, try:

- `citinet.local`

## Verify It

1. Reconnect the phone or laptop to the Wi-Fi.
1. Open `http://citinet:9090` in the browser.
1. If that fails, try `http://192.168.1.170:9090`.
1. If the IP works but the hostname does not, the router DNS entry is not taking effect yet.

## Common Gotchas

- Guest SSIDs often block access to LAN devices.
- Some routers only apply DNS overrides to the primary network.
- Apple devices may cache DNS, so forgetting the Wi-Fi network and reconnecting can help.
- If the router cannot set a host override, use the hub IP in the QR code, or use the mDNS alternative below.

---

## Alternative: mDNS (works with any router)

This is the approach worth defaulting to whenever your router won't let you
add DNS entries — it doesn't touch the router at all. Devices resolve
`citinet.local` directly between each other over multicast (the same
mechanism behind Bonjour/AirPlay/Chromecast discovery), so it works identically
behind a locked-down ISP gateway, a mesh system, or anything else.

### Setup

1. **Give the hub machine the hostname `citinet`.** This makes it
   self-advertise as `citinet.local` on the LAN.
   - **Windows 10/11**: Settings → System → About → Rename this PC → `citinet`,
     then reboot. Windows has a built-in mDNS responder; just make sure the
     network profile is set to allow **Network Discovery**.
   - **macOS**: System Settings → General → Sharing → Local hostname. Bonjour
     is native, no extra install needed.
   - **Linux**: `sudo hostnamectl set-hostname citinet`, then
     `sudo apt install avahi-daemon` (if not already running).

2. **Put a reverse proxy in front of it so no port number is needed.**
   [Caddy](https://caddyserver.com/) is a good pick — one line, automatic:

   ```caddyfile
   http://citinet.local {
       reverse_proxy localhost:9090
   }
   ```

   (Use whichever port your hub actually serves on — `9090` for the standard
   bundled production image per [hub-setup.md](./hub-setup.md), or a different
   port if you're running a separate frontend process.)

3. Caddy needs to bind port 80. On Windows, run it as a service or elevated
   (and make sure nothing else — IIS, another web server — already holds port
   80). On Linux, run it under systemd or grant the binary
   `CAP_NET_BIND_SERVICE` so it doesn't need root.

4. Confirm the OS firewall allows inbound UDP 5353 (mDNS) and TCP 80 (HTTP).

### Verify It

Same as above: reconnect a device to the Wi-Fi and open `http://citinet.local`
— no port number required this time.

### Gotchas Specific to mDNS

- **Still LAN-scoped.** mDNS doesn't cross subnets, VLANs, or router-imposed
  client isolation any more than a DNS override would — the same guest-network
  gotcha above still applies.
- **Android/Chrome `.local` resolution is inconsistent.** macOS and iOS
  resolve `.local` natively and reliably (Bonjour is built into the OS).
  Android's support is spottier — test on an actual Android device before
  relying on this as the only way in. If it doesn't resolve, fall back to
  sharing the raw LAN IP for those visitors (see `HubMeta.lanIp` in
  `src/app/types/hub.ts`).
- **Name collisions.** If two Citinet hubs end up on the same broadcast
  domain and both machines are named `citinet`, mDNS resolution becomes
  ambiguous. Not a concern for a single home hub, but matters if you're
  layering in an access point per
  [hub-wireless-reach-standard.md](./hub-wireless-reach-standard.md) — pick a
  more specific hostname (e.g. `citinet-oakst`) if overlap is possible.
