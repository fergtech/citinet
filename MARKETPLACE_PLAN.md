# Plan: Marketplace (real) + Dashboard cleanup + Mission status

## Context
The Marketplace is the last major mocked feature in Mission 1. All data is hardcoded in
`marketplaceData.ts` / `mockVendors` — no API backend. The Dashboard also has three
hardcoded sections (Recent Activity, Upcoming Events, Community Initiatives). This plan
makes the Marketplace fully API-backed and wires the Dashboard Recent Activity to real posts.

---

## Part 1 — Marketplace: make it real

### 1a. DB tables in `api/server.js` → `initDb()`

Add two tables after `hub_featured`:

```sql
CREATE TABLE IF NOT EXISTS market_vendors (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID REFERENCES hub_users(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  category    VARCHAR(100) NOT NULL DEFAULT 'General',
  location    VARCHAR(200),
  phone       VARCHAR(50),
  email       VARCHAR(255),
  website     VARCHAR(500),
  hours       VARCHAR(200),
  cover_color VARCHAR(7)   DEFAULT '#7c3aed',
  is_active   BOOLEAN      DEFAULT TRUE,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_listings (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id     UUID REFERENCES market_vendors(id) ON DELETE CASCADE,
  title         VARCHAR(300)  NOT NULL,
  description   TEXT,
  price         DECIMAL(10,2),
  category      VARCHAR(20)   NOT NULL DEFAULT 'OTHER',
  condition     VARCHAR(10),            -- new | like-new | used (optional)
  image_file_id UUID REFERENCES hub_files(id) ON DELETE SET NULL,
  is_featured   BOOLEAN       DEFAULT FALSE,
  is_active     BOOLEAN       DEFAULT TRUE,
  created_at    TIMESTAMPTZ   DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   DEFAULT NOW()
);
```

### 1b. API routes in `api/server.js`

**Vendors:**
- `GET /api/market/vendors` — list all active vendors (auth); each row includes listing count
- `GET /api/market/vendors/:id` — vendor + listings (auth); JOIN with files for image_file_name
- `POST /api/market/vendors` — create vendor profile (auth; each user gets one unless admin)
- `PATCH /api/market/vendors/:id` — update vendor (owner or admin)
- `DELETE /api/market/vendors/:id` — soft-delete (owner or admin sets is_active=false)

**Listings:**
- `GET /api/market/listings` — all active listings (auth); optional `?category=`, `?vendor_id=`; JOINs vendor name + image file_name
- `POST /api/market/listings` — create listing (auth; must own a vendor OR be admin); optional image upload via `upload.single('image')`
- `PATCH /api/market/listings/:id` — update listing (vendor owner or admin)
- `DELETE /api/market/listings/:id` — soft-delete (vendor owner or admin)
- `POST /api/market/listings/:id/feature` — toggle is_featured (admin only)

GET /api/market/listings response shape per row:
```json
{
  "id": "uuid",
  "vendor_id": "uuid",
  "vendor_name": "Highland Brew",
  "title": "Daily Special",
  "description": "...",
  "price": 4.50,
  "category": "FOOD",
  "condition": null,
  "image_file_name": "coffee.jpg",
  "is_featured": false,
  "created_at": "..."
}
```

### 1c. New type file: `src/app/types/marketplace.ts`

```typescript
export interface MarketVendor {
  id: string;
  ownerId: string;
  ownerUsername?: string;
  name: string;
  description?: string;
  category: string;
  location?: string;
  phone?: string;
  email?: string;
  website?: string;
  hours?: string;
  coverColor: string;
  listingCount?: number;
  createdAt: string;
}

export interface MarketListing {
  id: string;
  vendorId: string;
  vendorName: string;
  title: string;
  description?: string;
  price?: number;
  category: 'FOOD' | 'SERVICES' | 'ELECTRONICS' | 'EVENTS' | 'OTHER';
  condition?: 'new' | 'like-new' | 'used';
  imageFileName?: string;
  isFeatured: boolean;
  createdAt: string;
}
```

### 1d. New service: `src/app/services/marketService.ts`

Methods:
- `getListings(hubSlug, filters?)` → `MarketListing[]`
- `getVendor(hubSlug, vendorId)` → `{ vendor: MarketVendor, listings: MarketListing[] }`
- `getVendors(hubSlug)` → `MarketVendor[]`
- `createVendor(hubSlug, data)` → `MarketVendor`
- `updateVendor(hubSlug, vendorId, data)` → void
- `createListing(hubSlug, formData)` → `MarketListing` (formData for image upload)
- `updateListing(hubSlug, listingId, data)` → void
- `deleteListing(hubSlug, listingId)` → void
- `toggleFeatured(hubSlug, listingId)` → void (admin)

Auth pattern: `hubService.getHubConnection(hubSlug)` for baseUrl + token (same as featuredService).

### 1e. Update `MarketplaceScreen.tsx`

- Remove import of `marketplaceData.ts`
- Add `useHub()` to get `currentHub`
- `useEffect` fetches `marketService.getListings(hubSlug)`
- Keep all existing filter/sort/view logic — just feed it real data
- Drop distance slider (no GPS data); keep category, price, sort
- Add "Post a Listing" button (top right, visible if user has a vendor — check via myVendor state)
- Add "Open a Store" button if user has no vendor yet
- Opens `CreateListingModal` or `CreateVendorModal` accordingly
- Remove `Home` and `Menu` buttons from header (nonfunctional cruft)

