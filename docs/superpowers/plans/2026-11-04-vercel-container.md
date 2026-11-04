# Vercel Container Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Prepare the existing Express/React application for one Vercel container while retaining 10 MB media and 5 MB XLSX support.

**Architecture:** Keep the existing app, session authentication and Supabase S3 adapter. Add database-backed temporary objects and rate limit counters, direct private S3 transfers, bounded preview pages, and a stateless Node 24/FFmpeg container.

**Tech Stack:** Node 24, Express 5, React/Vite, Prisma 6/Postgres, existing AWS SDK/presigner, Sharp, FFmpeg.

**Spec:** `docs/superpowers/specs/2026-11-04-vercel-container-design.md` (approved).

## Global Constraints

- One container serving web + API, no Vercel Services or additional paid service.
- Media 10 MB; XLSX 5 MB; upload URL 5 minutes; import source 30 minutes; export retained 10 minutes and GET URL 60 seconds; at most 20 active uploads per admin.
- Production secrets stay server-side; no migrations or bootstrap in image builds; preserve existing keys/admin/data.
- Local multipart stays supported. Production uses shared atomic PostgreSQL rate limits and fails closed.
- Only temporary database-owned keys can be cleaned. Bound maintenance work; do not hold DB transactions across storage/decode calls.

## Review Focus

- A signed upload may be reused until expiry: cleanup must retain metadata until the capability expires, including completed/failed uploads.
- Import errors on later pages must block the whole commit; counts and reports must describe the whole batch.
- A caller submitting another admin's uploadId must neither consume nor read it.
- Concurrent rate limits across instances must increment atomically, namespace counters and never decrement below zero.
- A failed object deletion must retain metadata for retry; cron must reject missing or incorrect secrets.

## File responsibilities

- `backend/prisma/schema.prisma`, new additive migration: TemporaryObject and RateLimitBucket plus RLS.
- `backend/src/services/storage.service.ts`: bounded storage reads, signed PUT/GET, private preview/export links.
- New `backend/src/services/temporary-object.service.ts`: upload allocation, ownership/expiry checks, one-time claim and cleanup.
- New upload controller/router: session/CSRF protected prepare endpoint; app registers it.
- Media/import controllers: accept JSON uploadId as well as existing multipart, reuse all content validation; paginate batch views and return S3 export links.
- Rate limit store/middleware: production Postgres store, existing local memory store.
- New maintenance service/router: existing CLI cleanup plus authenticated cron, bounded object cleanup.
- Frontend API helper + MediaLibrary/Imports: direct file upload/download and preview navigation.
- `Dockerfile.vercel`, `.dockerignore`, config/server, docs: build/runtime instructions and verification.
- Tests/fixtures: use isolated local test database and temp storage; browser/cloud checks remain separate.

### Task 1: Temporary objects and shared rate store

**Interfaces:** `createUpload(req,eventId,input) -> {mode:'direct',uploadId,url,headers}|{mode:'multipart'}`; `readUpload(req,eventId,id,purpose,claim=false) -> {bytes,name}`; `deleteUploadSource(id)`; `cleanupTemporaryObjects(limit=100)`; `PostgresRateLimitStore(namespace)` implements express-rate-limit Store.

- [x] Write failing integration tests in `backend/tests/cloud-transfer.test.ts` and `backend/tests/limits.test.ts`: missing prepare route returns 404 instead of mode; unknown/wrong-owner/expired upload rejected; two stores share increments, expiry/reset/decrement; cleanup keeps failed deletes.
- [x] Run the focused tests and confirm failures from missing behavior.
- [x] Add two models/migration, update reset fixtures, implement services/store and prepare endpoint. Hash counter keys; cap active upload issuance inside a short serializable transaction; sign only after metadata is saved.
- [x] Run focused tests and the backend suite. Verify local migration/generation without touching cloud.
- [x] Commit only task files; record evidence in `.data/vercel-container-progress.md`.

