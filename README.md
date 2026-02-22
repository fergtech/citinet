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

This Local Mesh Node Application is the **social layer** and **user interface** for Citinet. It provides:

- **Familiar, polished UX** borrowed from apps billions already use (Meta, TikTok, Google)
- **Local ownership** and transparent governance instead of corporate control
- **Community-hosted spaces** for discussions, events, and local exchange
- **Privacy by default** — pseudonyms welcome, no tracking, local-only visibility
- **The software foundation** for physical mesh network infrastructure

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
A functional Citinet node requires only:
- 5- or 8-port network switch
- Raspberry Pi
- PC tower/workstation
- Ethernet cables
- Citinet OS
- Optional Wi-Fi extender

**This setup provides:** local cloud services, social networking, messaging, storage, hosting, community identity, admin tools, and future mesh capabilities.

### Citinet Node Locations
- homes, apartments, dorms
- libraries, community centers
- coworking spaces, small businesses
- makerspaces, neighborhood hubs

Each becomes part of the Citinet mesh.

## Development Roadmap

This application is the first step toward **decentralized hyperlocal internet infrastructure**:

1. **Phase 1 (✅ Complete):** Web-based civic platform for local communities
   - Two-path onboarding (join or create)
   - Node discovery and creation
   - Multi-node support
   - Full navigation system
2. **Phase 2 (Next):** Physical mesh network nodes that community members can install as access points
3. **Phase 3 (Future):** True peer-to-peer local internet — resilient, community-owned, surveillance-free

Users will eventually be able to set up physical nodes in their homes and businesses, creating a mesh network that provides internet access independent of traditional ISPs. This app is the social layer that makes that infrastructure meaningful and useful.

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

### Phase 1 - Core Platform (✅ Complete)
- **Two-path onboarding** — join existing network or create your own
- **Node discovery** — scan for nearby citinet nodes
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

- [citinet-client](https://github.com/fergtech/citinet-client): Installable client to allow hub creation and network contribution by users
- [citinet-info](https://github.com/fergtech/citinet-info): The informational companion site to the Citinet project
