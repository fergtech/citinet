# Citizens Internet Project (Citinet)
## Local Mesh Node Application

**Digital infrastructure for hyperlocal communities. Owned by citizens, not corporations.**

## What Is Citinet?

Citizens Inter-networking, codename Citi-Net or Citinet, is a community-driven, independent network system composed of many small, locally operated "micro–data centers." These nodes communicate using open, standard Internet protocols but operate outside the control of traditional monopolies, big corporations, and large government agencies.

Citinet provides alternative layers, platforms, and digital resources that ordinary people can run, own, and use — without surveillance, centralized control, or extractive business models.

## Purpose

The purpose of Citinet is simple:
- To return digital power, data sovereignty, communication tools, and online community spaces back to citizens.
- From careful research and practical development, this will be most effectively achieved at the local level.

Today's Internet is dominated by:
- large corporations
- government agencies
- massive cloud platforms
- exploitative algorithms
- centralized data harvesting systems

Citinet provides an alternative — not by reinventing the entire Internet from scratch, but by building a new layer on top of it: **a layer owned and operated by the people who use it.**

## This Application's Role

This web portal is the **current interface prototype** for the Citinet network. It runs entirely in the browser — no installation required. It provides:

- **Hub discovery** — browse the public hub directory and join any community hub
- **Hub interface** — once connected, access your community's files, discussions, and members
- **Onboarding** — guided flow for both joining existing hubs and setting up new ones
- **Familiar, polished UX** — feels natural without surveillance or algorithmic manipulation
- **Privacy by default** — pseudonyms welcome, no tracking, local-only visibility

Community members never need to install anything. Hub operators run the hub stack (Docker Compose) on their own machine, and members access it through this web app at `{name}.citinet.xyz`.

We're not trying to reinvent how people interact with apps. We're reinventing **what those apps are for** and **who controls them.**

### What Citinet Includes

The complete Citinet ecosystem consists of:
- **Open-source or trusted web browsers**
- **Independent search options**
- **Community-hosted social networking platforms** ← *This application*
- **Decentralized messaging**
- **Peer-run email and identity systems**
- **Marketplace tools and community feeds** ← *This application*
- **Local-first data storage and file sharing**
- **Custom Citinet OS and dashboard**
- **Universal Citinet App** ← *This application*

## Technical Philosophy

Citinet operates on the principle of inter-networking — "a network of networks, freely connecting independent systems using shared protocols."

Each Citinet node is:
- independently owned
- independently configured
- independently governed

Nodes communicate as peers.

## Physical Infrastructure Vision

### Traditional Corporate/Government Data Centers
- Massive, centralized facilities
- Multi-million dollar costs
- Centralized data, power, control, surveillance

### Citinet Micro–Data Point Architecture
A hub can run on almost any hardware you already own — a spare PC, a laptop, a mini PC, or a single-board computer like a Raspberry Pi. A home server or small VPS works equally well. There's no specialized equipment required, and no custom OS to install.

**What you get:** local cloud services, social networking, messaging, file storage, community identity, and future mesh capabilities — running on hardware you own, in a space you control.

### Citinet Node Locations
- homes, apartments, dorms
- libraries, community centers
- coworking spaces, small businesses
- makerspaces, neighborhood hubs

Each becomes part of the Citinet mesh.

## Development Roadmap

1. **Phase 1 (In progress):** Local end-to-end validation — local hub services + browser portal flow
   - Local hub stack running on operator machine
   - Browser onboarding flow can connect to a reachable hub endpoint
   - User auth/onboarding works against hub API (`/api/auth/register`, `/api/auth/login`)
   - Hub interface loads with live hub context after join
2. **Phase 2 (In progress):** Core web portal foundation — hub discovery, join flow, hub interface UX
   - Two-path onboarding (join or create a hub)
   - Hub directory with registry integration
   - Subdomain-based hub routing (`{slug}.citinet.xyz`)
   - Multi-hub support via localStorage
3. **Phase 3 (Planned):** Stable hub-stack connectivity — tunnels, routing, and end-to-end reliability
   - Any gateway supported (Tailscale, Cloudflare, reverse proxy)
   - IPv4 + IPv6 hub reachability (ongoing validation)
4. **Phase 4 (Planned):** Web-based hub admin panel — manage hub settings, users, and tunnels from the browser
5. **Phase 5 (Future):** Personal node sync, federation (ActivityPub, Matrix), offline-capable hub-served web app

### Current Status (March 2026)

