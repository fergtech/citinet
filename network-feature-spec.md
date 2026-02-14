
# Network Page Feature Specification
**Purpose:** Provide a clear blueprint for building and evolving the Network page in the app, including user flow, interactions, and future enhancements.

---

## ✅ Overview
The Network page is the hub for connectivity awareness and community growth. It combines:
- **Symbolic visualization** (emotional priming + real-time representation).
- **Stats and milestones** (members, online users, signal strength).
- **Quick actions** (invite, host node, emergency signal).
- **Future-ready hooks** for physical nodes and mesh telemetry.

---

## 🖼 Current Layout (Screenshot Reference)
- **Live Network Visualization**: Pulsing dots representing nodes/users.
- **Stats Panel**: Active Members, Online Now, Signal Strength.
- **Status Cards**: Cloud Instance, Growth progress bar.
- **Quick Actions**: Invite Neighbors, Host a Node, Emergency Signal.
- **Coming Soon Banner**: Physical nodes roadmap.

---

## 🔍 Interaction Map

### 1. Live Network Visualization
- **Hover (Desktop)**: Highlight dot with glow; show mini tooltip.
- **Click (Any device)**:
  - Open modal with:
    - Node/User name (or placeholder).
    - Status: Online / Offline.
    - Future: Node telemetry (uptime, latency, hosted services).
- **Future Upgrade**:
  - Clicking a node → Node Details page.
  - Clicking a user → Profile or chat.

---

### 2. Stats Panel
- **Active Members**:
  - Click → Opens member list modal.
  - Shows all members with status badges.
- **Online Now**:
  - Click → Filters list to online users.
- **Signal Strength**:
  - Click → Opens diagnostics modal:
    - Explains signal quality.
    - Future: Mesh health metrics.

---

### 3. Status Cards
- **Cloud Instance**:
  - Click → Modal with:
    - Current connection details.
    - Option to switch to local node (future).
- **Growth**:
  - Click → Progress modal:
    - Milestones (e.g., unlock Neighborhood Chat at 100 members).
    - Invite button for quick sharing.

---

### 4. Quick Actions
- **Invite Neighbors**:
  - Click → Modal with:
    - QR code for app download/join link.
    - Copyable link.
    - Share buttons (SMS, WhatsApp, etc.).
- **Host a Node**:
  - Click → Opens setup guide page or modal.
- **Emergency Signal**:
  - Click → Confirmation modal:
    - Broadcast alert to all users in tile.
    - Future: Push notification + SMS fallback.

---

### 5. Coming Soon Banner
- Non-clickable for MVP.
- Future: Click → Roadmap page or beta sign-up.

---

## ✅ Suggested User Flow
1. **User lands on Network page**:
   - Sees visualization (emotional + functional).
   - Stats give quick context.
   - Status cards confirm connectivity.
   - Quick actions invite engagement.

2. **Primary interactions**:
   - Invite Neighbors → share link → growth metric updates.
   - Host a Node → learn setup steps.
   - Emergency Signal → urgent alert modal.

3. **Secondary interactions**:
   - Explore visualization (hover/click dots).
   - Check member list via stats panel.
   - View growth milestones.

---

## 🎨 Design Guidelines
- **Visual hierarchy**:
  - Hero visualization at top.
  - Stats and actions below.
- **Modern feel**:
  - Gradients, glowing accents, subtle parallax.
  - Animated progress bars and hover states.
- **Accessibility**:
  - ARIA labels for buttons and modals.
  - Respect `prefers-reduced-motion`.

---

## 🔮 Future Enhancements
- Node telemetry: uptime, latency, hosted services.
- Nearby nodes map with pins and status.
- Mesh health metrics: links, packet loss %, throughput.
- P2P presence indicator: “Nearby peers: n”.
- Federation hooks: ActivityPub, Matrix integration.

---

## ✅ Development Checklist
- [ ] Build `/network` page route.
- [ ] Implement visualization component (Canvas-based for performance).
- [ ] Add stats panel with click-to-modal behavior.
- [ ] Create quick action modals (Invite, Host, Emergency).
- [ ] Wire up mock data for MVP.
- [ ] Add feature flags for future telemetry/map sections.
- [ ] Ensure responsive design and accessibility compliance.

---

## 📂 File Structure Suggestion
``
