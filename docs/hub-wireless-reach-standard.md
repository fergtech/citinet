# Hub Wireless Reach Standard

A standard any hub creator can follow to let people nearby join a network and
reach their hub from a browser — no internet connection, no app install, no
router-admin work required of the visitor. This is the physical-layer
companion to the **"Local Network Only"** access mode in the `/create` wizard
("share with neighbors on your Wi-Fi").

It does not assume any specific router, access point brand, or operating
system. It describes the requirements every setup must satisfy, then gives
tiers of hardware to meet them depending on what you already own.

## The Goal

> Someone walks into range, joins a Wi-Fi network, opens a browser, and
> requests access to your hub. Once the admin approves them, they're in.

No Tailscale, no public URL, no domain, no port forwarding, no ISP
involvement. As of 2026-07-26, registration is no longer instant: the hub's
founding admin is auto-approved, but every account after that sits as
`pending` until approved from the Members tab — see the join-approval entry
in [`SECURITY.md`](../SECURITY.md). That's a deliberate trade for exactly this
scenario: reachability no longer implies automatic account access.

## The Three Requirements

Every setup, regardless of hardware, needs exactly these three things. If all
three are true, the standard is met.

1. **A Wi-Fi signal covering the area you want reachable.** Could be your
   existing router's built-in Wi-Fi, or a dedicated access point you add.
2. **Devices that join it land on a network that can reach the hub.** Either
   the same subnet the hub is on (bridged), or a separate subnet with routing
   to it. If it's a separate subnet, don't NAT it out to the internet — it
   only needs a path to the hub, nothing else.
3. **A way to find the hub without knowing its IP.** Either a router-level
   DNS/host override, or — better, and the default recommendation whenever the
   router won't allow one (most ISP-supplied gateways and mesh systems don't) —
   mDNS, so the hub resolves at `citinet.local` with no router involvement at
   all. Both are covered in
   [`router-dns-quick-reference.md`](./router-dns-quick-reference.md). If
   neither is available, fall back to sharing the raw LAN IP (already
   supported — see `HubMeta.lanIp` in `src/app/types/hub.ts`) via the join QR
   code or a printed note. Note: if you're running an access point per Tier 1
   below and multiple hubs might end up on the same broadcast domain, give
   each machine a distinct hostname rather than `citinet` for all of them, to
   avoid mDNS collisions.

Nothing about internet access, ISP terms of service, port forwarding, or
public DNS applies here. That's what makes this simpler than the Tailscale
access mode, not a lesser version of it.

## A Real Limitation: Plain HTTP

Meeting the three requirements above gets a visitor's browser to the hub, but
over plain HTTP — which has two concrete consequences worth knowing before
telling people "just join the Wi-Fi":

- **E2E encryption (messages, notes, file encryption) doesn't work off the
  hub machine.** It depends on the browser's Web Crypto API, which requires a
  secure context (HTTPS, or exactly `localhost` / `127.0.0.1`). `citinet.local`
  and LAN IPs don't qualify, so anyone connecting over Wi-Fi gets these
  features silently failing rather than degraded.
- **Login credentials and session tokens are sniffable over the air** by
  anyone else on the same Wi-Fi network — more relevant here than almost
  anywhere else in this project, since the whole point of this standard is
  letting strangers join that network.

This isn't something any tier below fixes — it's a property of serving over
plain HTTP, not a hardware or configuration gap. Current options are a
self-signed/local CA certificate (requires installing trust on every visiting
device — a poor fit for "walk in and it just works"), or treating
wireless-reach hubs as intentionally lower-trust and steering anything
encryption-sensitive toward the Tailscale access mode instead. See
[`SECURITY.md`](../SECURITY.md) for the full picture.

## Pick a Tier Based On What You Already Own

Work through these in order. Stop at the first tier that covers the area you
need — don't buy hardware for a tier you don't need yet.

### Tier 0 — Use what's already there

If the hub machine is already plugged into your home/office router and that
router's own Wi-Fi reaches the people you want to reach, you're done. Just
apply the DNS override from `router-dns-quick-reference.md`. This is the
common case for a first hub and costs nothing.

### Tier 1 — Add one access point

If Tier 0's Wi-Fi doesn't reach far enough (next room, other side of a floor,
just outside the building), add one more access point **bridged to the same
network the hub is on** — not a second router doing NAT, unless that second
router also gets the DNS override applied.

Any of these work equally well for this tier — the standard doesn't prefer
one brand:

- A spare home router flashed into AP/bridge mode
- A purpose-built AP (Ubiquiti U6 series, MikroTik hAP/OmniTik, etc.)
- A Raspberry Pi (or similar SBC) running `hostapd` + `dnsmasq`

The only hard requirement is bridging, not the specific box. If it creates
its own isolated subnet instead, you must also configure DHCP and the `citinet`
DNS override *on that device*, since it won't inherit the main network's.

### Tier 2 — Dedicated outdoor / long-range coverage

If you're trying to reach outside a single building (a yard, a street, a
second building with line of sight), you're now doing point-to-point or
sector coverage — directional outdoor gear (e.g. Ubiquiti LiteBeam for
point-to-point links, airMAX/Rocket Prism for sector coverage). Same three
requirements apply; only the radios and mounting change. This tier is a later
phase for most hub creators and should only be pursued once Tier 0/1 is
proven working indoors.

## Minimum Viable Checklist

Run through this for any hub, regardless of which tier applies:

- [ ] Hub machine has a stable/reserved LAN IP (DHCP reservation or static)
- [ ] The Wi-Fi network covering your target area is up and its password (if
      any) is easy to share
- [ ] A device joining that Wi-Fi can reach the hub's LAN IP (ping it, or load
      `http://<lanIp>:9090`)
- [ ] The `citinet` hostname resolves on that network (or the raw IP is what
      gets shared instead)
- [ ] **The no-internet test**: put a phone in airplane mode, turn Wi-Fi back
      on, join the network, and confirm the dashboard (or, for a brand-new
      account, the "waiting for approval" screen) still loads. Either one
      proves this hub needs zero internet dependency to serve people in range.
- [ ] You've read [A Real Limitation: Plain HTTP](#a-real-limitation-plain-http)
      above and made a deliberate call on whether encryption-sensitive use is
      steered elsewhere.

## What This Standard Deliberately Ignores

- ISP terms of service — not triggered, because no WAN bandwidth is being
  shared or resold. The signal only ever reaches the hub, not the internet.
- Public/static IPs, domain registration, port forwarding — none needed.
- A single prescribed hardware vendor — the requirements are protocol-level,
  not brand-level.

## Later, Not Now

Turning this into an automated setup script (parallel to `scriptGenerator.ts`
for OS setup) is a reasonable next step once this manual standard has been
proven across a couple of real hubs on different hardware. Until then, treat
this doc as the source of truth and update it as edge cases turn up in the
field.