- **Mission 1 (active now):** Prove reliable local flow from running hub services on a system to browser connection and use through this portal.
- **Mission 2 (next):** Live web capabilities — production domain setup (`citinet.xyz`), registry/discovery reliability, and public routing hardening.
- `citinet.xyz` is purchased but not yet connected to Vercel/GitHub auto-deploy and not yet the guaranteed production entrypoint.
- End-to-end connection between the web portal and the complete Citinet stack is not yet guaranteed across all environments.

## Why Citinet Matters

Citinet enables:
- citizen-controlled data
- community-hosted spaces
- meaningful local identity
- human-centered digital experiences
- censorship-resistant content
- organic network growth
- easy digital infrastructure building

It returns independence, decentralization, locality, privacy, and public digital ownership.

## Current Features

### Phase 1 - Core Platform (Implemented Scope)
- **Two-path onboarding** — join existing network or create your own
- **Hub discovery** — browse registry-listed hubs and connect via direct hub URL
- **Node creation wizard** — step-by-step setup for new community nodes
- **Civic onboarding flow** — orientation, not signup
- **Local Commons dashboard** — see what's happening in your neighborhood
- **Chronological feed** — no algorithms, no ranking, no manipulation
- **Community discussions** — organized by type (Discussion, Announcement, Project, Request)
- **Local marketplace** — community exchange and resource sharing
- **Network status** — see active members and node health
- **Privacy by default** — pseudonyms welcome, no tracking, local-only visibility
- **Responsive design** — desktop sidebar navigation, mobile bottom bar
- **Smart routing** — URL-based navigation with browser history support
- **Persistent state** — page refreshes maintain your current location
- **In-app navigation** — back buttons on all screens, no browser chrome required
- **Multi-node support** — selected node name displayed throughout the app

### Design Philosophy: Familiar Interface, Revolutionary Purpose

**What we borrow from commercial apps:**
- Clean, modern design language (OpenAI, Meta aesthetic)
- Intuitive navigation patterns users already understand
- Mobile-first, responsive layouts
- Smooth animations and polished micro-interactions

**What we reject:**
- Algorithmic feeds designed to maximize engagement
- Surveillance-based business models
- Extractive data practices
- Corporate ownership of community infrastructure

**The result:** An app that feels as natural to use as Instagram or Twitter, but serves your actual neighbors instead of distant shareholders.

## Conclusion

Citinet is not a replacement for the physical Internet — it replaces the centralized platforms dominating it.

It transforms:
- houses → micro data centers
- neighborhoods → digital communities
- citizens → owners of their digital world

**A network of citizen-owned networks.**

This application is the interface layer that makes that vision accessible, familiar, and useful for everyday people.

---

## Software Layer Comparison

### Traditional Corporate/Government Software
Examples: AWS, Google Cloud, Azure, Microsoft 365, Gmail, Meta platforms

**These offer powerful tools but at the cost of:**
- surveillance
- data extraction
- centralized control
- dependency
- algorithmic manipulation
- censorship risks

### Citinet Software Layer
**Citinet replaces centralized accounts, social media, storage, identity, messaging, local marketplaces, and discovery.**

It provides:
- open-source apps
- community-hosted services
- P2P nodes
- encrypted messaging
- local-first feeds
- decentralized storage
- transparent governance
- local clouds

**Compatible platforms include:** Society+, Mastodon, PeerTube, ProtonMail, Nextcloud, Matrix.

---

## Getting Started

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000/` and should open automatically in your browser.

### Troubleshooting

If you see "localhost refused to connect":

1. **Check your terminal** - Look for any red error messages after "VITE ready"
2. **Try these URLs**:
   - http://localhost:3000/
   - http://127.0.0.1:3000/
   - Check the terminal for the actual port (it may use 3001, 3002, etc. if 3000 is busy)
3. **Clear the cache** - Delete `node_modules/.vite` folder and restart
4. **Check firewall** - Make sure Windows Firewall isn't blocking Node.js
5. **Run as administrator** - Try running your terminal as administrator

### Build for Production

```bash
npm run build
```

## Technology Stack

- React 18.3
- TypeScript
- Vite
- Tailwind CSS 4
- React Router DOM (navigation)
- Motion (animations)
- Lucide React (icons)
- React Slick (carousel)

## License

See ATTRIBUTIONS.md for third-party licenses and credits.

## Related Citinet Repositories

- [citinet-client](https://github.com/fergtech/citinet-client): Hub management desktop app (Windows, for hub operators)
- [citinet-info](https://github.com/fergtech/citinet-info): The informational companion site to the Citinet project
- [citinet-registry](https://github.com/fergtech/citinet-registry): Hub registry Cloudflare Worker
