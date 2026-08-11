/**
 * Citinet Hub — Marketplace + Profile Enhancement Seed
 *
 * What this does:
 *  1. Updates all existing users with better avatar URLs (pravatar.cc),
 *     profile headlines (for any that are null), and gradient banners.
 *  2. Creates 6 vendor pages + their listings by authenticating as each
 *     vendor owner through the hub API (localhost:9090).
 *
 * Run inside the citinet-api container:
 *   node /app/seed_marketplace.js
 */

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BASE = 'http://127.0.0.1:9090';
const SEED_PASSWORD = 'CitiNet2026!';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function apiPost(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function login(username) {
  const data = await apiPost('/api/auth/login', { username, password: SEED_PASSWORD });
  return data.token;
}

function log(msg) { process.stdout.write(msg + '\n'); }

// ─── Banner gradients (cycling palette) ─────────────────────────────────────
const GRADIENTS = [
  { from: '#6366f1', to: '#8b5cf6' }, // indigo → violet
  { from: '#10b981', to: '#14b8a6' }, // emerald → teal
  { from: '#f59e0b', to: '#f97316' }, // amber → orange
  { from: '#3b82f6', to: '#06b6d4' }, // blue → cyan
  { from: '#f43f5e', to: '#ec4899' }, // rose → pink
  { from: '#7c3aed', to: '#4f46e5' }, // violet → indigo
  { from: '#0ea5e9', to: '#6366f1' }, // sky → indigo
  { from: '#84cc16', to: '#10b981' }, // lime → emerald
];

// ─── Vendor + listing definitions ───────────────────────────────────────────
const VENDORS = [
  {
    owner: 'luca_romano',
    vendor: {
      name: "Romano's Bake Shop",
      description: "Artisan sourdough, focaccia, and seasonal pastries baked in small batches every Saturday morning. Pickup at the Aberdeen Farmers Market or arrange local delivery.",
      category: 'Food & Beverage',
      contact_email: 'luca.romano+vendor@local.test',
      contact_phone: '(410) 555-0181',
      hours: 'Sat 7am–1pm (Farmers Market) · Orders close Thu night',
      banner_mode: 'gradient',
      banner_gradient_from: '#f59e0b',
      banner_gradient_to: '#f97316',
    },
    listings: [
      {
        title: 'Sourdough Country Loaf',
        description: 'Classic 2lb sourdough boule with a crackly crust and open crumb. Baked Friday, pickup Saturday. Nut-free kitchen.',
        category: 'Food',
        price_type: 'fixed',
        price: 9.00,
        condition: null,
      },
      {
        title: 'Rosemary & Sea Salt Focaccia',
        description: 'Half-sheet pan focaccia with fresh rosemary and flaky sea salt. Great for sandwiches or a dinner table centerpiece.',
        category: 'Food',
        price_type: 'fixed',
        price: 11.00,
        condition: null,
      },
      {
        title: 'Cinnamon Roll 4-Pack',
        description: 'Brioche-style cinnamon rolls with cream cheese icing. Pre-order only — closes Thursday at 8pm.',
        category: 'Food',
        price_type: 'fixed',
        price: 14.00,
        condition: null,
      },
    ],
  },
  {
    owner: 'miguel_reyes',
    vendor: {
      name: 'Millard Cycles',
      description: "Bike repairs, tune-ups, and trail consultations right here in Havre de Grace. Seventeen years wrenching. Commuters and trail riders welcome.",
      category: 'Services',
      contact_email: 'miguel.reyes+vendor@local.test',
      contact_phone: '(410) 555-0137',
      hours: 'Mon–Fri 4pm–8pm · Sat 9am–3pm',
      banner_mode: 'gradient',
      banner_gradient_from: '#10b981',
      banner_gradient_to: '#0ea5e9',
    },
    listings: [
      {
        title: 'Full Tune-Up',
        description: 'Cable tension, brake adjustment, derailleur indexing, wheel true, and clean/lube drivetrain. Most bikes 1–2 days turnaround.',
        category: 'Services',
        price_type: 'fixed',
        price: 55.00,
        condition: null,
      },
      {
        title: 'Flat Tire Repair (Walk-In)',
        description: 'Tube replacement while you wait — usually under 20 minutes. Road and MTB sizes in stock.',
        category: 'Services',
        price_type: 'fixed',
        price: 16.00,
        condition: null,
      },
      {
        title: 'Used Trek FX2 Commuter (2019)',
        description: 'Well-maintained city commuter, medium frame. New cables and brake pads this spring. Pick up Havre de Grace.',
        category: 'Goods',
        price_type: 'negotiable',
        price: 285.00,
        condition: 'Good',
      },
    ],
  },
  {
    owner: 'nadia_petrov',
    vendor: {
      name: 'Petrov Wellness Studio',
      description: "Hatha and restorative yoga classes in-person at Millard Park and online. All levels welcome. Sliding scale pricing available — no one turned away.",
      category: 'Wellness',
      contact_email: 'nadia.petrov+vendor@local.test',
      hours: 'Tue & Thu 6:30pm · Sat 9am (park, weather permitting)',
      banner_mode: 'gradient',
      banner_gradient_from: '#7c3aed',
      banner_gradient_to: '#ec4899',
    },
    listings: [
      {
        title: 'Drop-In Group Class',
        description: '75-minute hatha or restorative class at Millard Park (or online in bad weather). Bring your own mat.',
        category: 'Services',
        price_type: 'fixed',
        price: 14.00,
        condition: null,
      },
      {
        title: '10-Class Pass',
        description: 'Best value for regulars. Passes never expire. Use for any group class — in-person or online.',
        category: 'Services',
        price_type: 'fixed',
        price: 110.00,
        condition: null,
      },
      {
        title: 'Private 1-on-1 Session',
        description: '60-minute private session focused on your goals — injury recovery, flexibility, stress. In-home or at the park.',
        category: 'Services',
        price_type: 'fixed',
        price: 60.00,
        condition: null,
      },
    ],
  },
  {
    owner: 'kwame_asante',
    vendor: {
      name: 'Kwame Sound & Events',
      description: "Professional sound engineering and DJ services for community events, block parties, church functions, and private gatherings across Harford County.",
      category: 'Arts & Entertainment',
      contact_email: 'kwame.asante+vendor@local.test',
      contact_phone: '(410) 555-0193',
      hours: 'Available weekends + evenings · Book at least 2 weeks out',
      banner_mode: 'gradient',
      banner_gradient_from: '#1e1b4b',
      banner_gradient_to: '#6d28d9',
    },
    listings: [
      {
        title: 'Event Sound Setup & Op (4 hrs)',
        description: 'PA system, mics, monitors, and live sound operation for up to 200-person outdoor events. Setup/teardown included.',
        category: 'Services',
        price_type: 'fixed',
        price: 250.00,
        condition: null,
      },
      {
        title: 'DJ Set (4 hrs)',
        description: 'Mixed open-format DJ set — house, R&B, hip-hop, Afrobeats, or custom playlist. Bring your own requests.',
        category: 'Services',
        price_type: 'fixed',
        price: 320.00,
        condition: null,
      },
      {
        title: 'PA System Rental (daily)',
        description: '2 powered mains, subwoofer, 2 mics + stands, cables. Self-pickup in Aberdeen. Damage deposit required.',
        category: 'Services',
        price_type: 'fixed',
        price: 90.00,
        condition: null,
      },
    ],
  },
  {
    owner: 'sunita_kapoor',
    vendor: {
      name: "Sunita's Herb Garden",
      description: "Medicinal herbs, culinary plants, and heirloom seeds grown right here in Bel Air. Everything organically tended. Great for beginners — I include a care card with every plant.",
      category: 'Goods',
      contact_email: 'sunita.kapoor+vendor@local.test',
      hours: 'Pickup by appointment · Message to arrange',
      banner_mode: 'gradient',
      banner_gradient_from: '#059669',
      banner_gradient_to: '#84cc16',
    },
    listings: [
      {
        title: 'Culinary Herb Seed Packet Collection',
        description: 'Six seed packets: basil, parsley, cilantro, chives, dill, and oregano. Heirloom, open-pollinated. Enough for a full kitchen garden.',
        category: 'Goods',
        price_type: 'fixed',
        price: 9.00,
        condition: 'New',
      },
      {
        title: 'Potted Lavender (4" pot)',
        description: 'English lavender starts, ready to transplant. Deer-resistant, drought-tolerant. Pick up Bel Air.',
        category: 'Goods',
        price_type: 'fixed',
        price: 7.00,
        condition: 'New',
      },
      {
        title: 'Medicinal Herb Starter Kit',
        description: 'Echinacea, lemon balm, holy basil, and calendula seedlings in individual 3" pots with care cards. Excellent immune and stress support garden.',
        category: 'Goods',
        price_type: 'fixed',
        price: 28.00,
        condition: 'New',
      },
      {
        title: 'Custom Herb Consultation (30 min)',
        description: 'Not sure what to grow for your space or health goals? Let\'s talk. Virtual or in-person Bel Air. Free for first-time buyers.',
        category: 'Services',
        price_type: 'free',
        price: null,
        condition: null,
      },
    ],
  },
  {
    owner: 'tasha_rivers',
    vendor: {
      name: 'Tasha Rivers Photography',
      description: "Documentary and portrait photography for events, families, and community projects across Aberdeen and Harford County. I tell neighborhood stories through honest, unposed images.",
      category: 'Arts & Entertainment',
      contact_email: 'tasha.rivers+vendor@local.test',
      website: null,
      hours: 'Weekends + select weekday evenings · Book 1–2 weeks ahead',
      banner_mode: 'gradient',
      banner_gradient_from: '#1e3a5f',
      banner_gradient_to: '#0ea5e9',
    },
    listings: [
      {
        title: 'Community Event Coverage (3 hrs)',
        description: 'Full event documentation — candids, group shots, detail photos. 60+ edited images delivered via private gallery within 5 business days.',
        category: 'Services',
        price_type: 'fixed',
        price: 175.00,
        condition: null,
      },
      {
        title: 'Family Portrait Session (1 hr)',
        description: 'Outdoor lifestyle portraits at a location of your choice. 25 edited images, digital download. Rain rescheduled at no charge.',
        category: 'Services',
        price_type: 'fixed',
        price: 85.00,
        condition: null,
      },
      {
        title: 'Print Package — 5 images',
        description: 'Professional print lab prints: five 5×7s from your gallery. Mailed or local pickup Aberdeen.',
        category: 'Arts & Crafts',
        price_type: 'fixed',
        price: 45.00,
        condition: null,
      },
    ],
  },
];

// ─── Phase 1: Update user avatars + banners ──────────────────────────────────

async function updateProfiles() {
  log('\n── Phase 1: Profile enhancements ──────────────────────────────────────');

  const { rows: users } = await pool.query(
    `SELECT id, username, display_name FROM hub_users ORDER BY created_at`
  );

  // Pravatar uses any string hash for `u=` param → deterministic portrait photo
  // DiceBear personas gives illustrated avatars as an alternative fallback
  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    const gradient = GRADIENTS[i % GRADIENTS.length];
    const avatarUrl = `https://i.pravatar.cc/150?u=${encodeURIComponent(u.username)}`;

    await pool.query(
      `UPDATE hub_users
       SET avatar_url = $1,
           banner_mode = 'gradient',
           banner_gradient_from = $2,
           banner_gradient_to = $3
       WHERE id = $4`,
      [avatarUrl, gradient.from, gradient.to, u.id]
    );
    process.stdout.write('  ✓ ' + u.display_name + '\n');
  }
  log(`  Updated ${users.length} users with pravatar.cc avatars + gradient banners`);
}

