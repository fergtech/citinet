# MVP Review & Reimagining (Oct 2026)

Working document. It captures the outside critique of the MVP and the self-hosting model, the ideas that came out of it, where each stands in the codebase, and what the public info site (`citinet-info`) needs to say about all of it.

Status key: **Built** (working, tested) · **Built, not deployed** (tested locally, hub1 not yet updated) · **Open** (not started or only partly done).

---

## 1. The critique

An outside review of the MVP and the self-hosting aim made four objections:

1. **"Nobody will run a server."** Self-hosting has always had a tiny audience (Nextcloud, Matrix, Mastodon).
2. **"Who keeps it up, secure and backed up?"** A hub that goes down, loses files or gets breached destroys trust faster than any feature builds it. The Tailscale Funnel can silently lapse, and relay routing caps off-LAN throughput (about 2.2 MB/s).
3. **"Why not Signal, Google Drive, Discord or Nextcloud?"** Each covers a slice better today.
4. **"It can't scale."** One person's machine is a single point of failure.

The core reframe: *"owned by everyday people" is not the same as "hosted by everyday people."* Ownership is about who controls the data and the rules, not whose hardware it runs on.

| Model | Who runs it | Fit |
|---|---|---|
| Individual self-host | Each user | Almost no one will; support nightmare |
| **Community hub** | One trusted person or group per community | Natural fit for the local-community goal; the host becomes a bottleneck and liability |
| Managed hubs | Citinet or a co-op, for communities who pay | Reliable and fundable, but starts to look like a company |
| Federated | Many interoperable hubs | Resilient, hardest to build, not an MVP |

Recommendation: **community hub as the base, managed hosting as a bridge, portability as the real ownership claim** (point the app at a different hub and nothing is trapped). Answer critics by conceding first ("most people won't host, and we're not asking them to"), then reframing ("no one can lock you in"). Avoid leading with "self-hosted".

## 2. Ideas that followed

- Off-site backup, and reliability work: backups, uptime monitoring, fixing the Funnel lapse, automatic failover when the host machine is down.
- A way for hubs to update themselves from the UI when the image changes.
- Audit the hub1-only scripts: which belong in universal hub creation and management?
- Shrink `api/server.js` (about 11,800 lines) without losing function.
- Data export for a whole hub, a whole account, and parts of each.
- Portable accounts: package an account (keys and data) and move it between hubs.
- Bundle the critical gateway pieces (certs, tunnel) into the stack. A single central gateway for discovery and download is fine, as long as anyone can run and own a hub locally from it (see the upside-down-funnel principle).
- Reduce reliance on Tailscale for off-LAN reach, for example a bundled Cloudflare Tunnel.

## 3. Where each idea stands

| Idea | Status | Notes |
|---|---|---|
| Off-site backup (restic, bring-your-own remote) | Built | Opt-in; retrofitted to hub1 |
| Watchdog, restore drills, alerts, email relay config, Kuma heartbeat | Built, not deployed | Tested 2026-10-01 |
| `citinet` helper CLI (diagnose / fix / update / rollback) and `deploy-hub.ps1` | Built, not deployed | hub1 image rebuild pending; System tab has quick commands |
| Per-account and per-part data export | Built, not deployed | Zip export |
| Portable account package (encrypted `.citinet-account`) | Built, not deployed | Verified on two scratch hubs; also fixed a fresh-database init bug present since July |
| Whole-hub export | Open | Deferred until requested |
| Web dashboard redesign (mobile-style home feed) | Built | Not browser-verified |
| Initiatives renamed Projects (web and mobile text), post category shown as Proposal | Built | Internal ids and API unchanged; mobile needs a new build |
| One-click in-hub update | Open | Helper CLI and System tab are the foundation |
| Cloudflare Tunnel bundled into the stack | Open | |
| Automatic failover when the host is down | Open | |
| `server.js` split | Open | |
| hub1-only script audit | Unconfirmed | Not recorded as finished |
| Wedge behavior ("TikTok moment") | Open | Leading candidate: transparent self-governance for organizations with no tool for it (proposals and votes, mod log, files, announcements) |

## 4. Positioning (carried forward)

- Lead with the **pain** (running a community across five apps nobody controls), not the ideology. Ownership is the reassurance.
- Adoption goes **organizer-first, institution by institution**: convince one organizer (HOA, church, mutual-aid group, tenant union) and they bring their people.
- Joining must not recreate Mastodon's server-picker problem; direct hub links and QR entry are the main path, the public directory is for cold discovery only.

## 5. Info site review (`citinet-info`)

**Aesthetic:** the dark slate/violet look and neighbourhood imagery fit the product. No change needed.

**Dead code:** `FeaturesGrid`, `CitizensWeb` and `Roadmap` are not imported by `index.astro`, so their copy is not live. The live page is Hero, Movement, Network, Spaces, How it works, Quotes, Final CTA.

**Information gaps, most important first:**

1. **Ideology-first pitch.** The hero, movement section and meta description lead with "No Big Tech / No Amazon, No Google". Nothing says what a community does with Citinet. Governance appears as one line in Spaces and not in the hero.
2. **Sells self-hosting.** "Anyone can run a hub", "no sysadmin" invite the exact objection above. Missing the reframe: one organizer runs it, everyone else opens a browser.
3. **No reliability or portability story.** Backups, off-site backup, monitoring, restore drills, export, and moving between hubs are not mentioned. The end-to-end-encryption claim needs a precise scope (messages and notes yes; the AI assistant no).
4. **Stale facts.** Tailscale Funnel shown as the recommended access path; inconsistent repo links (`citinet`, `citinet-web`); "projects" post category (now Proposal) and Projects feature unnamed; mobile app absent.
5. **Roadmap out of date.** Items marked "Building" are shipped or partly live; calls, broadcasts, message search, Atlas and saved-item sync are not mentioned.
6. **Smaller:** inconsistent naming ("Citizens' Internet Project" vs Citinet); manifesto is a 2026 draft with typos; Spaces claims browsing/search engines that are not built.

**Suggested order:**
1. Rewrite hero, meta description and movement section around the utility pitch, governance first.
2. Add a "Reliable by design" block (backups, restore drills, monitoring, take your data and leave).
3. Reframe "run a hub" as "one organizer runs it, everyone else just joins".
4. Refresh the roadmap and feature list; fix the infrastructure file and repo links.

## 6. Decisions still needed

- Is governance tooling the wedge? (Recommended, not yet confirmed.)
- Do we offer managed hosting, and who runs it?
- Cloudflare Tunnel bundled by default, or stay opt-in beside Tailscale?
- Approve the info-site rewrite direction before any copy changes.
