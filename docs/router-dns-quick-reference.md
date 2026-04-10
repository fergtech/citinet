# Router DNS Quick Reference

Use this when you want `http://citinet:9090` to resolve to your CitiNet hub on the LAN.

## Goal

Map the hostname `citinet` to the hub machine's fixed LAN IP, for example:

- `citinet` -> `192.168.1.170`

That lets devices on your main Wi-Fi open `http://citinet:9090` instead of typing the raw IP.

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
- If the router cannot set a host override, use the hub IP in the QR code or switch to a router that supports LAN DNS.