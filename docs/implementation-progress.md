# Implementation progress

Plan: docs/superpowers/plans/2026-11-03-invitation-system.md

- Design approved 2026-11-03 by user. Empty workspace; work in requested directory on a new feature branch.
- Pre-flight: all tasks share contracts and database; freeze interfaces before independent module implementation.
- Execution: native foundation/integration with independent web and import/media modules delegated under the parallel-agent skill. Do not ask again for already-authorized implementation.
- Foundation: real PostgreSQL18.4 cluster at loopback54329, separate development/test/E2E DBs; migration applied with FK/CHECK/immutable-revision trigger. Crypto/domain5 and auth/limiter6 checks pass.
- Business API: events/guests/RSVP/wishes complete; 13 PostgreSQL flow checks passed, including simultaneous idempotency and safe DTO regressions.
- Excel/media: 22 focused checks pass, including actual ZIP inflation cap, stale/atomic commit, safe export cells, private/public media, real MP3/M4A decode and corrupted audio rejection.
- Web: build/typecheck passed; desktop/mobile full E2E is being verified. An explicit-label accessibility issue was reproduced and fixed; frozen final run pending.
- Bootstrap: CLI regression RED (new admin had no event), GREEN (unpublished initial draft and idempotent credentials); seed reuses pristine initial draft and preserves existing user changes.
- Contracts: missing draft dates and unnormalized Vietnamese group labels reproduced, then 2 checks GREEN; publication still validates complete dates.
- Backup: pg_dump and pg_restore into separate invitations_restore_20261103 succeeded; counts Event1/Guest12/Invitation12/RSVP0/Wish0 match source, and all12 restored tokens decrypt to their stored hash.
- Ruling: native PostgreSQL replaces unavailable Docker for this local verification — virtualization is disabled, real production DB constraints still exercised — Docker recipe retained for other machines.
- Ruling: only private S3 preview is proxied through authenticated same-origin route — prevents CSP mismatch without exposing private bucket URL — production S3 roundtrip remains unverified without credentials.
- Ruling: key ring plus intentional link rotation is the V1 key retirement workflow — preserves source's supported alternative without adding a bulk re-encryption tool — retiring an old key requires rotating affected links.
- Windows startup correction: killing the first terminal-owned initializer stopped its PostgreSQL child. setup:local now uses hidden Start-Process detachment, and a fresh connection/restore validation succeeded after helper exited.
