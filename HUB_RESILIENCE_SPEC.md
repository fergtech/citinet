# Citinet Mission Spec
## Mission 1.5: Hub Resilience, Capacity, and Maintenance Continuity

**Date:** March 13, 2026  
**Status:** Draft (implementation-ready)  
**Aligned codebase:** `api/server.js`, `docker-compose.yml`, `src/app/services/hubService.ts`, `src/app/context/HubContext.tsx`, `src/app/types/hub.ts`

---

## 1. Objectives

1. Prevent hard outages from disk exhaustion with automatic protective behavior.
2. Support planned maintenance without confusing users.
3. Add backup/restore controls with verifiable recovery.
4. Enable primary/standby failover with clear operator runbooks.

---

## 2. SLO Targets

1. **RPO:** 5 minutes.
2. **RTO (planned maintenance):** under 60 seconds for API availability.
3. **RTO (unplanned failover):** under 180 seconds.
4. **Capacity guardrail:** never allow disk usage above 98% on data volume.

---

## 3. Data Model Additions

### 3.1 `hub_system_state`

- `key VARCHAR(100) PRIMARY KEY`
- `value JSONB NOT NULL`
- `updated_at TIMESTAMPTZ DEFAULT NOW()`

### 3.2 `hub_backups`

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `started_at TIMESTAMPTZ NOT NULL`
- `finished_at TIMESTAMPTZ`
- `status VARCHAR(20) NOT NULL` (`running`, `success`, `failed`)
- `kind VARCHAR(20) NOT NULL` (`full`, `incremental`)
- `target_uri TEXT`
- `size_bytes BIGINT`
- `checksum TEXT`
- `error TEXT`

### 3.3 `hub_failover_events`

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `event_type VARCHAR(40) NOT NULL`
- `initiated_by UUID NULL`
- `detail JSONB NOT NULL`
- `created_at TIMESTAMPTZ DEFAULT NOW()`

---

## 4. Environment Variables

Use existing env style from setup generator and Compose.

### 4.1 Resilience / Capacity

- `RESILIENCE_ENABLED=true`
- `STORAGE_CHECK_INTERVAL_SEC=15`
- `STORAGE_WARN_PCT=75`
- `STORAGE_SOFT_LIMIT_PCT=90`
- `STORAGE_HARD_LIMIT_PCT=95`
- `STORAGE_RESERVED_BYTES=1073741824`
- `STORAGE_AUTOPRUNE_ENABLED=true`
- `STORAGE_AUTOPRUNE_TARGET_PCT=85`
- `STORAGE_AUTOPRUNE_MAX_DELETE_BYTES=2147483648`

### 4.2 Tiered Storage (optional)

- `STORAGE_TIERING_ENABLED=false`
- `STORAGE_TIER2_URL=`
- `STORAGE_TIER2_ACCESS_KEY=`
- `STORAGE_TIER2_SECRET_KEY=`
- `STORAGE_TIER2_BUCKET=`

### 4.3 Maintenance

- `MAINTENANCE_MODE=false`
- `MAINTENANCE_MESSAGE=`
- `MAINTENANCE_UNTIL=`

### 4.4 Backup

- `BACKUP_ENABLED=true`
- `BACKUP_CRON=0 */6 * * *`
- `BACKUP_RETENTION_DAYS=14`
- `BACKUP_TARGET=local`
- `BACKUP_LOCAL_DIR=/backups`
- `BACKUP_S3_URL=`
- `BACKUP_S3_BUCKET=`
- `BACKUP_S3_ACCESS_KEY=`
- `BACKUP_S3_SECRET_KEY=`
- `BACKUP_VERIFY_AFTER_WRITE=true`

### 4.5 High Availability

- `HA_ENABLED=false`
- `HA_ROLE=primary`
- `HA_PEER_URL=`
- `HA_HEARTBEAT_INTERVAL_SEC=5`
- `HA_FAILOVER_TOKEN=`

---

## 5. API Contract

Preserve existing endpoints and extend contract.

### 5.1 `GET /health`

