# Hub storage image

Hubs keep files in an S3-compatible server. MinIO withdrew its free container images, so Citinet
uses **SILO**, a community fork maintained by PGSTY. SILO is not affiliated with MinIO, Inc., and
neither is Citinet.

| | |
|---|---|
| Our copy | `ghcr.io/fergtech/citinet-storage:RELEASE.2026-11-12T00-00-00Z` |
| Original | `docker.io/pgsty/silo` (same tag) |
| Digest | `sha256:c20d112390b9a9ce8c11b8af95ad35bcaa62f4759663c09c936cd8d2b511f329` |
| Processors | linux/amd64, linux/arm64 |
| Licence | AGPL-3.0 |
| Source | https://github.com/pgsty/silo/tree/RELEASE.2026-11-12T00-00-00Z (commit `44e848fed`) |

The copy is unmodified: Citinet does not change or rebuild it. The licence, notice and credits files
travel inside the image, in `/licenses`.

## Moving to a newer version

1. Read the release notes, including any upgrade conditions: https://github.com/pgsty/silo/releases
2. Test it on throwaway data: written by the current version, read and changed by the new one, then
   opened by the current one again.
3. Update the version and digest in `.github/workflows/mirror-storage.yml` and in this file, then run
   the workflow.
4. Only then point `docker-compose.yml` and `src/app/utils/scriptGenerator.ts` at it. Always use an
   exact version, never `latest`.

## Tested

2026-11-27: data written by MinIO `RELEASE.2025-09-07` was read, added to and deleted from by this
SILO version, then opened again by MinIO. Same start command and health check as a hub uses. Not yet
tested: a long-lived hub's real files, running on ARM, and the web console.