### 1f. Update `MarketItemDetailModal.tsx`

- Change prop type from `MarketItem` to `MarketListing`
- Image: `hubService.getPublicFileUrl(hubSlug, imageFileName)` (same as FeaturedCarousel)
- "Contact Seller" button: open DM with vendor owner (future — for now just show vendor name/email)
- Remove hardcoded "Highland Park" location references

### 1g. Update `VendorProfileScreen.tsx`

- Remove `mockVendors` array export (keep `Vendor` type → rename to use `MarketVendor`)
- Change props to accept `MarketVendor` + `MarketListing[]` (loaded by parent)
- Wire listing images via `hubService.getPublicFileUrl`

### 1h. Update `App.tsx` / `/vendor/:vendorId` route

Current: `VendorProfileScreen` receives mock data.
New: Fetch from `marketService.getVendor(hubSlug, vendorId)` inside the route component.

### 1i. New modal: `CreateVendorModal.tsx`

Simple form:
- Business name (required)
- Category (select: Food & Beverage, Services, Electronics, Events & Education, Health & Wellness, Arts & Crafts, Other)
- Description
- Location text (e.g., "Main Street")
- Phone, Email, Website (optional)
- Hours (optional)
- Cover color picker (6 preset colors)

Submit → `marketService.createVendor()`

### 1j. New modal: `CreateListingModal.tsx`

Steps (single form, not wizard):
- Title (required)
- Category (select)
- Price (optional — for "free" or services without fixed price)
- Condition (optional: new/like-new/used)
- Description
- Image upload (optional — file input, same pattern as post media)

Submit → `marketService.createListing()` (multipart formData)

### 1k. HubManagementScreen — add Market tab

New "Market" tab alongside Hub Info / Featured / Members.
Shows:
- List of all vendors on this hub with owner usernames
- Per-vendor: toggle active/inactive
- All listings with "Feature" toggle (admin marks sponsored listings)
- No separate "Become Sponsor" screen needed; remove that PlaceholderScreen route or update it to show "Contact your hub admin"

---

## Part 2 — Dashboard: wire Recent Activity to real posts

**File:** `src/app/components/Dashboard.tsx`

- Add `recentPosts` state (latest 3 hub_posts)
- In the existing featured `useEffect`, also fetch `hubService.listPosts(hubSlug, { limit: 3 })`
- Replace the 3 hardcoded discussion items with `recentPosts.map(post => ...)` using existing post card styling
- Clicking a recent post → `handleFeaturedPostClick(post.id)` → opens `PostDetailModal`
- **Remove** Upcoming Events section (no events table; confuses users with fake data)
- **Remove** Community Initiatives section (no initiatives table; fake data)

This cleans up the Dashboard significantly: featured carousel + recent activity (real) + sidebar navigation. The removed sections can come back as real features in Mission 2/3.

---

## Part 3 — Delete `src/app/data/marketplaceData.ts`

After all imports are removed, delete the file. Also remove `mockVendors` from `VendorProfileScreen.tsx`.

---

## Files to change

| File | Change |
|---|---|
| `api/server.js` | Add market_vendors + market_listings tables; add 10 new routes |
| `src/app/types/marketplace.ts` | NEW — MarketVendor, MarketListing types |
| `src/app/services/marketService.ts` | NEW — all market API calls |
| `src/app/components/MarketplaceScreen.tsx` | Wire to API, add create buttons, drop distance slider |
| `src/app/components/MarketItemDetailModal.tsx` | Use MarketListing type, real image URLs |
| `src/app/components/VendorProfileScreen.tsx` | Remove mockVendors, use MarketVendor |
| `src/app/components/CreateVendorModal.tsx` | NEW — create/edit vendor profile form |
| `src/app/components/CreateListingModal.tsx` | NEW — create/edit listing form with image upload |
| `src/app/components/HubManagementScreen.tsx` | Add Market tab |
| `src/app/components/Dashboard.tsx` | Wire Recent Activity to real posts, remove Events/Initiatives |
| `src/app/App.tsx` | Update VendorProfile route to fetch real data |
| `src/app/data/marketplaceData.ts` | DELETE |

---

## Verification

1. `npx tsc --noEmit` — must pass clean
2. Open Marketplace screen → shows empty state (no listings yet)
3. Create a vendor profile → vendor appears in vendor list
4. Create a listing → appears in marketplace grid with category badge
5. Upload image on listing → renders correctly from MinIO
6. Filter by category → works
7. Admin: toggle featured on listing → badge appears
8. Dashboard: Recent Activity shows real hub posts, click → PostDetailModal opens
9. Hub Management → Market tab → lists vendors and listings

---

## Mission status after this

**Mission 1 closes** — all hardcoded content gone. Only remaining gap is the hub registry
domain (`citinet.xyz`) which is operational/infra, not a code change.

**Mission 2 starts** with:
- Hub registry + production domain
- Smart re-join
- Toolkit/Atlas synced to hub API (multi-user)
- Push notifications for messages