- **200** when API process alive.
- Extend response:

```json
{
  "status": "ok",
  "version": "0.3.0",
  "mode": "normal",
  "role": "primary"
}
```

### 5.2 `GET /api/status`

Keep current shape consumed by frontend and add resilience fields.

```json
{
  "online": true,
  "uptime": "2d 3h",
  "user_count": 12,
  "node_name": "Hub",
  "storage_used": 1234567,
  "storage_quota": 9999999,
  "storage_pct": 12.35,
  "capacity_state": "ok",
  "maintenance": {
    "active": false,
    "message": "",
    "until": null,
    "read_only": false
  },
  "ha": {
    "enabled": false,
    "role": "primary",
    "peer_reachable": null,
    "last_failover_at": null
  }
}
```

### 5.3 `GET /api/system/capacity`

- **Auth:** admin
- **200** response:

```json
{
  "disk_total_bytes": 0,
  "disk_used_bytes": 0,
  "disk_free_bytes": 0,
  "storage_used_bytes": 0,
  "storage_quota_bytes": 0,
  "storage_pct": 0,
  "state": "ok",
  "last_checked_at": "2026-03-13T00:00:00.000Z"
}
```

### 5.4 `POST /api/admin/maintenance`

- **Auth:** admin
- **Request:**

```json
{
  "active": true,
  "message": "Scheduled DB patch",
  "until": "2026-03-14T03:00:00Z",
  "read_only": true
}
```

- **200** response:

```json
{
  "ok": true,
  "maintenance": {
    "active": true,
    "message": "Scheduled DB patch",
    "until": "2026-03-14T03:00:00Z",
    "read_only": true
  }
}
```

### 5.5 `DELETE /api/admin/maintenance`

- **Auth:** admin
- **204** response.

### 5.6 `POST /api/admin/backup/run`

- **Auth:** admin
- **Request:**

```json
{
  "kind": "full",
  "reason": "pre-maintenance"
}
```

- **202** response:

```json
{
  "job_id": "uuid",
  "status": "running"
}
```

### 5.7 `GET /api/admin/backups`

- **Auth:** admin
- **200** response:

```json
{
  "items": [
    {
      "id": "uuid",
      "started_at": "2026-03-13T00:00:00.000Z",
      "finished_at": "2026-03-13T00:03:00.000Z",
      "status": "success",
      "kind": "full",
      "target_uri": "s3://bucket/backup.tar.zst",
      "size_bytes": 123456
    }
  ]
}
```

### 5.8 `POST /api/admin/restore/validate`

- **Auth:** admin
- **Request:**

```json
{
  "backup_id": "uuid"
}
```

- **202** response:

```json
{
  "job_id": "uuid",
  "status": "running"
}
```

### 5.9 `POST /api/admin/failover/promote`

- **Auth:** admin + failover token
- **Request:**

```json
{
  "reason": "primary_down",
  "force": false
}
```

- **200** response:

```json
{
  "ok": true,
  "role": "primary",
  "promoted_at": "2026-03-13T00:00:00.000Z"
}
```

### 5.10 Write-path behavior under capacity pressure

For upload and mutating file endpoints:

- At `soft_limit`: throttle writes (`429` or `503` + `Retry-After`).
- At `hard_limit`: reject writes with `507 Insufficient Storage`.

Example body:

```json
{
  "error": "Insufficient storage",
  "capacity_state": "hard_limit",
  "retry_after_sec": 300
}
```

### 5.11 Write-path behavior during maintenance

- Non-admin mutating endpoints return **503**:

```json
{
  "error": "Hub under maintenance",
  "maintenance_until": "2026-03-14T03:00:00Z",
  "read_only": true
}
```

- Reads remain available when `read_only=true`.

---

## 6. Frontend Integration Contract

### 6.1 Type updates (`src/app/types/hub.ts`)

Extend `HubStatusResponse` with:

