-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "disabledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "draftRevisionId" UUID,
    "publishedRevisionId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMPTZ(3),
    "rsvpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "wishesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "wallEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRevision" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "contentJson" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guest" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "guestCode" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "groupKey" TEXT NOT NULL DEFAULT '',
    "salutation" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "archivedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "guestId" UUID NOT NULL,
    "personalMessage" TEXT NOT NULL DEFAULT '',
    "tokenHash" TEXT NOT NULL,
    "tokenCiphertext" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "openedAt" TIMESTAMPTZ(3),
    "lastOpenedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RSVP" (
    "id" UUID NOT NULL,
    "invitationId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "respondedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RSVP_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wish" (
    "id" UUID NOT NULL,
    "invitationId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "consentPublic" BOOLEAN NOT NULL DEFAULT false,
    "moderationStatus" TEXT NOT NULL DEFAULT 'NONE',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMPTZ(3),
    "approvedBy" UUID,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Wish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "alt" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'READY',
    "variants" JSONB NOT NULL DEFAULT '{}',
    "publicReady" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "createdBy" UUID NOT NULL,
    "fileHash" TEXT NOT NULL,
    "mappingJson" JSONB NOT NULL,
    "normalizedRowsJson" JSONB NOT NULL,
    "summaryJson" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVIEWED',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "committedAt" TIMESTAMPTZ(3),
    "resultJson" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorAdminId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "actorKeyHash" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseJson" JSONB NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_sessionHash_key" ON "AdminSession"("sessionHash");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Event_draftRevisionId_key" ON "Event"("draftRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_id_ownerId_key" ON "Event"("id", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRevision_eventId_revisionNo_key" ON "EventRevision"("eventId", "revisionNo");

-- CreateIndex
CREATE UNIQUE INDEX "EventRevision_id_eventId_key" ON "EventRevision"("id", "eventId");

-- CreateIndex
CREATE INDEX "Guest_eventId_archivedAt_guestCode_idx" ON "Guest"("eventId", "archivedAt", "guestCode");

-- CreateIndex
CREATE INDEX "Guest_eventId_groupKey_idx" ON "Guest"("eventId", "groupKey");

-- CreateIndex
CREATE UNIQUE INDEX "Guest_eventId_guestCode_key" ON "Guest"("eventId", "guestCode");

-- CreateIndex
CREATE UNIQUE INDEX "Guest_id_eventId_key" ON "Guest"("id", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_guestId_key" ON "Invitation"("guestId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_eventId_revokedAt_idx" ON "Invitation"("eventId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RSVP_invitationId_key" ON "RSVP"("invitationId");

-- CreateIndex
CREATE INDEX "RSVP_status_idx" ON "RSVP"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Wish_invitationId_key" ON "Wish"("invitationId");

-- CreateIndex
CREATE INDEX "Wish_moderationStatus_isPinned_approvedAt_id_idx" ON "Wish"("moderationStatus", "isPinned", "approvedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "ImportBatch_eventId_status_expiresAt_idx" ON "ImportBatch"("eventId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_eventId_createdAt_idx" ON "AuditLog"("eventId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_scope_actorKeyHash_key_key" ON "IdempotencyRecord"("scope", "actorKeyHash", "key");

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRevision" ADD CONSTRAINT "EventRevision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RSVP" ADD CONSTRAINT "RSVP_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wish" ADD CONSTRAINT "Wish_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enforce cross-event ownership even when a caller bypasses HTTP validation.
ALTER TABLE "Event" ADD CONSTRAINT "Event_draft_same_event" FOREIGN KEY ("draftRevisionId", "id") REFERENCES "EventRevision"("id", "eventId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Event" ADD CONSTRAINT "Event_published_same_event" FOREIGN KEY ("publishedRevisionId", "id") REFERENCES "EventRevision"("id", "eventId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_guest_same_event" FOREIGN KEY ("guestId", "eventId") REFERENCES "Guest"("id", "eventId");
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "AdminUser"("id");
ALTER TABLE "Wish" ADD CONSTRAINT "Wish_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "AdminUser"("id");
ALTER TABLE "RSVP" ADD CONSTRAINT "RSVP_status_valid" CHECK ("status" IN ('ATTENDING', 'DECLINED'));
ALTER TABLE "Wish" ADD CONSTRAINT "Wish_moderation_valid" CHECK ("moderationStatus" IN ('NONE', 'PENDING', 'APPROVED', 'HIDDEN'));
ALTER TABLE "Wish" ADD CONSTRAINT "Wish_approval_requires_consent" CHECK ("moderationStatus" <> 'APPROVED' OR "consentPublic");
ALTER TABLE "Wish" ADD CONSTRAINT "Wish_pin_requires_public" CHECK (NOT "isPinned" OR ("moderationStatus" = 'APPROVED' AND "consentPublic" AND "deletedAt" IS NULL));
ALTER TABLE "Wish" ADD CONSTRAINT "Wish_body_length" CHECK (char_length("body") BETWEEN 1 AND 1000);
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_code_valid" CHECK ("guestCode" ~ '^[A-Z0-9_-]{1,40}$');
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_name_valid" CHECK (char_length(btrim("fullName")) BETWEEN 1 AND 120);
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_type_valid" CHECK ("type" IN ('IMAGE', 'AUDIO'));
CREATE FUNCTION reject_revision_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'EventRevision is immutable'; END;
$$;
CREATE TRIGGER revision_is_immutable BEFORE UPDATE ON "EventRevision" FOR EACH ROW EXECUTE FUNCTION reject_revision_update();
