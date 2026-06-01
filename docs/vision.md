# Citinet — Vision & Roadmap

> *A community-owned digital commons. Built by the people, for the people.*

---

## What Citinet Is

Citinet is a self-hosted community platform that gives neighborhoods, towns, and regions their own digital home base — independent of Big Tech platforms, corporate algorithms, and centralized data ownership.

It is not a replacement for the internet. It is a place that belongs to a community the same way a community center, a local newspaper, or a neighborhood co-op belongs to a community. You can still use Google, YouTube, and Instagram. But when you want to know what is happening in your neighborhood, trade with your neighbors, organize local initiatives, share resources, or simply connect with the people around you — there is a place that is *yours*, governed by *you*, that no corporation can monetize, moderate, or shut down on your behalf.

The data lives on hardware your community controls. The rules are set by your community. The value stays in your community.

---

## Where We Are Now — Mission 1

The foundation is built and functional. A community can stand up a hub today.

**What works right now:**
- Hub creation wizard (self-hosted via Tailscale, runs on hardware as modest as a Raspberry Pi)
- Join and discovery — find and connect to nearby hubs
- Feed and discussions — fully API-backed community forum
- Atlas — community map with member and place pins
- Toolkit / Discover — local resource directory with dynamic categories
- Network map — live member presence via OpenStreetMap + Leaflet
- Hub Management — admin tools for identity, members, and featured content
- Featured carousel — pinned posts and media on the hub dashboard
- Marketplace / Exchange — vendor profiles and listings
- Files — personal and shared file storage
- Messages — direct messaging between hub members
- Notification badges — real-time unread counts on the dashboard
- Reply-to-reply — threaded community conversation with @mention and scroll-to-reference
- Online presence — live "who's here now" count based on recent activity
- Hub registry — automatic self-registration when a hub goes public
- Profile customization — banner, avatar, headline, bio, links

**The current stack:**
- Frontend: React + Vite + TypeScript + Tailwind (deployed on Vercel, or self-hostable)
- Hub API: Node.js + Express + PostgreSQL + MinIO (runs in Docker)
- Access: Tailscale funnel for secure public HTTPS without port forwarding
- Registry: GitHub-backed JSON updated via Vercel serverless function

---

## Near Term — Mission 2

The focus shifts from foundation to depth and federation.

**Spaces** — sub-communities within a hub, similar to channels or rooms. A hub for Baltimore could have a Space for Sandtown, a Space for Charles Village, a Space for local gardeners. Each Space has its own feed, its own members, its own identity — all within the same hub.

**Profile pages as personal landing pages** — transforming user profiles from a simple post feed into a genuine personal homepage. Your profile on Citinet should feel like *your corner of the web* — customizable, expressive, and representative of who you are and what you contribute to the community. Not an algorithm-ranked feed. A page you own.

**Hub-to-hub federation (early)** — two hubs in the same region should be able to share selected content. A marketplace listing on hub1 should be visible to users on hub2. A community-wide announcement should be able to cross hub boundaries. This is the beginning of the regional network feeling without requiring everyone to be on the same server.

**Hub app ecosystem** — third-party developers building integrations (events, payments, mutual aid tools, local news aggregators) that plug into Citinet hubs via the open hub-app contract. The platform becomes extensible without becoming centralized.

---

## Medium Term — Mission 3

**Full federation protocol** — hubs become peers, not just servers. A signed, append-only event model lets hubs exchange community objects (posts, listings, pins, identities) with cryptographic authorship and conflict resolution. A user's identity becomes portable across hubs. This is Citinet's answer to ActivityPub — purpose-built for local community rather than global social media.

**Local-first and offline-capable** — the app works even when the upstream internet connection is degraded or temporarily unavailable. Core features (feed, messages, files, marketplace) continue to function within the local network. Sync catches up when connectivity returns.

**Search** — a local search index that covers your hub's posts, marketplace, files, and member profiles. Not a web crawler. Not powered by a third party. Your community's knowledge, searchable by your community.

**AI integration (local and optional)** — lightweight language model inference running on hub hardware or a trusted local node. Useful for things like summarizing discussions, drafting posts, or answering questions about community resources. Entirely opt-in, entirely local, no data leaving your network.