// ─── Phase 2: Vendors + listings ────────────────────────────────────────────

async function seedMarketplace() {
  log('\n── Phase 2: Vendors & listings ─────────────────────────────────────────');

  let totalVendors = 0;
  let totalListings = 0;

  for (const entry of VENDORS) {
    const { owner, vendor: vendorPayload, listings } = entry;

    // Authenticate as the owner
    let token;
    try {
      token = await login(owner);
    } catch (err) {
      log(`  ✗ Login failed for ${owner}: ${err.message}`);
      continue;
    }

    // Create vendor
    let vendor;
    try {
      vendor = await apiPost('/api/vendors', vendorPayload, token);
      log(`  ✓ Vendor: "${vendor.name}" (${vendorPayload.category}) — @${owner}`);
      totalVendors++;
    } catch (err) {
      log(`  ✗ Vendor creation failed for @${owner}: ${err.message}`);
      continue;
    }

    // Create listings
    for (const listing of listings) {
      try {
        const created = await apiPost('/api/marketplace/listings', listing, token);
        log(`      + "${created.title}" · ${listing.price_type}${listing.price != null ? ' $' + listing.price.toFixed(2) : ''}`);
        totalListings++;
      } catch (err) {
        log(`      ✗ Listing "${listing.title}": ${err.message}`);
      }
    }
  }

  return { totalVendors, totalListings };
}

