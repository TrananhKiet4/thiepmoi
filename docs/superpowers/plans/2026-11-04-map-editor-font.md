# Map Editor and Vietnamese Font Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to execute inline with tests and one final independent review.

**Goal:** Replace coordinate entry with safe Maps links and a campus image, simplify the editor and correct Vietnamese serif rendering.
**Spec:** docs/superpowers/specs/2026-11-04-map-editor-font-design.md
**Architecture:** Existing JSON contracts/immutable revisions, MediaAsset and uploader; no database migration or dependencies.

## Global constraints

- Preserve old revisions and caller compatibility; no production content mutation to test.
- IMAGE assets only for school map; all asset ownership/publish/delete guarantees apply.
- Google Maps HTTPS allowlist; no short-link expansion/server fetching.
- Remove the three confirmed editor blocks; new editable drafts have no separate meetup, deadlines or group opening templates. Retain manual response toggles.
- Use complete Vietnamese glyph coverage from an existing system serif; no external font requests.

## Review focus

- Old coordinate JSON must load without crashing and remain initially clean in editor.
- No-deadline RSVP stays gated by manual event controls; legacy cutoffs still work.
- Campus image must count as a revision reference and never accept audio at publish.
- Async image upload must not overwrite a name/address edited while upload was running.
- Google lookalike domains, credentials and javascript URLs must be rejected.

## Tasks

- [x] Contract: RED tests in packages/contracts/src/index.test.ts for Maps links, null deadline, assetIds and editableContent; implement location fields, Google URL validation, legacy parser and editable normalization; update demo fixtures/calendar types as needed. GREEN focused/backend tests.
- [x] Editor: add shared uploadMedia helper consumed by media library and new MapImageField; functional updates for async upload. Normalize initial/baseline state; remove coordinate controls and three blocks; remove obsolete map source selector. Add E2E for save/reload/map upload and absence of removed fields.
- [x] Guest/font: render full campus image + safe Maps link, remove meetup/deadline presentation. Replace Georgia with Times New Roman. Verify glyph coverage and desktop/mobile layout with screenshots.
- [ ] Verify/review/release: typecheck, full backend, build, E2E, fresh read-only reviewer; fix material regressions, build/deploy same Vercel project and verify read-only production UI. Keep user .gitignore/package edits uncommitted and unchanged.
