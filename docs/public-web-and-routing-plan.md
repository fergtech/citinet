# Public Web Surface & Portal Routing Plan

> Status: **Deferred** — parked for future planning. Not blocking any current mission work.

---

## Background

As Citinet matures, two distinct routing concerns have emerged that need deliberate design:

1. **Portal routing cleanup** — the current `?hub=slug` query-param approach in `subdomain.ts` is functional but produces ugly URLs and complicates deep-linking.
2. **Public web surface** — hub-authenticated content (notes, files, posts, profiles) cannot currently be accessed without a hub login. A separate public-facing site (`citinet.io`) would let users publish selected content to the open web.

These are **two separate problems** and should be tackled separately.

---

## Current State

- `getSubdomain()` (`src/app/utils/subdomain.ts`) reads hub slug from `?hub=` query param or `localStorage`.
- `hubPath()` threads `?hub=slug` through every internal link.
- `navigateToHub()` hard-navigates with `?hub=slug` + a base64-encoded connection bootstrap payload.
- `AppInner` in `App.tsx` branches on `getSubdomain()` to choose hub mode vs onboarding mode.
- All hub routes (`/feed`, `/messages`, `/notes`, etc.) are authenticated — no public read surface exists.

---

## Part A — Portal Routing Cleanup (citinet.cloud)

**Goal:** Replace `?hub=slug` with `/hub/:slug` for cleaner URLs and shareable deep links.

**Scope of change:**
- `src/app/utils/subdomain.ts` — rewrite `getSubdomain`, `hubPath`, `navigateToHub`, `getHubUrl`
- `src/app/App.tsx` — move hub route tree under `/hub/:slug/*`, read slug from `useParams`
- Every call site of `hubPath()` and `navigateToHub()` across all screen components
- `HubGuard` — reads slug from route params instead of `getSubdomain()`
- `HubContext` — may need slug passed via context or router instead of global function

**Backward compatibility:**
- Keep `?hub=slug` redirecting to `/hub/:slug` for a transition period
- Vercel must be configured to serve the SPA for all `/hub/*` routes (add to `vercel.json` rewrites)

**Risk:** Medium — touches nearly every screen component. No backend changes required.

**When to do it:** After Mission 2 content features stabilize. Not blocking anything current.

---

## Part B — Public Web Surface (citinet.io)

**Goal:** Allow hub members to publish selected content to a public profile page at `citinet.io/u/:username`.

### Design principles
- Publishing is a **deliberate per-item action**, not a "make the hub public" switch.
- The public site has **no hub session** — it reads only from unauthenticated public endpoints.
- `citinet.cloud` (portal) and `citinet.io` (public web) are **separate Vercel projects**.

### What can be published first
| Content type | Current state | Public path |
|---|---|---|
| Profile bio / avatar | Already served unauthenticated at `/api/auth/avatar/:userId` | Ready |
| Posts | Private (auth required) | Add `is_public` flag |
| Notes | Private (owner-only) | Add `is_public` flag + `public_slug` |
| Files | `is_public` flag exists in DB | Add public profile aggregation |

### Backend changes needed (minimum)
1. `ALTER TABLE hub_notes ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE`
2. `ALTER TABLE hub_notes ADD COLUMN IF NOT EXISTS public_slug VARCHAR(200)`
3. `ALTER TABLE hub_posts ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE`
4. `GET /api/public/profile/:userId` — unauthenticated, returns username + bio + avatar + published items
5. `GET /api/public/notes/:slug` — unauthenticated, returns a single published note
6. `PATCH /api/notes/:id` — extend to accept `is_public` and `public_slug` fields

### Frontend changes needed
- Publish toggle in NotesScreen editor toolbar
- Publish toggle in FilesScreen item actions
- New Vercel project for `citinet.io` with routes `/u/:username` and `/u/:username/:itemSlug`
- Public profile page component (reads from public endpoints, no auth)

### DNS / hosting
- `citinet.cloud` → existing Vercel project (portal)
- `citinet.io` → new Vercel project (public web, separate codebase or monorepo package)
- No changes to hub API hosting — public endpoints added to existing `server.js`

**Risk:** Low-medium on backend (additive only). Medium on frontend (new Vercel project + shared component logic).

**When to do it:** After Spaces and profile-page-as-landing-page work in Mission 2 is settled, since the public profile model depends on what "a Citinet profile" becomes.

---

## Recommended sequence

1. Finish Mission 2 content features (Spaces depth, profile pages, federation early)
2. Tackle Part A (portal routing) as a clean-up pass — no user-facing feature, just URL hygiene
3. Tackle Part B (public web) once profile identity is stable — this is the outward-facing surface of Mission 2's "profile as personal landing page" goal

---

## Source of this plan

Synthesized from a VS Code Copilot analysis session and internal architectural review, April 2026.

