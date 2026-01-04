# CITINET — Highland Park Local Commons

**Digital infrastructure for hyperlocal communities. Owned by neighbors, not corporations.**

## Vision

CITINET meets users where they are — with familiar, polished UX patterns borrowed from the apps billions already use (Meta, TikTok, Google, Amazon). But it offers something fundamentally different: **local ownership, transparent governance, and freedom from algorithmic manipulation.**

We're not trying to reinvent how people interact with apps. We're reinventing **what those apps are for** and **who controls them.**

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

## The Long-Term Vision

This MVP is the first step toward **decentralized hyperlocal internet infrastructure**:

1. **Phase 1 (Current):** Web-based civic platform for local communities
2. **Phase 2:** Physical mesh network nodes that community members can install as access points
3. **Phase 3:** True peer-to-peer local internet — resilient, community-owned, surveillance-free

Users will eventually be able to set up physical nodes in their homes and businesses, creating a mesh network that provides internet access independent of traditional ISPs. This app is the social layer that makes that infrastructure meaningful and useful.

## Current Features

- **Civic onboarding flow** — orientation, not signup
- **Local Commons dashboard** — see what's happening in your neighborhood
- **Chronological feed** — no algorithms, no ranking, no manipulation
- **Community discussions** — organized by type (Discussion, Announcement, Project, Request)
- **Network status** — see active members and node health
- **Privacy by default** — pseudonyms welcome, no tracking, local-only visibility
- **Responsive design** — desktop sidebar navigation, mobile bottom bar

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
- Motion (animations)
- Lucide React (icons)
- React Slick (carousel)

## License

See ATTRIBUTIONS.md for third-party licenses and credits.
