/**
 * Citinet Hub — Feed, Atlas & Polls Seed
 *
 * Phases:
 *  1. Feed — 30 posts across all 5 categories, with threaded replies
 *  2. Atlas — 20 community pins across Aberdeen/Harford County
 *  3. Polls — 4 active community polls + realistic vote distributions
 *
 * Run inside the citinet-api container:
 *   node /app/seed_content.js
 */

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BASE = 'http://127.0.0.1:9090';
const SEED_PASSWORD = 'CitiNet2026!';

// ─── Helpers ────────────────────────────────────────────────────────────────

const tokenCache = {};

async function apiPost(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function token(username) {
  if (tokenCache[username]) return tokenCache[username];
  const data = await apiPost('/api/auth/login', { username, password: SEED_PASSWORD });
  tokenCache[username] = data.token;
  return data.token;
}

// Inserts a post directly (bypasses multipart, no media) then patches created_at
async function createPost(username, category, title, body, extras = {}) {
  const tok = await token(username);
  const post = await apiPost('/api/posts', { category, title, body, ...extras }, tok);
  if (extras.created_at) {
    await pool.query(
      `UPDATE hub_posts SET created_at = $1, updated_at = $1 WHERE id = $2`,
      [extras.created_at, post.id]
    );
  }
  return post;
}

async function createReply(username, postId, body) {
  const tok = await token(username);
  return apiPost(`/api/posts/${postId}/replies`, { body }, tok);
}

async function createPin(username, lat, lng, title, description, category) {
  const tok = await token(username);
  return apiPost('/api/atlas/pins', { latitude: lat, longitude: lng, title, description, category }, tok);
}

async function createPoll(username, question, options, closesInDays = 14) {
  const tok = await token(username);
  const closes_at = new Date(Date.now() + closesInDays * 86400000).toISOString();
  return apiPost('/api/polls', { question, options, closes_at }, tok);
}

async function vote(username, pollId, option_index) {
  const tok = await token(username);
  return apiPost(`/api/polls/${pollId}/vote`, { option_index }, tok).catch(() => {});
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

function log(msg) { process.stdout.write(msg + '\n'); }

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1 — FEED
// ═══════════════════════════════════════════════════════════════════════════

const POSTS = [

  // ── ANNOUNCEMENTS ──────────────────────────────────────────────────────────
  {
    user: 'maya_okonkwo', category: 'ANNOUNCEMENT', daysAgo: 95,
    title: 'Welcome to the Genesis Hub — you\'re home.',
    body: `This is our community's own corner of the internet. No ads, no algorithm, no corporate landlord telling us what to see. Just neighbors.\n\nA few things to know:\n\n• Your profile is visible to hub members only by default — you control that.\n• The Exchange tab is where you can list goods and services with your neighbors.\n• The Atlas is a live community map — drop a pin on anything useful.\n\nSay hello in this thread, and let us know what you're hoping to get out of the hub. Welcome.`,
  },
  {
    user: 'darnell_waters', category: 'ANNOUNCEMENT', daysAgo: 78,
    title: 'Community Cleanup — Millard Park — Saturday June 14',
    body: `We're doing a cleanup of Millard Park this Saturday, June 14 starting at 9am. Bags and gloves provided — just show up.\n\nWe'll be focusing on the south trail corridor and the drainage ditch near the parking lot. Should take about 2 hours, then we'll have coffee and bagels after.\n\nBring: sturdy shoes, sun protection, good mood.\nMeet at: the main pavilion off Aldino Road.\n\nAll ages and abilities welcome. Kids are great at this — they spot stuff adults walk past.`,
  },
  {
    user: 'brendan_hayes', category: 'ANNOUNCEMENT', daysAgo: 62,
    title: 'Tool Lending Library is open — VFW Hall, Tuesdays 4–7pm',
    body: `It's official. The community tool lending library is up and running at the VFW Hall on Bel Air Road, every Tuesday from 4pm to 7pm.\n\nCurrently in stock:\n• Circular saw, jigsaw, orbital sander\n• Drill press, router table\n• Pressure washer (weekend checkout available)\n• Basic hand tool kits\n• Ladder sets (6ft, 10ft, extension)\n\nHow it works: show up, leave your name and phone number, borrow for up to 5 days. No fee, just bring it back clean.\n\nIf you have a tool you want to donate to the library, drop it off any Tuesday or message me directly. Thank you to everyone who already donated.`,
  },
  {
    user: 'kezia_mwangi', category: 'ANNOUNCEMENT', daysAgo: 44,
    title: 'Creek cleanup results + save the date for Round 2',
    body: `We pulled 340 lbs of trash from a 1.2-mile stretch of Swan Creek last month. Tires, construction debris, fast food containers going back years — all out.\n\nPhotos are up in Files if you want to see before/after.\n\nRound 2 is scheduled for July 19. We'll go further upstream this time and focus on the culvert area near Route 155. Bring waders if you have them.\n\nThank you to the 14 people who showed up in the rain. You're the ones.`,
  },
  {
    user: 'nadia_petrov', category: 'ANNOUNCEMENT', daysAgo: 30,
    title: 'Free yoga in the park every Saturday — all levels',
    body: `Every Saturday at 9am I'm running a free community yoga session at Millard Park (the flat area near the south pavilion).\n\nNo experience needed. We do about 45 minutes of gentle movement and breathing — accessible for beginners and older adults. Bring a mat if you have one; I have two spares.\n\nIn bad weather (heavy rain or thunder) I move it online — I'll post here by 7:30am Saturday if that happens.\n\nJust show up. No sign-up, no fee, no judgment.`,
  },

  // ── DISCUSSIONS ─────────────────────────────────────────────────────────────
  {
    user: 'omar_sheikh', category: 'DISCUSSION', daysAgo: 88,
    title: 'Thoughts on the Route 40 bike lane proposal?',
    body: `The county's transportation committee is reviewing a proposal to add a protected bike lane on Route 40 between Aberdeen and Havre de Grace. The public comment period is open until June 30.\n\nI've been following this for a while. The current design is good but there are two intersections (at Aldino and at the truck route) that still feel dangerous in the renders.\n\nAnyone here planning to submit a comment? Would be good to coordinate — individual comments get counted but a consistent message across multiple people carries more weight with the committee.`,
  },
  {
    user: 'josephine_lee', category: 'DISCUSSION', daysAgo: 74,
    title: 'Composting in a small yard or apartment — what actually works?',
    body: `I've tried three different compost setups over the past two years. The big open bin was a mess (raccoons). The tumbler was too small. The worm bin actually works great for kitchen scraps but I have no idea what to do with the castings since my garden is tiny.\n\nAnyone doing composting at a small scale? I'm especially curious if anyone has tried bokashi or drop-off compost sites in the area. Would love to compare notes.`,
  },
  {
    user: 'sasha_kowalski', category: 'DISCUSSION', daysAgo: 66,
    title: 'Porch light program — who\'s in?',
    body: `I've been reading about "porch light programs" where neighbors agree to keep outdoor lights on during certain hours so the block feels less isolated at night. Helps with visibility, signals that people are home and paying attention.\n\nNot a formal neighborhood watch thing — no meetings, no patrols, just lights and the understanding that if something looks off, you call it in.\n\nWho on the hub lives on or near a poorly-lit stretch and might be interested? Would be good to map it out on the Atlas.`,
  },
  {
    user: 'terrence_booker', category: 'DISCUSSION', daysAgo: 58,
    title: 'Carpooling for Aberdeen Farmers Market — anyone interested?',
    body: `The Saturday market is great but parking is getting tight and half the people I know coming from Edgewood and Joppa are all driving separately.\n\nI have room for two more in my truck on Saturday mornings. Leave from the Joppa ShopRite parking lot around 8am, back by noon usually.\n\nIf there's enough interest I can help set up a recurring carpooling thread or we can just coordinate week-to-week in the messages here.`,
  },
  {
    user: 'rashida_thomas', category: 'DISCUSSION', daysAgo: 50,
    title: 'After-school options for middle schoolers — what\'s actually good?',
    body: `I teach at the middle school and I get this question constantly from parents. What's actually available for 6th-8th graders in Aberdeen/Bel Air after 3pm?\n\nI know about the rec center programs but the wait lists are long. Looking for community-run options — tutoring, sports, arts, anything really.\n\nIf you run something or know of something, please reply here. I'll compile the list and share it with parents.`,
  },
  {
    user: 'patricia_dunbar', category: 'DISCUSSION', daysAgo: 42,
    title: 'Is anyone running a local book club or reading group?',
    body: `The library used to host one but it went quiet during COVID and never really came back. I've been looking for a small group — 6-10 people, meets monthly, no pressure to have finished the book.\n\nI'm most interested in local history, social nonfiction, and literary fiction but I'm flexible. Not looking to organize it myself but happy to participate and help keep it going.`,
  },
  {
    user: 'jerome_washington', category: 'DISCUSSION', daysAgo: 35,
    title: 'Any recommendations for reliable local roofers?',
    body: `Had a section of fascia blow off in the last storm. Not an emergency but I need it sorted before fall. I've already had one quote that seemed way too high and one contractor who didn't show for the estimate.\n\nLooking for someone local who's done work in the neighborhood and won't disappear after deposit. Happy to return the favor with HVAC questions — that's my trade.`,
  },
  {
    user: 'grace_osei', category: 'DISCUSSION', daysAgo: 27,
    title: 'Free blood pressure checks — community center, every 3rd Wednesday',
    body: `Starting this month I'm doing free blood pressure and BMI checks at the Aberdeen Community Center on the third Wednesday of each month, 5–7pm.\n\nNo appointment needed, takes about 5 minutes, I'll give you a written record to share with your doctor if you want one.\n\nHigh blood pressure affects a lot of people in this neighborhood and often goes undetected. This is just a low-barrier way to check in with your numbers. Come alone, bring a neighbor, bring your teenager. Everyone welcome.`,
  },
  {
    user: 'helen_cho', category: 'DISCUSSION', daysAgo: 19,
    title: 'Ceramics workshop at Bel Air rec center — feedback wanted',
    body: `I've been running an intro to hand-building ceramics class at the Bel Air rec center for the last 6 weeks. Last class is this Sunday.\n\nFor the fall session I'm thinking about splitting it into a beginner track and a continuing track for people who want to work on specific projects. Would that be useful? Or is it better to keep one open class?\n\nAlso — anyone interested in a kids version? Ages 10+ could handle it.`,
  },

  // ── EVENTS ──────────────────────────────────────────────────────────────────
  {
    user: 'elijah_grant', category: 'EVENT', daysAgo: 55,
    title: 'Monthly Open Mic Night — Aberdeen Community Center — June 20',
    body: `This is the third one and it keeps getting better. Open mic at the Aberdeen Community Center, Friday June 20, doors at 7pm, music starts at 7:30.\n\nAll genres, all skill levels. We've had original songs, covers, spoken word, and one guy did a harmonica set that brought the house down. Sign up at the door — 5 minute slots, 10 minute slots for bands.\n\nFree to attend. Tip jar for performers. I'll have the PA and monitors set up. Bring a dish to share if you want — last time someone brought a full tray of jerk chicken and it was gone in 10 minutes.`,
    event_date: '2026-06-20T19:00:00Z',
    event_location: 'Aberdeen Community Center, 18 Howard St, Aberdeen MD',
  },
  {
    user: 'monique_pierre', category: 'EVENT', daysAgo: 38,
    title: 'Free cooking class — Haitian home cooking, June 28',
    body: `I'm hosting a free Saturday cooking class on June 28, 2pm at my home in Edgewood. We'll be making pikliz (spicy pickled slaw), diri ak djon djon (black mushroom rice), and griot (fried pork) — a full traditional spread.\n\nCapacity is 8 people. Message me to reserve a spot. All ingredients provided. Bring an appetite and a container to take leftovers home.\n\nI want to do these monthly. Different dishes each time. If you want to teach one — your cuisine, your kitchen — reach out.`,
    event_date: '2026-06-28T14:00:00Z',
    event_location: 'Edgewood, MD (address shared on registration)',
  },
  {
    user: 'victor_okafor', category: 'EVENT', daysAgo: 22,
    title: 'Board Game Night — Community Center — July 5',
    body: `Monthly board game night is back! Saturday July 5, 6pm at the Aberdeen Community Center meeting room (the one past the gym).\n\nI'm bringing: Ticket to Ride, Wingspan, Codenames, Sushi Go, and Catan. Bring your own if you have a favorite.\n\nGood for all ages — we had kids down to about 8 playing last time (Sushi Go is great for kids). Usually runs until 9:30 or 10.\n\nNo signup needed, just show up.`,
    event_date: '2026-07-05T18:00:00Z',
    event_location: 'Aberdeen Community Center — meeting room B',
  },
  {
    user: 'desmond_osei', category: 'EVENT', daysAgo: 15,
    title: 'Trail Run — Susquehanna State Park — July 12',
    body: `Early morning trail run at Susquehanna State Park. July 12, meet at the Rock Run Mill parking lot at 7am.\n\nWe'll do the blue trail loop — about 6 miles with 400ft elevation. Mixed terrain, some roots and rocks, manageable for intermediate runners. We run together but at your own pace — no one gets left behind.\n\nAfterward there's usually a coffee run to the spot in Havre de Grace.\n\nMessage me if you want to come so I have a headcount. All paces welcome.`,
    event_date: '2026-07-12T07:00:00Z',
    event_location: 'Susquehanna State Park — Rock Run Mill parking lot',
  },
  {
    user: 'evan_fletcher', category: 'EVENT', daysAgo: 8,
    title: 'Kids Robotics Demo Day — Forest Hill Middle School — July 19',
    body: `The robotics club I mentor is having an open demo day on July 19, 1–4pm at Forest Hill Middle School. The gym will be set up with obstacle courses, a sumo ring, and a line-following challenge.\n\nKids ages 8-18 can bring their own bots or just come to watch and try building with our spare kits. Parents very welcome — we always need more adult mentors and this is a good way to see what we do.\n\nNo registration needed. Just show up. Free.`,
    event_date: '2026-07-19T13:00:00Z',
    event_location: 'Forest Hill Middle School Gymnasium',
  },

  // ── PROJECTS ─────────────────────────────────────────────────────────────────
  {
    user: 'fatima_al_rashidi', category: 'PROJECT', daysAgo: 72,
    title: 'Community mural project — Aberdeen Ave underpass',
    body: `The underpass on Aberdeen Avenue has been covered in tags and graffiti for years. The city has painted over it three times. Instead of painting it grey again I want to pitch a community mural — something that actually represents the neighborhood.\n\nI'm a graphic designer and I've done two public murals before (one in Baltimore, one in Bel Air). I can lead the design and painting process. What I need from the community:\n\n1. Support letters for the permit application\n2. Input on the theme and imagery (a survey is coming)\n3. Volunteers for the painting days\n4. Any connections to local business sponsorship for paint/supplies\n\nThis is a real project with a real timeline. If we start the permit process now we could be painting in September.`,
  },
  {
    user: 'carlos_medina', category: 'PROJECT', daysAgo: 60,
    title: 'Community garden expansion — Baker Park — looking for co-organizers',
    body: `The existing community garden at Baker Park has a waiting list of 14 people. The city has offered us the adjacent plot but we need to demonstrate enough community interest and volunteer capacity to maintain it.\n\nI'm coordinating the expansion project. What's needed:\n\n• 3-4 co-organizers to share the workload\n• A weekend build day to install raised beds (I'll supply tools and material list)\n• At least 8 people willing to commit to one maintenance shift per month\n\nThis is not a huge lift — the current garden basically runs itself once it's set up. The expansion is about clearing the space and building 6 new beds.\n\nIf you want a plot, this is how to make it happen.`,
  },
  {
    user: 'nina_vasquez', category: 'PROJECT', daysAgo: 45,
    title: 'Multilingual resource guide for new residents — need contributors',
    body: `A lot of families moving into the area don't know what services exist or how to access them — especially if English isn't their first language. I've started building a resource guide (Spanish and English to start) covering:\n\n• Schools and enrollment\n• Medical and dental clinics\n• Food assistance programs\n• Legal aid and tenant rights\n• Library services\n• Community programs for kids\n\nI need people who can:\n- Review content for accuracy (anyone who works in local services)\n- Translate sections into Haitian Creole, Tagalog, or Korean\n- Format the final document\n- Help distribute it (laundromats, churches, community centers)\n\nThis doesn't require a lot of time — even one afternoon of reviewing a section helps.`,
  },
  {
    user: 'ty_mcallister', category: 'PROJECT', daysAgo: 28,
    title: 'Youth tech mentorship — looking for mentors and students',
    body: `I'm a high school senior who's been learning web development for two years, mostly self-taught. I want to start a small peer mentorship thing where teens who know tech stuff can teach it to other teens who want to learn.\n\nI'm thinking:\n• Monthly meetups at the library (they have computers)\n• Skills covered: HTML/CSS, Python basics, phone app design, game development\n• Ages 13-18, free, no prior experience needed\n• Mentors are teens or young adults — not just adults telling kids what to do\n\nI need: at least 3 other mentors (teens or adults) and a first group of 6-8 students. Can also use adult support for logistics and chaperoning.\n\nIf you're a teen who codes, please reach out. This is more useful if we run it ourselves.`,
  },

  // ── REQUESTS ─────────────────────────────────────────────────────────────────
  {
    user: 'gabe_huang', category: 'REQUEST', daysAgo: 20,
    title: 'Looking to borrow a pipe wrench and a drain snake',
    body: `Got a slow kitchen drain that's graduated to a completely stopped kitchen drain. I have a plunger. I do not have a drain snake or a pipe wrench.\n\nWilling to borrow for a day, return clean. Happy to trade — I can help with web stuff, tech questions, or I'll bring coffee.`,
  },
  {
    user: 'ling_chen', category: 'REQUEST', daysAgo: 14,
    title: 'Need help moving a sofa Saturday — trading homemade dumplings',
    body: `I have a full-size sectional sofa that needs to go from a second floor apartment to a storage unit about a mile away. Saturday July 6, morning, should take 2 hours maximum with 3 people.\n\nIn exchange I will make you a ridiculous quantity of dumplings. I'm talking 60+ dumplings per helper, frozen and ready to take home. Worth it, I promise.`,
  },
  {
    user: 'dorothy_kim', category: 'REQUEST', daysAgo: 9,
    title: 'Looking for a dog walker for 2 weeks in July',
    body: `I'll be visiting family July 14-28 and my dog (Miso — 7yr old beagle mix, very chill, good on leash) needs a midday walk Monday through Friday.\n\nLooking for someone reliable who lives nearby in Aberdeen. Happy to pay fair rate. Miso is easy, she just needs to get out for 30 minutes or so. I can do a meet-and-greet before I leave.`,
  },
  {
    user: 'amber_ostrowski', category: 'REQUEST', daysAgo: 5,
    title: 'Spanish tutor for my 9-year-old — anyone know someone?',
    body: `My son is in 3rd grade and his school offers Spanish starting in 4th. He's interested in learning now and I'd like to find him a tutor — ideally a native speaker, once a week, conversational and fun rather than textbook-heavy.\n\nWe're in Forest Hill. Happy to do it at our house or somewhere neutral. Budget is around $30-40/session.`,
  },
];

// ─── Replies — keyed by post title ──────────────────────────────────────────

const REPLIES = {
  'Welcome to the Genesis Hub — you\'re home.': [
    { user: 'josephine_lee',  body: 'So glad this exists. I\'ve been trying to find a good way to connect with neighbors for years and everything else felt either too formal or just Facebook.' },
    { user: 'terrence_booker', body: 'First thing I did was look at the Atlas — really cool to see where everyone is. Didn\'t realize there were this many people already in the area.' },
    { user: 'priya_nair',     body: 'This is exactly what I needed. Thank you for building it. Can\'t wait to see what the Exchange looks like once people start listing things.' },
    { user: 'carlos_medina',  body: 'Been waiting for something like this. Looking forward to connecting people with my tool library and garden project here.' },
  ],
  'Community Cleanup — Millard Park — Saturday June 14': [
    { user: 'kezia_mwangi',   body: 'I\'ll be there. Should I bring my own trash grabbers? I have extras.' },
    { user: 'darnell_waters', body: '@kezia_mwangi yes please bring them! We can always use more.' },
    { user: 'grace_osei',     body: 'Coming with my two kids. They love this kind of thing.' },
    { user: 'miguel_reyes',   body: 'I\'ll come by at least for the first hour. Bringing my sister.' },
  ],
  'Thoughts on the Route 40 bike lane proposal?': [
    { user: 'miguel_reyes',   body: 'I\'ve been biking that stretch for 3 years. The Aldino intersection is genuinely dangerous — cars coming off the ramp don\'t slow down. I submitted a comment specifically about that.' },
    { user: 'ingrid_sorensen', body: 'Would it help to organize a group comment submission? I can help draft something that addresses the intersection concerns specifically.' },
    { user: 'omar_sheikh',    body: '@ingrid_sorensen that would be great. Let\'s connect — I have the design documents and can walk through what\'s currently proposed vs. what needs to change.' },
    { user: 'desmond_osei',   body: 'The trail run group uses a section of this regularly. Happy to add our perspective from the pedestrian/runner side too.' },
    { user: 'gabe_huang',     body: 'This is exactly the kind of project I got interested in Citinet for. Real local impact, real decision-making timeline.' },
  ],
  'Composting in a small yard or apartment — what actually works?': [
    { user: 'sunita_kapoor',  body: 'Worm bins are the move for small spaces. The castings are incredible for container plants — I mix mine with regular soil at about 1:4 ratio. What size is your garden?' },
    { user: 'josephine_lee',  body: '@sunita_kapoor mostly containers on a 6ft balcony. I\'ve been putting the castings on my herb pots and they love it but I\'m running out of pots fast.' },
    { user: 'ingrid_sorensen', body: 'Aberdeen runs a free composting drop-off at the transfer station on Route 543 — Saturdays 8-noon. Not widely advertised but it\'s been running for two years.' },
    { user: 'carlos_medina',  body: 'The community garden at Baker Park has a communal compost pile. You can contribute and take finished compost — open to members. I\'m working on expanding access.' },
  ],
  'Carpooling for Aberdeen Farmers Market — anyone interested?': [
    { user: 'deanna_floyd',   body: 'Yes! I\'m in Joppa and have been driving alone for months. Saturdays 8am works perfectly.' },
    { user: 'aaliya_rahman',  body: 'I\'d love this. Trying to reduce my car trips. I\'m in Bel Air though — is that too far for the pickup?' },
    { user: 'terrence_booker', body: '@aaliya_rahman Bel Air is doable if we leave a little earlier. I can map a route — send me a message.' },
  ],
  'Community mural project — Aberdeen Ave underpass': [
    { user: 'kwame_asante',   body: 'I\'m 100% in. I have connections with a few local businesses who might be willing to sponsor materials. Let me make some calls.' },
    { user: 'tasha_rivers',   body: 'I can document the whole process — before, during, unveiling. Would make a great piece for a local paper pitch too.' },
    { user: 'elijah_grant',   body: 'Happy to write a support letter. I know a few people at the county arts office who might be able to fast-track the permit.' },
    { user: 'fatima_al_rashidi', body: 'This response is exactly what I was hoping for. Starting a group message with everyone interested — check your messages.' },
  ],
  'Monthly Open Mic Night — Aberdeen Community Center — June 20': [
    { user: 'kwame_asante',   body: 'I\'ll be there early to help with PA setup. You need any additional speakers for the room?' },
    { user: 'travis_mcneil',  body: 'I\'ll be filming with a handheld rig. Anyone performing who doesn\'t want to be on camera, let me know beforehand and I\'ll keep it off you.' },
    { user: 'camille_rousseau', body: 'I\'ve been wanting to try spoken word in front of people for about two years. This feels like the right place to finally do it.' },
    { user: 'elijah_grant',   body: '@camille_rousseau yes. Just do it. The open mic crowd is the nicest possible audience.' },
  ],
  'Free yoga in the park every Saturday — all levels': [
    { user: 'desmond_osei',   body: 'I\'ll come this week. Fair warning: my hamstrings are basically concrete at this point.' },
    { user: 'nadia_petrov',   body: '@desmond_osei that\'s exactly what this is for. See you Saturday.' },
    { user: 'grace_osei',     body: 'I brought my mom last week — she\'s 68 and said it was the best she\'d felt in months. Thank you for doing this.' },
    { user: 'aaliya_rahman',  body: 'Is there shade? Asking for my pale self.' },
    { user: 'nadia_petrov',   body: '@aaliya_rahman yes — we set up under the pavilion overhang. Plenty of shade.' },
  ],
  'Multilingual resource guide for new residents — need contributors': [
    { user: 'priya_nair',     body: 'I can review the school enrollment section — I deal with it every year from the teacher side and know where families get confused.' },
    { user: 'monique_pierre', body: 'I speak Haitian Creole fluently. Happy to translate whatever you need. This is a real gap — I went through this when I first moved here.' },
    { user: 'amara_diallo',   body: 'I work in home health so I know the medical/social services landscape pretty well. Can review that section and add things that aren\'t obvious.' },
    { user: 'nina_vasquez',   body: 'This response is incredibly encouraging. Starting a shared document this week — I\'ll post a link here when it\'s ready.' },
  ],
  'Looking to borrow a pipe wrench and a drain snake': [
    { user: 'brendan_hayes',  body: 'Both of those are in the tool library at VFW. Come by Tuesday 4-7pm.' },
    { user: 'gabe_huang',     body: '@brendan_hayes perfect, thank you!' },
    { user: 'ryan_colbert',   body: 'If the snake doesn\'t do it and it turns out to be something further in the line, message me. I do plumbing referrals and can probably save you from a bad contractor.' },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2 — ATLAS PINS
// ═══════════════════════════════════════════════════════════════════════════

// Coordinates are real Harford County / Aberdeen area locations
const PINS = [
  // POI
  { user: 'carlos_medina',   lat: 39.5098, lng: -76.1674, title: 'Baker Park Community Garden',            desc: 'Active community garden with 18 raised beds. Waiting list open. Contact Carlos to join.',                   cat: 'poi'  },
  { user: 'brendan_hayes',   lat: 39.5073, lng: -76.1710, title: 'VFW Hall — Tool Lending Library',        desc: 'Free tool lending every Tuesday 4-7pm. Saws, drills, ladders, pressure washer and more.',                cat: 'poi'  },
  { user: 'luca_romano',     lat: 39.5120, lng: -76.1665, title: 'Aberdeen Farmers Market',                desc: 'Every Saturday 7am-1pm. Local produce, baked goods, crafts. Parking off Bel Air Ave.',                    cat: 'meetup' },
  { user: 'patricia_dunbar', lat: 39.5389, lng: -76.0872, title: 'Havre de Grace Public Library',          desc: 'Community programs, free Wi-Fi, quiet study spaces. Open Mon-Sat.',                                       cat: 'poi'  },
  { user: 'elijah_grant',    lat: 39.5085, lng: -76.1690, title: 'Aberdeen Community Center',              desc: 'Open mic nights, board games, community events. Check the hub Events tab for schedule.',                  cat: 'meetup' },
  { user: 'victor_okafor',   lat: 39.5078, lng: -76.1722, title: 'Aberdeen Community Center — Meeting Room B', desc: 'Board game nights monthly, free to attend.',                                                         cat: 'meetup' },
  { user: 'nadia_petrov',    lat: 39.5102, lng: -76.1680, title: 'Millard Park — South Pavilion',          desc: 'Free yoga every Saturday 9am. Flat grassy area, shaded pavilion. All levels welcome.',                   cat: 'meetup' },
  { user: 'desmond_osei',    lat: 39.5775, lng: -76.0866, title: 'Susquehanna State Park — Rock Run Mill', desc: 'Trail run meetup spot. Blue trail is 6mi. Beautiful in the morning.',                                     cat: 'meetup' },
  { user: 'kezia_mwangi',    lat: 39.5491, lng: -76.0847, title: 'Swan Creek Cleanup Zone',                desc: 'Active restoration stretch. 340lbs of trash removed in May. Next cleanup July 19.',                        cat: 'poi'  },
  { user: 'grace_osei',      lat: 39.5090, lng: -76.1695, title: 'Aberdeen Community Center — Health Checks', desc: 'Free blood pressure checks 3rd Wednesday 5-7pm. Nurse Grace Osei.',                                  cat: 'poi'  },
  // Infrastructure
  { user: 'omar_sheikh',     lat: 39.5140, lng: -76.1742, title: 'Route 40 / Aldino Rd Intersection — Safety concern', desc: 'Dangerous merge point — cars from the ramp don\'t yield. Public comment open until June 30.', cat: 'infrastructure' },
  { user: 'miguel_reyes',    lat: 39.5455, lng: -76.0911, title: 'Missing sidewalk — Otsego St',            desc: '200ft gap in sidewalk forces pedestrians into the road. Reported to county March 2026, still pending.',     cat: 'infrastructure' },
  { user: 'sasha_kowalski',  lat: 39.5480, lng: -76.0960, title: 'Havre de Grace — Unlit alley, Franklin St', desc: 'Long dark stretch between Franklin and Union. Worth knowing about if you walk here at night.',           cat: 'safety' },
  { user: 'jerome_washington', lat: 39.5095, lng: -76.1655, title: 'Pothole cluster — Aberdeen Ave near underpass', desc: 'Three significant potholes. Reported to SHA, no ETA on repair. Avoid right lane.',              cat: 'infrastructure' },
  // Safety
  { user: 'sasha_kowalski',  lat: 39.5067, lng: -76.1698, title: 'Safe zone — Aberdeen 7-Eleven (24hr)',   desc: '24-hour lit location, good to know as a safe stop if you feel unsafe walking at night.',                   cat: 'safety' },
  { user: 'terrence_booker', lat: 39.5088, lng: -76.1730, title: 'Flood-prone area — Route 40 near overpass', desc: 'This section floods fast in heavy rain. Avoid during storms — water can be deeper than it looks.',    cat: 'avoid'  },
  { user: 'darnell_waters',  lat: 39.5110, lng: -76.1701, title: 'Speed camera zone — Philadelphia Rd',    desc: 'Active speed camera. 40mph zone, camera positioned past the curve. Just a heads up.',                      cat: 'safety' },
  // Food + services
  { user: 'monique_pierre',  lat: 39.4139, lng: -76.2955, title: 'Monique\'s Kitchen — cooking classes (Edgewood)', desc: 'Free monthly cooking classes, Haitian cuisine. Message Monique to register.',                  cat: 'poi'  },
  { user: 'sunita_kapoor',   lat: 39.5201, lng: -76.3474, title: 'Sunita\'s Herb Garden (Bel Air)',         desc: 'Pickup by appointment. Culinary and medicinal herb starts, seeds, free consults.',                         cat: 'poi'  },
  { user: 'evan_fletcher',   lat: 39.6013, lng: -76.3962, title: 'Forest Hill Middle — Robotics Club',      desc: 'Teen robotics, Thursdays after school. Demo Day July 19. New mentors welcome.',                           cat: 'poi'  },
];

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3 — POLLS
// ═══════════════════════════════════════════════════════════════════════════

const POLLS = [
  {
    creator: 'darnell_waters',
    question: 'What should be the top priority for Millard Park improvements this year?',
    options: ['New playground equipment', 'Better trail lighting', 'Expand the community garden', 'Covered picnic shelter'],
    closesInDays: 21,
    voters: [
      { user: 'josephine_lee', opt: 2 }, { user: 'carlos_medina', opt: 2 },
      { user: 'amber_ostrowski', opt: 0 }, { user: 'rashida_thomas', opt: 0 },
      { user: 'grace_osei', opt: 1 }, { user: 'sasha_kowalski', opt: 1 },
      { user: 'nadia_petrov', opt: 2 }, { user: 'omar_sheikh', opt: 1 },
      { user: 'kezia_mwangi', opt: 2 }, { user: 'ingrid_sorensen', opt: 2 },
      { user: 'terrence_booker', opt: 3 }, { user: 'deanna_floyd', opt: 0 },
      { user: 'ty_mcallister', opt: 1 }, { user: 'gabe_huang', opt: 1 },
    ],
  },
  {
    creator: 'maya_okonkwo',
    question: 'What day works best for a monthly hub meetup (in person)?',
    options: ['Saturday afternoon', 'Sunday morning', 'Weekday evening (Tue/Thu)'],
    closesInDays: 10,
    voters: [
      { user: 'priya_nair', opt: 0 }, { user: 'luca_romano', opt: 0 },
      { user: 'elijah_grant', opt: 2 }, { user: 'kwame_asante', opt: 2 },
      { user: 'victor_okafor', opt: 0 }, { user: 'monique_pierre', opt: 2 },
      { user: 'nina_vasquez', opt: 2 }, { user: 'camille_rousseau', opt: 0 },
      { user: 'helen_cho', opt: 1 }, { user: 'patricia_dunbar', opt: 1 },
      { user: 'brendan_hayes', opt: 2 }, { user: 'ryan_colbert', opt: 2 },
    ],
  },
  {
    creator: 'sasha_kowalski',
    question: 'Should we set up a shared neighborhood emergency contact list (visible to hub members only)?',
    options: ['Yes — very useful', 'Yes, but I want to understand how it\'s stored first', 'No — too private'],
    closesInDays: 7,
    voters: [
      { user: 'jerome_washington', opt: 0 }, { user: 'grace_osei', opt: 0 },
      { user: 'terrence_booker', opt: 0 }, { user: 'dorothy_kim', opt: 0 },
      { user: 'deanna_floyd', opt: 1 }, { user: 'amara_diallo', opt: 1 },
      { user: 'aaliya_rahman', opt: 1 }, { user: 'omar_sheikh', opt: 1 },
      { user: 'darnell_waters', opt: 0 }, { user: 'maya_okonkwo', opt: 1 },
      { user: 'rashida_thomas', opt: 2 }, { user: 'helen_cho', opt: 2 },
    ],
  },
  {
    creator: 'priya_nair',
    question: 'Which hub feature would you most like to see built next?',
    options: ['Carpooling / rideshare board', 'Tool lending tracker', 'Neighborhood event calendar', 'Local emergency alerts'],
    closesInDays: 14,
    voters: [
      { user: 'miguel_reyes', opt: 0 }, { user: 'terrence_booker', opt: 0 },
      { user: 'ling_chen', opt: 0 }, { user: 'brendan_hayes', opt: 1 },
      { user: 'carlos_medina', opt: 1 }, { user: 'ryan_colbert', opt: 1 },
      { user: 'evan_fletcher', opt: 2 }, { user: 'elijah_grant', opt: 2 },
      { user: 'victor_okafor', opt: 2 }, { user: 'monique_pierre', opt: 2 },
      { user: 'sasha_kowalski', opt: 3 }, { user: 'jerome_washington', opt: 3 },
      { user: 'grace_osei', opt: 3 }, { user: 'amara_diallo', opt: 3 },
      { user: 'ty_mcallister', opt: 2 }, { user: 'gabe_huang', opt: 1 },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function cleanupPrevious() {
  const allUsernames = [
    ...new Set([
      ...POSTS.map(p => p.user),
      ...PINS.map(p => p.user),
      ...POLLS.map(p => p.creator),
      ...POLLS.flatMap(p => p.voters.map(v => v.user)),
    ]),
  ];
  const { rows: users } = await pool.query(
    `SELECT id FROM hub_users WHERE username = ANY($1)`, [allUsernames]
  );
  if (!users.length) return;
  const ids = users.map(u => u.id);
  await pool.query(`DELETE FROM hub_post_replies WHERE author_id  = ANY($1)`, [ids]);
  await pool.query(`DELETE FROM hub_posts        WHERE author_id  = ANY($1)`, [ids]);
  await pool.query(`DELETE FROM hub_atlas_pins   WHERE author_id  = ANY($1)`, [ids]);
  await pool.query(`DELETE FROM hub_poll_votes   WHERE voter_id   = ANY($1)`, [ids]);
  await pool.query(`DELETE FROM hub_polls        WHERE created_by = ANY($1)`, [ids]);
  log(`  Cleaned up previous seed data (${ids.length} user scope)`);
}

async function seedFeed() {
  log('\n── Phase 1: Feed ───────────────────────────────────────────────────────');
  let postCount = 0, replyCount = 0;
  const postMap = {};

  for (const p of POSTS) {
    try {
      const extras = { created_at: daysAgo(p.daysAgo) };
      if (p.event_date)     extras.event_date = p.event_date;
      if (p.event_location) extras.event_location = p.event_location;

      const post = await createPost(p.user, p.category, p.title, p.body, extras);
      postMap[p.title] = post.id;
      log(`  ✓ [${p.category.padEnd(12)}] "${p.title.substring(0, 55)}" — @${p.user}`);
      postCount++;
    } catch (err) {
      log(`  ✗ "${p.title.substring(0, 40)}": ${err.message}`);
    }
  }

  log(`\n  Adding replies…`);
  for (const [title, replies] of Object.entries(REPLIES)) {
    const postId = postMap[title];
    if (!postId) continue;
    for (const r of replies) {
      try {
        await createReply(r.user, postId, r.body);
        replyCount++;
      } catch { /* skip */ }
    }
  }

  log(`\n  Posts: ${postCount}  Replies: ${replyCount}`);
  return { postCount, replyCount };
}

async function seedAtlas() {
  log('\n── Phase 2: Atlas ──────────────────────────────────────────────────────');
  let pinCount = 0;
  for (const p of PINS) {
    try {
      await createPin(p.user, p.lat, p.lng, p.title, p.desc, p.cat);
      log(`  ✓ [${p.cat.padEnd(14)}] ${p.title.substring(0, 50)}`);
      pinCount++;
    } catch (err) {
      log(`  ✗ ${p.title.substring(0, 40)}: ${err.message}`);
    }
  }
  log(`\n  Pins: ${pinCount}`);
  return { pinCount };
}

async function seedPolls() {
  log('\n── Phase 3: Polls ──────────────────────────────────────────────────────');
  let pollCount = 0, voteCount = 0;

  for (const p of POLLS) {
    try {
      const poll = await createPoll(p.creator, p.question, p.options, p.closesInDays);
      log(`  ✓ "${p.question.substring(0, 60)}" — @${p.creator}`);
      pollCount++;

      for (const v of p.voters) {
        await vote(v.user, poll.id, v.opt);
        voteCount++;
      }
      log(`      ${p.voters.length} votes cast`);
    } catch (err) {
      log(`  ✗ "${p.question.substring(0, 40)}": ${err.message}`);
    }
  }

  log(`\n  Polls: ${pollCount}  Total votes: ${voteCount}`);
  return { pollCount, voteCount };
}

async function verify() {
  log('\n── Verification ────────────────────────────────────────────────────────');
  const { rows: [f] } = await pool.query(`
    SELECT
      COUNT(*)                                                     AS posts,
      COUNT(*) FILTER (WHERE category = 'DISCUSSION')             AS discussions,
      COUNT(*) FILTER (WHERE category = 'ANNOUNCEMENT')           AS announcements,
      COUNT(*) FILTER (WHERE category = 'EVENT')                  AS events,
      COUNT(*) FILTER (WHERE category = 'PROJECT')                AS projects,
      COUNT(*) FILTER (WHERE category = 'REQUEST')                AS requests
    FROM hub_posts
  `);
  const { rows: [r] } = await pool.query(`SELECT COUNT(*) AS replies FROM hub_post_replies`);
  const { rows: [a] } = await pool.query(`SELECT COUNT(*) AS pins, COUNT(DISTINCT category) AS cat FROM hub_atlas_pins`);
  const { rows: [po] } = await pool.query(`SELECT COUNT(DISTINCT poll_id) AS polls, COUNT(*) AS votes FROM hub_poll_votes`);

  log(`  Feed posts   : ${f.posts}  (${f.discussions} discussions, ${f.announcements} announcements, ${f.events} events, ${f.projects} projects, ${f.requests} requests)`);
  log(`  Replies      : ${r.replies}`);
  log(`  Atlas pins   : ${a.pins}  (${a.cat} categories)`);
  log(`  Polls        : ${po.polls}  |  Votes cast: ${po.votes}`);
}

async function main() {
  log('\n🌱  Citinet Hub — Feed, Atlas & Polls Seed\n');
  log('── Cleanup ─────────────────────────────────────────────────────────────');
  await cleanupPrevious();
  const { postCount, replyCount } = await seedFeed();
  const { pinCount } = await seedAtlas();
  const { pollCount, voteCount } = await seedPolls();
  await verify();
  log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Seed complete
  Posts    : ${postCount}   Replies: ${replyCount}
  Pins     : ${pinCount}
  Polls    : ${pollCount}   Votes  : ${voteCount}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
  await pool.end();
}

main().catch(err => { console.error(err); pool.end(); process.exit(1); });
