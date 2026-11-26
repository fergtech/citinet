# Local HTTPS / TLS Plan for Offline Hubs

> Status: **Planned** — parked for a future phase. Not blocking current work.

---

## Problem

Hubs accessed via `http://citinet:9090` on a local network show a browser "connection is not secure" warning. This erodes member trust and is a real risk if credentials are submitted over unencrypted HTTP — even on a network the hub operator controls.

The Tailscale tunnel (`https://hub2.tail42ec5e.ts.net`) solves this for internet-connected hubs, but CitiNet is designed to support **fully offline community hubs** where no internet connection exists. Those hubs need a local-only TLS solution.

---

## Proposed Solution — Local CA + Caddy Reverse Proxy

### How it works

1. On first run, the hub generates a **local Certificate Authority (CA)** — a self-signed root cert unique to each hub.
2. A **Caddy** reverse proxy container uses that CA to issue a cert for the `citinet` hostname and any local mDNS names (e.g. `hub.local`).
3. Caddy listens on **port 443** (HTTPS) and proxies to `citinet-api` on port 9090 internally.
4. The hub serves the CA cert for download at a well-known path (e.g. `http://citinet:9090/ca.crt`).
5. Members install the CA cert on their device **once** — after that, `https://citinet` shows the padlock with no warnings, fully offline, forever.

### Member onboarding flow (one-time per device)

1. Connect to the hub's network
2. Visit `http://citinet` (or scan a QR code)
3. Follow the one-time prompt: "Install the hub's security certificate"
4. Download and install `ca.crt`
5. From then on, `https://citinet` works with a valid padlock — no warnings

This is the same mechanism corporate Wi-Fi uses for internal HTTPS. It's a 30-second step for members.

---

## Implementation Checklist

- [ ] Write a `gen-ca.sh` script (runs once at hub setup) that generates:
  - A local CA key + self-signed root cert (`ca.key`, `ca.crt`)
  - A hub cert signed by that CA for `citinet`, `hub.local`, and the hub's mDNS name
  - Stores both under `~/citinet-hub/data/certs/`
- [ ] Add a `citinet-proxy` Caddy container to `docker-compose.yml`:
  - Mounts the certs directory
  - Listens on port 443, proxies to `citinet-api:9090`
  - Configured via a `Caddyfile` that uses the pre-generated cert (no ACME/internet needed)
- [ ] Expose `GET /ca.crt` on the API (or serve it statically via Caddy) so members can download it
- [ ] Add a "Install security certificate" prompt/step to the hub welcome/onboarding flow in the portal
- [ ] Update `hub-setup.md` to document the cert install step for operators and members
- [ ] Update `docker-compose.yml` port mapping: expose 443 externally, keep 9090 internal only

---

## Notes

- The CA cert is not sensitive — it's safe to serve over HTTP since it only lets the hub identify itself, not decrypt traffic from other sources.
- Each hub gets a unique CA so there's no cross-hub trust issue.
- This works completely air-gapped — no Let's Encrypt, no internet dependency.
- Caddy is the right tool here: minimal config, handles TLS termination cleanly, and has an official Alpine image that fits the existing stack.
