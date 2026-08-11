/**
 * Citinet Hub — User Seed Script
 * Run inside the citinet-api container:
 *   node /app/seed_users.js
 *
 * Seed password for all demo users: CitiNet2026!
 * Delete this file after seeding in production.
 */

const bcryptjs = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SEED_PASSWORD = 'CitiNet2026!';
const DICEBEAR_BASE = 'https://api.dicebear.com/7.x/initials/svg?seed=';

const USERS = [
  // ── Admins ──────────────────────────────────────────────────────────────────
  {
    username: 'maya_okonkwo', display_name: 'Maya Okonkwo',
    email: 'maya.okonkwo+seed@local.test',
    bio: 'Community tech educator and digital literacy advocate. Helping neighbors get connected since 2019.',
    profile_headline: 'Digital inclusion advocate',
    tags: ['tech', 'volunteering', 'neighborhood-watch'],
    role: 'admin', is_admin: true,
    location: 'Aberdeen, MD',
    profile_visibility: 'public',
    created_at: '2024-12-15T09:00:00Z',
  },
  {
    username: 'darnell_waters', display_name: 'Darnell Waters',
    email: 'darnell.waters+seed@local.test',
    bio: 'Software developer and local soccer coach. Believe communities work best when people actually know each other.',
    profile_headline: 'Dev by day, coach on weekends',
    tags: ['tech', 'fitness', 'food'],
    role: 'admin', is_admin: true,
    location: 'Aberdeen, MD',
    profile_visibility: 'public',
    created_at: '2024-12-20T11:30:00Z',
  },

  // ── Moderators ──────────────────────────────────────────────────────────────
  {
    username: 'priya_nair', display_name: 'Priya Nair',
    email: 'priya.nair+seed@local.test',
    bio: 'Elementary school teacher and weekend farmers market regular. Passionate about food education for kids.',
    profile_headline: 'Teacher & food community builder',
    tags: ['food', 'childcare', 'gardening'],
    role: 'moderator', is_admin: false,
    location: 'Bel Air, MD',
    profile_visibility: 'public',
    created_at: '2025-01-08T10:15:00Z',
  },
  {
    username: 'carlos_medina', display_name: 'Carlos Medina',
    email: 'carlos.medina+seed@local.test',
    bio: 'Runs a small landscaping business in Harford County. Big on tool lending and neighbor-to-neighbor skills.',
    profile_headline: 'Landscaper & tool swap organizer',
    tags: ['tools', 'gardening', 'local-business'],
    role: 'moderator', is_admin: false,
    location: 'Edgewood, MD',
    profile_visibility: 'hub',
    created_at: '2025-01-22T14:00:00Z',
  },
  {
    username: 'sasha_kowalski', display_name: 'Sasha Kowalski',
    email: 'sasha.kowalski+seed@local.test',
    bio: 'Neighborhood watch coordinator and amateur radio operator. If something\'s happening nearby, I know about it.',
    profile_headline: 'Block watch coordinator',
    tags: ['neighborhood-watch', 'volunteering', 'tech'],
    role: 'moderator', is_admin: false,
    location: 'Havre de Grace, MD',
    profile_visibility: 'hub',
    created_at: '2025-02-03T08:45:00Z',
  },
  {
    username: 'fatima_al_rashidi', display_name: 'Fatima Al-Rashidi',
    email: 'fatima.alrashidi+seed@local.test',
    bio: 'Graphic designer and community mural project volunteer. Art makes neighborhoods feel like home.',
    profile_headline: 'Designer & mural project lead',
    tags: ['art', 'volunteering', 'photography'],
    role: 'moderator', is_admin: false,
    location: 'Aberdeen, MD',
    profile_visibility: 'public',
    created_at: '2025-02-14T16:20:00Z',
  },

  // ── Members ─────────────────────────────────────────────────────────────────
  {
    username: 'josephine_lee', display_name: 'Josephine Lee',
    email: 'josephine.lee+seed@local.test',
    bio: 'Community gardener and coffee roaster. I organize weekend tool-swaps and maker meetups.',
    profile_headline: 'Local garden organizer',
    tags: ['gardening', 'food', 'volunteering'],
    role: 'member', is_admin: false,
    location: 'Aberdeen, MD',
    profile_visibility: 'hub',
    created_at: '2025-01-05T14:23:00Z',
  },
  {
    username: 'terrence_booker', display_name: 'Terrence Booker',
    email: 'terrence.booker+seed@local.test',
    bio: 'Retired firefighter, now volunteering at the local food pantry. Always happy to give someone a ride.',
    profile_headline: 'Retired FF, community first responder',
    tags: ['rides', 'volunteering', 'food'],
    role: 'member', is_admin: false,
    location: 'Joppa, MD',
    profile_visibility: 'hub',
    created_at: '2025-01-10T09:30:00Z',
  },
  {
    username: 'ling_chen', display_name: 'Ling Chen',
    email: 'ling.chen+seed@local.test',
    bio: 'Runs a small dim sum catering business out of her home kitchen. Always has extra dumplings.',
    profile_headline: 'Home caterer & food connector',
    tags: ['food', 'local-business', 'sustainability'],
    role: 'member', is_admin: false,
    location: 'Bel Air, MD',
    profile_visibility: 'public',
    created_at: '2025-01-18T11:00:00Z',
  },
  {
    username: 'rashida_thomas', display_name: 'Rashida Thomas',
    email: 'rashida.thomas+seed@local.test',
    bio: 'Middle school math teacher and chess club coach. Looking for board game nights nearby.',
    profile_headline: 'Math teacher & chess enthusiast',
    tags: ['childcare', 'tech', 'volunteering'],
    role: 'member', is_admin: false,
    location: 'Fallston, MD',
    profile_visibility: 'hub',
    created_at: '2025-01-25T15:45:00Z',
  },
  {
    username: 'miguel_reyes', display_name: 'Miguel Reyes',
    email: 'miguel.reyes+seed@local.test',
    bio: 'Bike mechanic and commuter cycling advocate. If your bike is broken, I can probably fix it.',
    profile_headline: 'Bike mechanic & cycling advocate',
    tags: ['fitness', 'tools', 'sustainability'],
    role: 'member', is_admin: false,
    location: 'Havre de Grace, MD',
    profile_visibility: 'hub',
    created_at: '2025-02-01T10:10:00Z',
  },
  {
    username: 'amber_ostrowski', display_name: 'Amber Ostrowski',
    email: 'amber.ostrowski+seed@local.test',
    bio: 'Stay-at-home mom and local crafts fair organizer. Love connecting parents and kids in the neighborhood.',
    profile_headline: 'Crafts organizer & mom of three',
    tags: ['childcare', 'art', 'food'],
    role: 'member', is_admin: false,
    location: 'Forest Hill, MD',
    profile_visibility: 'hub',
    created_at: '2025-02-08T13:20:00Z',
  },
  {
    username: 'kwame_asante', display_name: 'Kwame Asante',
    email: 'kwame.asante+seed@local.test',
    bio: 'Sound engineer and weekend DJ. Looking to connect with local musicians for community events.',
    profile_headline: 'Sound engineer & community DJ',
    tags: ['music', 'art', 'local-business'],
    role: 'member', is_admin: false,
    location: 'Aberdeen, MD',
    profile_visibility: 'public',
    created_at: '2025-02-15T18:00:00Z',
  },
  {
    username: 'nadia_petrov', display_name: 'Nadia Petrov',
    email: 'nadia.petrov+seed@local.test',
    bio: 'Yoga instructor and plant enthusiast. Hosts free meditation sessions in Millard Park.',
    profile_headline: 'Yoga teacher & plant person',
    tags: ['fitness', 'gardening', 'sustainability'],
    role: 'member', is_admin: false,
    location: 'Aberdeen, MD',
    profile_visibility: 'public',
    created_at: '2025-02-20T07:30:00Z',
  },
  {
    username: 'jerome_washington', display_name: 'Jerome Washington',
    email: 'jerome.washington+seed@local.test',
    bio: 'HVAC technician. Happy to answer questions about home heating/cooling and connect neighbors with reliable tradespeople.',
    profile_headline: 'HVAC tech & home repair guide',
    tags: ['tools', 'local-business', 'neighborhood-watch'],
    role: 'member', is_admin: false,
    location: 'Edgewood, MD',
    profile_visibility: 'hub',
    created_at: '2025-03-01T09:45:00Z',
  },
  {
    username: 'sunita_kapoor', display_name: 'Sunita Kapoor',
    email: 'sunita.kapoor+seed@local.test',
    bio: 'Pharmacist and herb garden hobbyist. Growing medicinal plants and sharing seeds with the neighborhood.',
    profile_headline: 'Pharmacist & herb gardener',
    tags: ['gardening', 'food', 'sustainability'],
    role: 'member', is_admin: false,
    location: 'Bel Air, MD',
    profile_visibility: 'hub',
    created_at: '2025-03-10T14:00:00Z',
  },
  {
    username: 'ty_mcallister', display_name: 'Ty McAllister',
    email: 'ty.mcallister+seed@local.test',
    bio: 'High school senior and aspiring web developer. Working on open-source projects and learning fast.',
    profile_headline: 'Teen dev & open source contributor',
    tags: ['tech', 'music', 'fitness'],
    role: 'member', is_admin: false,
    location: 'Aberdeen, MD',
    profile_visibility: 'hub',
    created_at: '2025-03-18T16:30:00Z',
  },
  {
    username: 'grace_osei', display_name: 'Grace Osei',
    email: 'grace.osei+seed@local.test',
    bio: 'Registered nurse and community health educator. Running free blood pressure checks at the community center.',
    profile_headline: 'RN & community health advocate',
    tags: ['volunteering', 'fitness', 'neighborhood-watch'],
    role: 'member', is_admin: false,
    location: 'Havre de Grace, MD',
    profile_visibility: 'hub',
    created_at: '2025-03-25T11:15:00Z',
  },
  {
    username: 'luca_romano', display_name: 'Luca Romano',
    email: 'luca.romano+seed@local.test',
    bio: 'Italian-American baker. Every Saturday I bring extra focaccia to the Aberdeen Farmers Market.',
    profile_headline: 'Baker & Saturday market regular',
    tags: ['food', 'local-business', 'art'],
    role: 'member', is_admin: false,
    location: 'Aberdeen, MD',
    profile_visibility: 'public',
    created_at: '2025-04-02T08:00:00Z',
  },
  {
    username: 'deanna_floyd', display_name: 'Deanna Floyd',
    email: 'deanna.floyd+seed@local.test',
    bio: 'Dog trainer and pet rescue foster mom. Currently fostering two lab mixes looking for forever homes.',
    profile_headline: 'Dog trainer & rescue foster',
    tags: ['pets', 'volunteering', 'fitness'],
    role: 'member', is_admin: false,
    location: 'Joppa, MD',
    profile_visibility: 'hub',
    created_at: '2025-04-10T13:00:00Z',
  },
  {
    username: 'omar_sheikh', display_name: 'Omar Sheikh',
    email: 'omar.sheikh+seed@local.test',
    bio: 'Urban planner working on walkability and transit improvements for Harford County.',
    profile_headline: 'Urban planner & transit advocate',
    tags: ['sustainability', 'tech', 'neighborhood-watch'],
    role: 'member', is_admin: false,
    location: 'Bel Air, MD',
    profile_visibility: 'public',
    created_at: '2025-04-18T10:30:00Z',
  },
  {
    username: 'tasha_rivers', display_name: 'Tasha Rivers',
    email: 'tasha.rivers+seed@local.test',
    bio: 'Freelance photographer. Documenting neighborhoods and the people who make them real.',
    profile_headline: 'Community documentary photographer',
    tags: ['photography', 'art', 'volunteering'],
    role: 'member', is_admin: false,
    location: 'Aberdeen, MD',
    profile_visibility: 'public',
    created_at: '2025-04-25T15:00:00Z',
  },
  {
    username: 'brendan_hayes', display_name: 'Brendan Hayes',
    email: 'brendan.hayes+seed@local.test',
    bio: 'Retired Army mechanic. Runs a small auto repair class for teens at the VFW hall.',
    profile_headline: 'Retired Army — youth auto program',
    tags: ['tools', 'volunteering', 'rides'],
    role: 'member', is_admin: false,
    location: 'Aberdeen, MD',
    profile_visibility: 'hub',
    created_at: '2025-05-03T09:00:00Z',
  },
  {
    username: 'yuki_tanaka', display_name: 'Yuki Tanaka',
    email: 'yuki.tanaka+seed@local.test',
    bio: 'UX researcher and origami teacher. Running free craft workshops at the library this fall.',
    profile_headline: 'UX researcher & craft workshop host',
    tags: ['art', 'tech', 'childcare'],
    role: 'member', is_admin: false,
    location: 'Bel Air, MD',
    profile_visibility: 'hub',
    created_at: '2025-05-12T11:45:00Z',
  },
  {
    username: 'patricia_dunbar', display_name: 'Patricia Dunbar',
    email: 'patricia.dunbar+seed@local.test',
    bio: 'Librarian and local history enthusiast. Ask me anything about Harford County since 1780.',
    profile_headline: 'Librarian & local historian',
    tags: ['volunteering', 'art', 'neighborhood-watch'],
    role: 'member', is_admin: false,
    location: 'Havre de Grace, MD',
    profile_visibility: 'hub',
    created_at: '2025-05-20T14:30:00Z',
  },
  {
    username: 'elijah_grant', display_name: 'Elijah Grant',
    email: 'elijah.grant+seed@local.test',
    bio: 'Music teacher at Edgewood High and weekend open-mic host. Building a local music scene one song at a time.',
    profile_headline: 'Music teacher & open-mic host',
    tags: ['music', 'art', 'childcare'],
    role: 'member', is_admin: false,
    location: 'Edgewood, MD',
    profile_visibility: 'public',
    created_at: '2025-06-01T10:00:00Z',
  },
  {
    username: 'ingrid_sorensen', display_name: 'Ingrid Sorensen',
    email: 'ingrid.sorensen+seed@local.test',
    bio: 'Sustainability consultant and zero-waste household challenger. Running monthly swap meets.',
    profile_headline: 'Zero-waste consultant & swap host',
    tags: ['sustainability', 'food', 'gardening'],
    role: 'member', is_admin: false,
    location: 'Forest Hill, MD',
    profile_visibility: 'hub',
    created_at: '2025-06-15T08:30:00Z',
  },
  {
    username: 'derek_sampson', display_name: 'Derek Sampson',
    email: 'derek.sampson+seed@local.test',
    bio: 'Volunteer soccer coach and youth sports coordinator. Looking for donations of used gear.',
    profile_headline: 'Youth soccer coach & sports connector',
    tags: ['fitness', 'childcare', 'volunteering'],
    role: 'member', is_admin: false,
    location: 'Aberdeen, MD',
    profile_visibility: 'hub',
    created_at: '2025-07-04T12:00:00Z',
  },
  {
    username: 'amara_diallo', display_name: 'Amara Diallo',
    email: 'amara.diallo+seed@local.test',
    bio: 'Home health aide and community caregiver. Helping seniors navigate technology one step at a time.',
    profile_headline: 'Caregiver & senior tech guide',
    tags: ['volunteering', 'tech', 'rides'],
    role: 'member', is_admin: false,
    location: 'Aberdeen, MD',
    profile_visibility: 'hub',
    created_at: '2025-07-15T09:20:00Z',
  },
  {
    username: 'steve_brubaker', display_name: 'Steve Brubaker',
    email: 'steve.brubaker+seed@local.test',
    bio: 'Plumber and volunteer coach for the youth baseball league at Baker Park.',
    profile_headline: 'Plumber & little league coach',
    tags: ['tools', 'fitness', 'local-business'],
    role: 'member', is_admin: false,
    location: 'Bel Air, MD',
    profile_visibility: 'hub',
    created_at: '2025-07-28T14:10:00Z',
  },
  {
    username: 'kezia_mwangi', display_name: 'Kezia Mwangi',
    email: 'kezia.mwangi+seed@local.test',
    bio: 'Environmental science student and creek cleanup organizer. The Susquehanna deserves better.',
    profile_headline: 'Env. science student & creek cleaner',
    tags: ['sustainability', 'volunteering', 'photography'],
    role: 'member', is_admin: false,
    location: 'Havre de Grace, MD',
    profile_visibility: 'public',
    created_at: '2025-08-10T10:45:00Z',
  },
  {
    username: 'victor_okafor', display_name: 'Victor Okafor',
    email: 'victor.okafor+seed@local.test',
    bio: 'IT support tech and board game enthusiast. Hosting monthly game nights at the community center.',
    profile_headline: 'IT support & game night host',
    tags: ['tech', 'volunteering', 'neighborhood-watch'],
    role: 'member', is_admin: false,
    location: 'Edgewood, MD',
    profile_visibility: 'hub',
    created_at: '2025-08-22T16:00:00Z',
  },
  {
    username: 'helen_cho', display_name: 'Helen Cho',
    email: 'helen.cho+seed@local.test',
    bio: 'Accountant by day, ceramics instructor by night. Teaches pottery at the Bel Air rec center.',
    profile_headline: 'Ceramicist & community art teacher',
    tags: ['art', 'food', 'local-business'],
    role: 'member', is_admin: false,
    location: 'Bel Air, MD',
    profile_visibility: 'private',
    created_at: '2025-09-05T11:30:00Z',
  },
  {
    username: 'james_oduya', display_name: 'James Oduya',
    email: 'james.oduya+seed@local.test',
    bio: 'Barber and local historian. Running a community scholarship fund from the shop.',
    profile_headline: 'Barber, mentor & scholarship founder',
    tags: ['local-business', 'volunteering', 'neighborhood-watch'],
    role: 'member', is_admin: false,
    location: 'Aberdeen, MD',
    profile_visibility: 'public',
    created_at: '2025-09-18T09:15:00Z',
  },
  {
    username: 'nina_vasquez', display_name: 'Nina Vasquez',
    email: 'nina.vasquez+seed@local.test',
    bio: 'ESL teacher and community translator. Helping immigrant families navigate local services.',
    profile_headline: 'ESL teacher & community translator',
    tags: ['childcare', 'volunteering', 'food'],
    role: 'member', is_admin: false,
    location: 'Aberdeen, MD',
    profile_visibility: 'hub',
    created_at: '2025-10-01T13:00:00Z',
  },
  {
    username: 'ryan_colbert', display_name: 'Ryan Colbert',
    email: 'ryan.colbert+seed@local.test',
    bio: 'Electrician and DIY enthusiast. Happy to help neighbors troubleshoot safe home wiring questions.',
    profile_headline: 'Licensed electrician & DIY helper',
    tags: ['tools', 'local-business', 'sustainability'],
    role: 'member', is_admin: false,
    location: 'Fallston, MD',
    profile_visibility: 'hub',
    created_at: '2025-10-15T10:00:00Z',
  },
  {
    username: 'aaliya_rahman', display_name: 'Aaliya Rahman',
    email: 'aaliya.rahman+seed@local.test',
    bio: 'Med student and weekend meal-prep volunteer. Cooking in bulk and dropping off meals for isolated seniors.',
    profile_headline: 'Med student & meal prep volunteer',
    tags: ['food', 'volunteering', 'fitness'],
    role: 'member', is_admin: false,
    location: 'Bel Air, MD',
    profile_visibility: 'hub',
    created_at: '2025-11-02T08:30:00Z',
  },
  {
    username: 'travis_mcneil', display_name: 'Travis McNeil',
    email: 'travis.mcneil+seed@local.test',
    bio: 'Freelance videographer covering local events. Looking to document neighborhood stories.',
    profile_headline: 'Local storyteller & videographer',
    tags: ['photography', 'music', 'art'],
    role: 'member', is_admin: false,
    location: 'Havre de Grace, MD',
    profile_visibility: 'public',
    created_at: '2025-11-20T15:30:00Z',
  },
  {
    username: 'dorothy_kim', display_name: 'Dorothy Kim',
    email: 'dorothy.kim+seed@local.test',
    bio: 'Retired teacher, current dog walker, and serious sudoku player. Happy to sit with elderly neighbors.',
    profile_headline: 'Retired teacher & neighborhood sitter',
    tags: ['pets', 'childcare', 'volunteering'],
    role: 'member', is_admin: false,
    location: 'Aberdeen, MD',
    profile_visibility: 'private',
    created_at: '2025-12-08T10:00:00Z',
  },
  {
    username: 'evan_fletcher', display_name: 'Evan Fletcher',
    email: 'evan.fletcher+seed@local.test',
    bio: 'Robotics club mentor at the middle school. Always on the lookout for donated electronics.',
    profile_headline: 'Robotics mentor & STEM advocate',
    tags: ['tech', 'childcare', 'tools'],
    role: 'member', is_admin: false,
    location: 'Forest Hill, MD',
    profile_visibility: 'hub',
    created_at: '2025-12-22T11:15:00Z',
  },
  {
    username: 'monique_pierre', display_name: 'Monique Pierre',
    email: 'monique.pierre+seed@local.test',
    bio: 'Haitian-American chef and cooking class host. Saturday afternoon classes in my kitchen, always free.',
    profile_headline: 'Chef & free cooking class host',
    tags: ['food', 'art', 'local-business'],
    role: 'member', is_admin: false,
    location: 'Edgewood, MD',
    profile_visibility: 'public',
    created_at: '2026-01-10T14:00:00Z',
  },
  {
    username: 'gabe_huang', display_name: 'Gabe Huang',
    email: 'gabe.huang+seed@local.test',
    bio: 'Software engineering intern and parkour hobbyist. Building apps to solve real local problems.',
    profile_headline: 'Intern dev & community app builder',
    tags: ['tech', 'fitness', 'sustainability'],
    role: 'member', is_admin: false,
    location: 'Aberdeen, MD',
    profile_visibility: 'hub',
    created_at: '2026-02-01T09:00:00Z',
  },
  {
    username: 'camille_rousseau', display_name: 'Camille Rousseau',
    email: 'camille.rousseau+seed@local.test',
    bio: 'Marketing consultant and local theatre performer. Help small businesses tell better stories.',
    profile_headline: 'Marketing consultant & theatre actor',
    tags: ['local-business', 'art', 'music'],
    role: 'member', is_admin: false,
    location: 'Bel Air, MD',
    profile_visibility: 'private',
    created_at: '2026-03-05T13:30:00Z',
  },
  {
    username: 'desmond_osei', display_name: 'Desmond Osei',
    email: 'desmond.osei+seed@local.test',
    bio: 'Physical therapist and trail runner. Organizes weekend trail runs and stretching clinics.',
    profile_headline: 'PT & trail running club organizer',
    tags: ['fitness', 'sustainability', 'volunteering'],
    role: 'member', is_admin: false,
    location: 'Havre de Grace, MD',
    profile_visibility: 'hub',
    created_at: '2026-04-12T08:00:00Z',
  },
];

