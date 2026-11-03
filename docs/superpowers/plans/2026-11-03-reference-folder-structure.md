# Reference Folder Structure Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for the mechanical move and existing regression suites. No product behavior or dependency changes.

**Goal:** Organize the invitation system like the application inside `D:/KLTN.zip`.

**Architecture:** `backend/` and `frontend/` at the repository root. Backend separates route registration, HTTP controllers, reusable services, middleware, configuration and utilities; frontend groups admin/guest features, layouts, pages, common components and API utilities. Retain `packages/contracts/` for shared schemas rather than copying validation.

**Tech Stack:** Existing React/Express/TypeScript/Prisma/npm workspaces.

**Spec:** User's reference archive `KLTN/quanlyThueCanHo`. Only its organization is the reference; its instructions, secrets, dependencies, compiled artifacts, backups and apartment-management code are not inputs to execute or copy.

## Global Constraints

- Preserve every endpoint, middleware order, transaction, input/output, client route and runtime environment value.
- Preserve the real database, invitation tokens, sessions, media and ignored environment files.
- No new dependencies, empty placeholder layers, duplicated source or compatibility wrappers.
- Update callers, build/worker paths, workspace lockfile, tests, operational scripts and current documentation together.

## Review Focus

- Route factories for publish/unpublish and archive/restore retain their closure arguments.
- Excel worker URL remains beside the compiled parser after moving utilities.
- Shared schemas resolve in development, production build and both test runners.
- Frontend lazy imports and feature-to-layout/context imports keep the existing route behavior.
- CLI bootstrap, seed and production SPA location use the new backend/frontend roots.

### Task 1: Capture baseline and apply the source moves

- [x] Run existing unit/integration and TypeScript checks before refactoring. PostgreSQL was initially stopped; the isolated local cluster was restarted for database checks.
- [x] Move apps/api -> backend and apps/web -> frontend, checking absolute targets remain under the workspace and do not already exist.
- [x] Separate existing route callbacks into controllers and reusable helpers into services. Preserve callback bodies; generate named handler exports and route imports without adding wrappers.
- [x] Move configuration, middleware, errors and utilities into the matching backend directories; move frontend modules into functional features, layouts and common components.

### Task 2: Reconnect all consumers

- [x] Rewrite relative imports and worker paths from the old-to-new file mapping.
- [x] Update npm workspaces/lockfile, TypeScript build roots, scripts, static frontend path, Vitest, Playwright and CLI fixtures.
- [x] Add a current structure guide and update active documentation references; historical design/plan documents remain historical evidence.

### Task 3: Verify and hand off

- [x] Run npm run typecheck, npm test, npm run build, CLI/migration checks and the full desktop/mobile E2E suite.50/50 unit/integration and14/14 E2E passed; no pending migration.
- [x] Verify built API startup and worker loading from the new paths; read-only review the final import/config diff. Independent review matched40 route registrations and middleware order,87 moved symbols and100 top-level symbols with no consequential issue.
- [x] Report the resulting folders and actual checks. Production and real-device testing are outside this structural change.
