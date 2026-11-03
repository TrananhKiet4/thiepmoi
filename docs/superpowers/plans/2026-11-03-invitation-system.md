# Graduation Invitation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build the Vietnamese invitation management application specified in the approved design, with real PostgreSQL persistence.

**Architecture:** npm workspaces with React/Vite web, Express API, shared Zod contracts, Prisma/PostgreSQL, local development and S3 production storage. One origin, separate admin session and invitation bearer authentication. Independent web and import/media implementation may run in parallel after their interfaces are fixed.

**Tech Stack:** Node 24, TypeScript, React, Vite, React Router, TanStack Query, Tailwind, Express 5, Prisma 6, PostgreSQL, Zod, ExcelJS, Sharp, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-03-thiep-moi-tot-nghiep-design.md`; full source `docs/reference/dac-ta-goc.md`.

## Global Constraints

- All personal data persisted server-side; no mock backend or localStorage replacement.
- Vietnamese UI, immutable revisions, guest reads published revision only.
- UUID, UTC timestamps, Asia/Ho_Chi_Minh event timezone.
- Invite 32-byte bearer token: hash plus AES-256-GCM ciphertext with invitation ID AAD.
- RSVP/wish optimistic concurrency, transactional idempotency, deadline now >= closes writes.
- Wish disclosure requires consent, approval, active invitation and published event; withdrawal remains available after deadline.
- XLSX 5 MB/2,000 rows, formula rejection, bounded archive parsing, preview and atomic commit.
- Media 10 MB/40 MP; authenticated staging, publish copies and asset reference protection.
- No real messages, guessed personal details, public deployment or paid services.
- New repository in the requested empty workspace, feature branch; no existing user code to isolate.

## Review Focus

- Two simultaneous writes with the same version: exactly one succeeds, no lost update.
- Revoked token replaying an old idempotency key: authentication still fails.
- Wish consent withdrawn or body edited while admin approves: no stale public disclosure.
- Import optional mapped blank versus unmapped fields: blank clears, unmapped preserves; archive/token/RSVP unchanged.
- Unpublished event, retained media and draft: never leak draft JSON or private assets.

### Task 1: Foundation, contracts, persistence and authentication

**Files:** root package/config/compose/env files; `packages/contracts/src/index.ts`; `apps/api/prisma/schema.prisma`, migrations; `apps/api/src/{config,db,crypto,http,auth,app}.ts`; `apps/api/tests/{domain,auth}.test.ts`.

**Interfaces:** contracts export contentSchema, guestSchema, revision validation and safe DTO shapes. API exports prisma, config, AppError, async handlers, requireAdmin, requireGuest, ownedEvent, hashToken/createInvitationToken/decryptInvitationToken. Express request context has admin, invitation and requestId. Routers mounted under `/api/v1`.

- [ ] Write tests for cryptographic roundtrip/wrong AAD, exact deadline, substitution allowlist, session isolation, CSRF and missing production secrets.
- [ ] Run `npm test` and observe missing behavior before implementation.
- [ ] Implement contracts, Prisma schema and explicit database constraints, config validation, error envelopes, sessions, origin/CSRF/rate limits and health checks.
- [ ] Run `npm run db:migrate`, `npm test`, `npm run typecheck`; expect all implemented foundation tests pass against real PostgreSQL.
- [ ] Commit foundation with no secrets.

### Task 2: Event content, guests, links, RSVP and wishes API

**Files:** `apps/api/src/{events,guests,responses}.ts`, `apps/api/src/domain.ts`, `apps/api/tests/flows.test.ts`.

**Interfaces:** consume Task 1 auth/context/Prisma/schema. Export routers eventsRouter, guestsRouter, guestRouter, wishesAdminRouter; revision hydration uses `mediaUrls(content, admin)` from Task 3. Endpoints follow source sections 12–13. Guest response includes content, guest, invitation, rsvp, wish, canRsvp/canCreateOrEditWish/canWithdrawWish and media map.

- [ ] Write tests for unpublished draft exclusion, stale versions, simultaneous RSVP, idempotency replay/body conflict/revocation, wish moderation/withdrawal/restore, cross-event owner access, archive/rotate invariants and dashboard sum.
- [ ] Run integration tests; expect behavioral failures before route implementation.
- [ ] Implement transactions, immutable revisions, lifecycle actions, accurate counters, consent moderation and cursor wall; calendar escaping and stable UID.
- [ ] Run `npm test` and `npm run typecheck`; expect tests pass with actual PostgreSQL constraints.
- [ ] Commit business API.

### Task 3: Excel and media

**Files:** `apps/api/src/{imports,media,storage}.ts`, parser worker, `apps/api/tests/{imports,media}.test.ts`.

**Interfaces:** consume Task 1 helpers/Prisma/shared schemas. Export importRouter and mediaRouter plus mediaUrls(content, admin) and preparePublishedMedia(eventId, content). Mount under API root. Admin routes use owner event; guest assets only published copies. Sheet inspection and template endpoints added to support UI, documented in OpenAPI.

- [ ] Write fixtures/tests for formulas, oversized zip, duplicate codes, invalid rows, mapped blank/unmapped preserve, stale preview, simultaneous/repeated commit, string-only exports, upload signature spoofing and referenced asset delete.
- [ ] Run focused tests first, expecting failure.
- [ ] Implement bounded worker parser, batch preview/transaction commit, Excel template/report/export, Sharp variants, local/S3 adapters and authenticated previews.
- [ ] Run focused plus complete API tests; expect import and media boundaries pass.
- [ ] Commit media/import feature.

### Task 4: Guest and admin web

**Files:** `apps/web/src/{main,api,App,Invitation,Admin,ContentEditor,Guests,Imports,Media,Wishes}.tsx` (API client `.ts`), `apps/web/src/styles.css`, Vite config and index HTML; `tests/e2e.spec.ts`.

**Interfaces:** consumes source endpoints and DTOs from Tasks 1–3, same origin `/api/v1`, CSRF fetched from auth/me; bearer token only for guest routes. Admin preview reuses Invitation rendering without writes. Assets from content hydration/media map.

- [ ] Write E2E acceptance path first: bootstrap login, draft/publish, Excel upload, two separate invite links, RSVP/wish/moderation/edit/withdraw, rotation and safe export. Add viewport/no horizontal overflow checks and independent form persistence on failures.
- [ ] Run test to confirm missing UI fails.
- [ ] Build cream/gold responsive invitation and working admin pages, accessible forms/error/loading/empty states, reduced motion, music user gesture, map, calendar and quick response.
- [ ] Run `npm run build`, `npm run typecheck`, `npm run test:e2e`; expect desktop and mobile Chromium pass.
- [ ] Commit web implementation.

### Task 5: Bootstrap, operations and complete verification

**Files:** `apps/api/src/cli.ts`; `scripts/*`; `README.md`, `docs/{openapi,admin,operations,verification}.*`; Playwright config; sample media generated locally and Excel template.

**Interfaces:** consumes all previous modules; commands `npm run dev`, `build`, `start`, `test`, `typecheck`, `db:migrate`, `admin:create`, `seed`, `maintenance`, `backup`, `restore`, `test:e2e`.

- [ ] Write and run CLI self-checks for repeat bootstrap preserving password, safe demo seed, migration freshness and restore roundtrip.
- [ ] Implement fake demo data only, versioned migrations, template generation, setup instructions, health readiness, production safeguards, backup/key/rollback runbooks and complete OpenAPI paths.
- [ ] Run clean database migration/bootstrap/seed; full test/typecheck/build/E2E; backup and restore into a separate database. Record actual results and unperformed device/load checks.
- [ ] Request independent whole-change review, fix important findings with regression tests, rerun relevant/full suite.
- [ ] Commit final source and report local URLs, commands, real test results and known verification limits.

## Execution record

Design approval: user said “ok” after being asked to approve the design and begin implementation. Continue within that authorization; no duplicate approval gate for routine implementation choices. Root implements foundation and integration; bounded independent work uses Superpowers parallel-agent workflow. Record task evidence in `docs/implementation-progress.md`.