---

## Long Term — The Bigger Vision

This is where Citinet becomes something larger than a platform.

### A Citizens' Web

The current internet is technically decentralized but practically centralized. A handful of companies own the infrastructure, the identity systems, the content distribution, and the monetization layer. Users are the product. Communities have no leverage.

Citinet's long-term arc is toward a genuinely citizen-owned web — where the network itself, not just the software running on it, belongs to the people using it.

### Community Wireless Infrastructure

Internet service providers are a chokepoint. A community that owns its connectivity owns its future. The path there is real and proven — it is how rural electric co-ops brought power to communities that private utilities ignored, and it is how community wireless ISPs operate today in cities and towns across the country.

**The model:**
- A cooperative gateway node: one site with stable power, a compliant business-grade internet uplink, and outdoor radios
- Point-to-point backhaul links between rooftop relay sites across the neighborhood
- Sector antennas at each relay serving dozens of nearby homes via CPE radios or local Wi-Fi
- Users connect to their nearest access point the same way they connect to any Wi-Fi — nothing special required on their device

This is not science fiction. Ubiquiti and MikroTik hardware makes this buildable for a few hundred to a few thousand dollars per site. Community wireless ISPs in cities like Detroit, New York, and Baltimore are already doing this. Citinet is designed to run on top of exactly this kind of infrastructure.

**The legal path:**
Operating as a private member network or formal cooperative avoids consumer ISP resale restrictions. Cost-sharing among members funds operations. Transparency and simple governance — published costs, open financials, an acceptable use policy — are what separate a community network from an informal arrangement that creates liability.

### The Hybrid Network Model

Citinet hubs will support multiple transport modes so communities are not dependent on any single infrastructure path:

| Mode | Description | Use case |
|---|---|---|
| `public-tunnel` | Tailscale funnel (current default) | Easy setup, works over any internet |
| `public-https` | Direct domain + reverse proxy | Self-managed public access |
| `community-gateway` | Co-op relay / community wireless | Neighborhood-owned backhaul |
| `local-island` | LAN only, no internet required | Offline / blackout operation |
| `mesh-bridge` | LoRa / Meshtastic side channel | Emergency signals, presence beacons |

As connectivity improves, mode selection is automatic. As connectivity degrades, the hub gracefully steps down to what is available. The community keeps operating.

### Capability Tiers

Not every link is broadband. Citinet should work across the spectrum:

| Tier | Link type | Available features |
|---|---|---|
| Full | Broadband (fiber, cable, WISP) | Everything |
| Reduced | Intermittent or slow IP | Text, small images, async sync — no heavy media |
| Minimal | LoRa / Meshtastic only | Short messages, status beacons, emergency alerts |

### True Mesh at the Application Layer

Beyond connectivity, Citinet hubs will eventually communicate directly with each other as peers — not through a central coordinator, not through a registry, but through a gossip-style protocol where hubs announce themselves, exchange signed event streams, and maintain a regional view of the network without any single point of control or failure.

This is the application-layer mesh: hubs as autonomous nodes in a graph, each owning its data, each capable of operating independently, each able to share selectively with neighbors it trusts.

---

## Guiding Principles

These do not change across missions.

**Data sovereignty.** Community data lives on community hardware. No third party has access to it, can mine it, or can hold it hostage.

**Graceful degradation.** Every feature should fail gracefully. If the internet is down, the local community still functions. If one hub is unreachable, others continue. The platform never presents a dead end.

**Openness without obligation.** The hub-app protocol is open. Anyone can build integrations. No one has to ask permission or pay a platform fee. The ecosystem grows by contribution, not by gatekeeping.

**Local first.** The unit of value is the neighborhood, the town, the region. Global reach is optional and federation-based. The community closest to you is the one that matters most.

**Owned by no one, belonging to everyone.** Citinet the software is open source. Citinet hubs are owned by whoever runs them. The network that emerges from connected hubs is owned collectively, governed locally, and accountable to the people who use it — not to shareholders, advertisers, or platform operators.

---

## The One-Sentence Version

> Citinet is what the web was supposed to be: yours.