### Task 2: Transfer integration and bounded previews

**Consumes:** Task 1 upload services and storage presign helpers.
**Produces:** JSON `{uploadId,alt}` media completion and `{uploadId,sheet,mapping}` import requests; `batchView(batch,page=1)` returns rows/errors/warnings slices of 100 with pagination totals; S3 workbook response `{data:{downloadUrl}}`.

- [x] Add failing route tests: real local staged source completes once, forged media fails, imports beyond page 1 still block commit, page boundaries preserve totals, S3 preview/export avoid proxying bodies.
- [x] Run tests to observe failures.
- [x] Integrate into controllers/routes; claim media and import preview once; cleanup originals on success/error without masking the original error. Keep inspect non-consuming and reports complete. Add signed GET to storageUrl for S3 and old preview route redirect. Extend CSP to configured storage origin.
- [x] Update frontend helper `prepareUpload(eventId,file,purpose)` and request bodies, download handling and Imports pagination/global validity. Preserve local multipart and report links.
- [x] Run route tests, typecheck and full suite; commit task files and ledger results.

### Task 3: Maintenance and container packaging

**Interfaces:** `runMaintenance()` returns cleanup counts; GET `/api/maintenance` requires `Authorization: Bearer CRON_SECRET`.

- [x] Add failing cron tests (missing secret 503, wrong secret 401, valid secret 200) and retained metadata on cleanup failure.
- [x] Implement bounded maintenance service/router and CLI reuse. Add PostgreSQL store selection for production. Add HOST config and production /tmp default for S3.
- [x] Add multistage Node 24 Debian slim + FFmpeg Dockerfile, narrowly scoped COPY and dockerignore. Runtime nonroot, bind 0.0.0.0:8080, build both workspaces and exclude bootstrap/secrets. Add daily Vercel cron JSON.
- [x] Run focused tests, typecheck, build and suite.
- [x] Build/run image, inspect env-file exclusion and verify health/SPA/audio in Linux — passed after Docker Engine started.
- [x] Commit task files and ledger evidence.

### Task 4: End-to-end verification and release preparation

- [x] Add browser coverage for preview pagination while preserving existing media/import/user flows. Run backend tests, typecheck/build and desktop/mobile E2E on local test databases.
- [x] Run real Supabase S3 presigned PUT/GET above 4.5 MB, size mismatch/anonymous/private checks and cleanup of generated test objects only. Do not migrate cloud during local implementation.
- [x] Write `docs/deploy-vercel.md`: Container preset/root, exact environment names, no production secrets in preview, migrations before traffic, health checks, cron and rollback. Preserve invitation/session keys and omit admin bootstrap password on Vercel.
- [x] Fresh independent whole-change review against spec/plan; fix important findings with red-green tests and green suite.
- [x] Report concrete changes, verification and any blocked Linux/cloud checks; leave push, cloud migration and publish for the user's final release approval.

## Self-review

Every spec section maps to tasks 1–4; the five review focus conditions have route/store/cleanup tests assigned above. The upload and batch interfaces have one owner and all frontend callers are included. Existing user changes and production profile remain in the current workspace and are not reset or broadly staged.

## Verified status (2026-11-04)

Local implementation is committed on codex/vercel-container. Final backend 67/67, desktop/mobile E2E 18/18, typecheck/build and OpenAPI parse/reference checks pass. Real browser S3 transfer of 5 MiB passed, anonymous access and wrong signed length were rejected, test object deleted. Four confirmed review findings fixed with regression tests; a fifth concurrency allegation was withdrawn after reproduction attempts preserved the counter. Linux image build and isolated PostgreSQL 18 runtime checks passed: Node 24.22.2, nonroot, private workspace files excluded, SPA/API/auth/CSRF/cron and Sharp/MP3/M4A verified. Verification containers/network cleaned. No cloud migration, project creation, push or deploy has run; Vercel project creation was rejected with 403 pending a team grant for the connected app.
