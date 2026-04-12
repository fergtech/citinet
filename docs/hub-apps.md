# Hub App Integration

Citinet supports modular third-party app integrations called **hub apps**. Any platform that implements the hub-app contract can be installed by a hub admin to extend Citinet with new capabilities — without any code changes to Citinet itself.

## How It Works

Hub apps are external services that expose a standard REST API (`/api/hub-app/`) secured with a shared API key. Citinet proxies requests to the installed app and surfaces the content natively in the hub UI.

The connection is:
- **Configured** by a hub admin through Hub Management → Apps
- **Verified** at install time by calling the app's `/api/hub-app/info` endpoint
- **Hot-reloaded** — no server restart required after connecting an app
- **Attributed** automatically — the app's name and favicon are fetched and displayed in the UI alongside its content

If no app is configured for a capability, that section of the UI degrades gracefully (no broken states, no mock data).

---

## Capabilities

| Capability | UI Surface | Routes proxied |
|---|---|---|
| `initiatives` | Dashboard card block + full Initiatives screen | `GET/POST /api/initiatives`, `GET/PATCH/DELETE /api/initiatives/:id`, `POST /api/initiatives/:id/goals`, `PATCH/DELETE /api/initiatives/goals/:goalId` |

Additional capabilities can be added by defining new entries in `APP_PROVIDERS` (`api/server.js`) and adding corresponding proxy routes.

---

## Admin Configuration

Hub admins configure apps through **Hub Management → Apps tab**.

1. Enter the app's public URL
2. Enter the shared API key (provided by the app operator)
3. Click **Connect & verify** — Citinet calls the app's `/api/hub-app/info` endpoint to confirm connectivity and retrieve the app name
4. On success the connection is saved to the database and takes effect immediately

Configuration is stored in the `hub_app_configs` database table and takes precedence over environment variables. Environment variables (`INITIATIVES_APP_URL`, `INITIATIVES_APP_KEY`) serve as a fallback for headless/automated deployments.

---

## Hub App Contract

Any app wishing to serve as a hub app must implement:

### Authentication
All requests from Citinet include:
```
x-hub-api-key: <shared secret>
```
The app is responsible for validating this header on every endpoint.

### Required endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/hub-app/info` | App metadata (name, faviconUrl, capabilities) |

### Capability-specific endpoints (initiatives)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/hub-app/initiatives` | List all initiatives |
| `POST` | `/api/hub-app/initiatives` | Create an initiative |
| `GET` | `/api/hub-app/initiatives/:id` | Get single initiative |
| `PATCH` | `/api/hub-app/initiatives/:id` | Update status / progress / title |
| `DELETE` | `/api/hub-app/initiatives/:id` | Delete initiative |
| `GET` | `/api/hub-app/initiatives/:id/goals` | List goals as tasks |
| `POST` | `/api/hub-app/initiatives/:id/goals` | Add a goal/task |
| `PATCH` | `/api/hub-app/goals/:id` | Update goal status |
| `DELETE` | `/api/hub-app/goals/:id` | Delete goal |
| `POST` | `/api/hub-app/users/ensure` | Find or create a user by email |

### User identity
Citinet identifies its users to the app using a synthetic email: `{username}@hub.citinet`. The `/users/ensure` endpoint should create an account for this user if one does not already exist, enabling content ownership and attribution.

### Data shapes

**Initiative**
```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "status": "planning | active | completed",
  "progress": 0,
  "color": "purple | emerald | blue | amber",
  "createdBy": "string",
  "createdAt": "YYYY-MM-DD",
  "tasks": [...],
  "members": [...],
  "updates": [...]
}
```

**Task / Goal**
```json
{
  "id": "string",
  "title": "string",
  "status": "todo | in-progress | done",
  "assignee": "string (optional)",
  "dueDate": "YYYY-MM-DD (optional)"
}
```

---

## Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `INITIATIVES_APP_URL` | URL of the installed initiatives app | Only if not set via admin UI |
| `INITIATIVES_APP_KEY` | Shared API key for the initiatives app | Only if not set via admin UI |

Values set via the admin UI take precedence over environment variables.