- `storage_quota?: number`
- `storage_pct?: number`
- `capacity_state?: 'ok' | 'warn' | 'soft_limit' | 'hard_limit'`
- `maintenance?: { active: boolean; message?: string; until?: string | null; read_only?: boolean }`
- `ha?: { enabled: boolean; role: 'primary' | 'standby'; peer_reachable?: boolean | null; last_failover_at?: string | null }`

### 6.2 Polling behavior (`src/app/context/HubContext.tsx`)

- Keep 60-second baseline polling.
- Increase to 15-second polling when degraded/maintenance.
- Surface maintenance banner and capacity warning badge in dashboard/system strip.

### 6.3 Status mapping (`src/app/services/hubService.ts`)

- `maintenance.active=true` maps to connected + maintenance UI mode (not unreachable).
- `capacity_state=hard_limit` maps to connected + degraded mode (not unreachable).

---

## 7. Operational Runbooks

### Runbook A: Hub nearing full disk (automatic)

1. Trigger: `storage_pct >= STORAGE_WARN_PCT`.
2. Action: set `capacity_state=warn`, emit event log.
3. Trigger: `storage_pct >= STORAGE_SOFT_LIMIT_PCT`.
4. Action: throttle uploads; start autopruner; optionally route new objects to tier2.
5. Trigger: `storage_pct >= STORAGE_HARD_LIMIT_PCT` OR free bytes `< STORAGE_RESERVED_BYTES`.
6. Action: reject new uploads (`507`), keep reads available, present admin alert.
7. Recovery: operator frees capacity or migrates data path; state returns to normal.

### Runbook B: Planned maintenance

1. Set maintenance: `POST /api/admin/maintenance` with `read_only=true` and `until`.
2. Verify: `GET /api/status` returns `maintenance.active=true`.
3. Trigger backup: `POST /api/admin/backup/run` (`kind=full`).
4. Perform maintenance work.
5. Verify system health: `GET /health`, `GET /api/status`.
6. Clear maintenance: `DELETE /api/admin/maintenance`.
7. Validate writes and remove UI maintenance banner.

### Runbook C: Unplanned primary outage (with standby)

1. Detect heartbeat miss beyond 3 intervals.
2. Promote standby: `POST /api/admin/failover/promote`.
3. Switch traffic to promoted node.
4. Verify role and health endpoints.
5. Log failover event with reason and timestamps.
6. Rebuild failed node as standby after reconciliation.

### Runbook D: Weekly restore validation

1. Select latest successful backup from `GET /api/admin/backups`.
2. Start validation: `POST /api/admin/restore/validate`.
3. Verify checksum, row counts, object manifest parity.
4. Record pass/fail metadata.
5. Alert if last successful validation age exceeds 7 days.

---

## 8. Deployment Changes

1. Add env vars to:
   - `docker-compose.yml`
   - `public/setup/docker-compose.yml`
2. Add setup guidance to `public/setup/README.txt` under backup/maintenance sections.
3. Add generated env lines in `src/app/utils/scriptGenerator.ts`.
4. Add Hub Management controls for:
   - maintenance mode toggle
   - backup run button
   - capacity status panel

---

## 9. Acceptance Criteria

1. Disk fill to 95% causes upload rejection (`507`) within 30 seconds while reads remain available.
2. Maintenance mode blocks non-admin writes and exposes clear status to clients.
3. Backup jobs are runnable, listable, and auditable via API.
4. Restore validation can run unattended and emits pass/fail.
5. Failover promotion updates role and keeps API reachable within RTO target.

---

## 10. Delivery Sequence (2 Weeks)

### Week 1

1. Capacity monitor and status extensions.
2. Write guards (`soft_limit`, `hard_limit`, maintenance read-only).
3. Backup run endpoint + metadata persistence.

### Week 2

1. Restore validation pipeline.
2. HA heartbeat + promote endpoint.
3. Frontend maintenance/capacity UX.
4. Documentation and operator drills.

---

## 11. Notes

- This spec intentionally extends current endpoint patterns and status payloads used by the existing web client.
- For true near-instant recovery, a standby node is required; single-host deployments cannot guarantee zero-downtime failover.