// ─── Phase 3: Verification ───────────────────────────────────────────────────

async function verify() {
  log('\n── Verification ────────────────────────────────────────────────────────');

  const { rows: [v] } = await pool.query(`
    SELECT
      COUNT(DISTINCT hv.id)                              AS vendors,
      COUNT(hl.id)                                        AS listings,
      COUNT(hl.id) FILTER (WHERE hl.is_active)           AS active_listings,
      COUNT(DISTINCT hl.category)                        AS categories
    FROM hub_vendors hv
    LEFT JOIN hub_listings hl ON hl.vendor_id = hv.id
  `);

  const { rows: cats } = await pool.query(`
    SELECT category, COUNT(*) AS n FROM hub_listings GROUP BY category ORDER BY n DESC
  `);

  const { rows: avatarCheck } = await pool.query(`
    SELECT COUNT(*) AS with_avatar FROM hub_users WHERE avatar_url IS NOT NULL
  `);

  log(`  Vendors total          : ${v.vendors}`);
  log(`  Listings total         : ${v.listings}  (active: ${v.active_listings})`);
  log(`  Listing categories     : ${cats.map(c => `${c.category}(${c.n})`).join(', ')}`);
  log(`  Users with avatar_url  : ${avatarCheck[0].with_avatar}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log('\n🌱  Citinet Hub — Marketplace Seed\n');

  await updateProfiles();
  const { totalVendors, totalListings } = await seedMarketplace();
  await verify();

  log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Done
  Vendors created  : ${totalVendors}
  Listings created : ${totalListings}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Avatar service : pravatar.cc (deterministic by username)
  Banners        : gradient mode, 8-colour cycling palette
  Listing images : not uploaded (image_file_name = null)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  await pool.end();
}

main().catch(err => { console.error(err); pool.end(); process.exit(1); });