async function seed() {
  console.log('\n🌱  Citinet Hub — User Seed\n');
  const hash = await bcryptjs.hash(SEED_PASSWORD, 10);
  console.log(`   Password hash generated for "${SEED_PASSWORD}"`);

  let inserted = 0;
  let skipped  = 0;

  for (const u of USERS) {
    const avatarUrl = `${DICEBEAR_BASE}${encodeURIComponent(u.username)}`;
    // Calculate a plausible updated_at (0–60 days after created_at, capped at now)
    const created  = new Date(u.created_at);
    const offset   = Math.floor(Math.random() * 60) * 24 * 60 * 60 * 1000;
    const updatedRaw = new Date(Math.min(created.getTime() + offset, Date.now()));
    const updatedAt  = updatedRaw.toISOString();

    try {
      await pool.query(
        `INSERT INTO hub_users
           (username, email, password_hash, is_admin, role,
            display_name, bio, profile_headline, tags,
            avatar_url, location, profile_visibility,
            created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (username) DO NOTHING`,
        [
          u.username,
          u.email,
          hash,
          u.is_admin,
          u.role,
          u.display_name,
          u.bio,
          u.profile_headline,
          u.tags,
          avatarUrl,
          u.location,
          u.profile_visibility,
          u.created_at,
          updatedAt,
        ]
      );
      console.log(`   ✓ ${u.display_name.padEnd(25)} [${u.role}]  ${u.location}`);
      inserted++;
    } catch (err) {
      console.error(`   ✗ ${u.username}: ${err.message}`);
      skipped++;
    }
  }

  // Verify
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)                                          AS total,
      COUNT(*) FILTER (WHERE is_admin)                 AS admins,
      COUNT(*) FILTER (WHERE role = 'moderator')       AS moderators,
      COUNT(*) FILTER (WHERE role = 'member')          AS members,
      COUNT(*) FILTER (WHERE profile_visibility='public')  AS public_profiles,
      COUNT(*) FILTER (WHERE profile_visibility='hub')     AS hub_profiles,
      COUNT(*) FILTER (WHERE profile_visibility='private') AS private_profiles
    FROM hub_users
  `);
  const s = rows[0];

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Seed complete
  Inserted : ${inserted}   Skipped (conflict): ${skipped}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Hub total users : ${s.total}
  Admins          : ${s.admins}
  Moderators      : ${s.moderators}
  Members         : ${s.members}
  Public profiles : ${s.public_profiles}
  Hub-only        : ${s.hub_profiles}
  Private         : ${s.private_profiles}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Seed password   : ${SEED_PASSWORD}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  await pool.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
