BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE INDEX "Event_ownerId_createdAt_idx" ON "Event"("ownerId", "createdAt" DESC);
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");
CREATE INDEX "MediaAsset_eventId_createdAt_idx" ON "MediaAsset"("eventId", "createdAt" DESC);

COMMIT;
