CREATE TABLE "TemporaryObject" (
 "id" UUID NOT NULL,
 "adminId" UUID NOT NULL,
 "eventId" UUID NOT NULL,
 "purpose" TEXT NOT NULL,
 "storageKey" TEXT NOT NULL,
 "originalName" TEXT NOT NULL,
 "bytes" INTEGER NOT NULL,
 "uploadExpiresAt" TIMESTAMPTZ(3) NOT NULL,
 "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 "claimedAt" TIMESTAMPTZ(3),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TemporaryObject_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "TemporaryObject_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "TemporaryObject_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TemporaryObject_storageKey_key" ON "TemporaryObject"("storageKey");
CREATE INDEX "TemporaryObject_adminId_expiresAt_idx" ON "TemporaryObject"("adminId","expiresAt");
CREATE INDEX "TemporaryObject_expiresAt_idx" ON "TemporaryObject"("expiresAt");
CREATE TABLE "RateLimitBucket" (
 "key" TEXT NOT NULL,
 "hits" INTEGER NOT NULL,
 "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");
ALTER TABLE "TemporaryObject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RateLimitBucket" ENABLE ROW LEVEL SECURITY;
