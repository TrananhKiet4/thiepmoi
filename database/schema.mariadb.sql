-- Cấu trúc cho database trống. Dữ liệu ghi theo UTC.
SET time_zone = '+00:00';

-- CreateTable
CREATE TABLE `AdminUser` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `disabledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AdminUser_email_key`(`email`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminSession` (
    `id` CHAR(36) NOT NULL,
    `adminId` CHAR(36) NOT NULL,
    `sessionHash` VARCHAR(191) NOT NULL,
    `csrfToken` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AdminSession_sessionHash_key`(`sessionHash`),
    INDEX `AdminSession_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Event` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `slug` VARCHAR(200) NOT NULL,
    `draftRevisionId` CHAR(36) NULL,
    `publishedRevisionId` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `publishedAt` DATETIME(3) NULL,
    `rsvpEnabled` BOOLEAN NOT NULL DEFAULT true,
    `wishesEnabled` BOOLEAN NOT NULL DEFAULT true,
    `wallEnabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Event_slug_key`(`slug`),
    UNIQUE INDEX `Event_draftRevisionId_key`(`draftRevisionId`),
    INDEX `Event_ownerId_createdAt_idx`(`ownerId`, `createdAt`),
    UNIQUE INDEX `Event_id_ownerId_key`(`id`, `ownerId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventRevision` (
    `id` CHAR(36) NOT NULL,
    `eventId` CHAR(36) NOT NULL,
    `revisionNo` INTEGER NOT NULL,
    `schemaVersion` INTEGER NOT NULL DEFAULT 1,
    `contentJson` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EventRevision_eventId_revisionNo_key`(`eventId`, `revisionNo`),
    UNIQUE INDEX `EventRevision_id_eventId_key`(`id`, `eventId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Guest` (
    `id` CHAR(36) NOT NULL,
    `eventId` CHAR(36) NOT NULL,
    `guestCode` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL DEFAULT '',
    `groupKey` VARCHAR(191) NOT NULL DEFAULT '',
    `salutation` VARCHAR(191) NOT NULL DEFAULT '',
    `email` VARCHAR(254) NOT NULL DEFAULT '',
    `phone` VARCHAR(191) NOT NULL DEFAULT '',
    `archivedAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Guest_eventId_archivedAt_guestCode_idx`(`eventId`, `archivedAt`, `guestCode`),
    INDEX `Guest_eventId_groupKey_idx`(`eventId`, `groupKey`),
    UNIQUE INDEX `Guest_eventId_guestCode_key`(`eventId`, `guestCode`),
    UNIQUE INDEX `Guest_id_eventId_key`(`id`, `eventId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invitation` (
    `id` CHAR(36) NOT NULL,
    `eventId` CHAR(36) NOT NULL,
    `guestId` CHAR(36) NOT NULL,
    `allowMultipleResponses` BOOLEAN NOT NULL DEFAULT false,
    `familyParentId` CHAR(36) NULL,
    `personalMessage` VARCHAR(1000) NOT NULL DEFAULT '',
    `letterTitle` VARCHAR(200) NOT NULL DEFAULT '',
    `letterMessage` VARCHAR(2000) NOT NULL DEFAULT '',
    `tokenHash` VARCHAR(191) NOT NULL,
    `tokenCiphertext` VARCHAR(191) NOT NULL,
    `keyVersion` VARCHAR(191) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `openedAt` DATETIME(3) NULL,
    `lastOpenedAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Invitation_guestId_key`(`guestId`),
    UNIQUE INDEX `Invitation_tokenHash_key`(`tokenHash`),
    INDEX `Invitation_eventId_revokedAt_idx`(`eventId`, `revokedAt`),
    INDEX `Invitation_familyParentId_idx`(`familyParentId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvitationLink` (
    `codeHash` VARCHAR(191) NOT NULL,
    `invitationId` CHAR(36) NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `restoredTokenHash` VARCHAR(191) NULL,
    `slug` VARCHAR(200) NOT NULL,
    `codeCiphertext` VARCHAR(191) NOT NULL,
    `keyVersion` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `InvitationLink_invitationId_tokenHash_slug_key`(`invitationId`, `tokenHash`, `slug`),
    PRIMARY KEY (`codeHash`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RSVP` (
    `id` CHAR(36) NOT NULL,
    `invitationId` CHAR(36) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `version` INTEGER NOT NULL DEFAULT 1,
    `respondedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RSVP_invitationId_key`(`invitationId`),
    INDEX `RSVP_status_idx`(`status`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Wish` (
    `id` CHAR(36) NOT NULL,
    `invitationId` CHAR(36) NOT NULL,
    `body` VARCHAR(1000) NOT NULL,
    `consentPublic` BOOLEAN NOT NULL DEFAULT false,
    `consentAttendancePublic` BOOLEAN NOT NULL DEFAULT false,
    `moderationStatus` VARCHAR(191) NOT NULL DEFAULT 'NONE',
    `isPinned` BOOLEAN NOT NULL DEFAULT false,
    `approvedAt` DATETIME(3) NULL,
    `approvedBy` CHAR(36) NULL,
    `deletedAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Wish_invitationId_key`(`invitationId`),
    INDEX `Wish_moderationStatus_isPinned_approvedAt_id_idx`(`moderationStatus`, `isPinned`, `approvedAt`, `id`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ImportBatch` (
    `id` CHAR(36) NOT NULL,
    `eventId` CHAR(36) NOT NULL,
    `createdBy` CHAR(36) NOT NULL,
    `fileHash` VARCHAR(191) NOT NULL,
    `mappingJson` JSON NOT NULL,
    `normalizedRowsJson` JSON NOT NULL,
    `summaryJson` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PREVIEWED',
    `expiresAt` DATETIME(3) NOT NULL,
    `committedAt` DATETIME(3) NULL,
    `resultJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ImportBatch_eventId_status_expiresAt_idx`(`eventId`, `status`, `expiresAt`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` CHAR(36) NOT NULL,
    `actorAdminId` CHAR(36) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` CHAR(36) NOT NULL,
    `eventId` CHAR(36) NOT NULL,
    `metadata` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_eventId_createdAt_idx`(`eventId`, `createdAt`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IdempotencyRecord` (
    `id` CHAR(36) NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `actorKeyHash` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `requestHash` VARCHAR(191) NOT NULL,
    `responseStatus` INTEGER NOT NULL,
    `responseJson` JSON NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `IdempotencyRecord_expiresAt_idx`(`expiresAt`),
    UNIQUE INDEX `IdempotencyRecord_scope_actorKeyHash_key_key`(`scope`, `actorKeyHash`, `key`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TemporaryObject` (
    `id` CHAR(36) NOT NULL,
    `adminId` CHAR(36) NOT NULL,
    `eventId` CHAR(36) NOT NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `originalName` VARCHAR(255) NOT NULL,
    `bytes` INTEGER NOT NULL,
    `uploadExpiresAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `claimedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TemporaryObject_storageKey_key`(`storageKey`),
    INDEX `TemporaryObject_adminId_expiresAt_idx`(`adminId`, `expiresAt`),
    INDEX `TemporaryObject_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RateLimitBucket` (
    `key` VARCHAR(191) NOT NULL,
    `hits` INTEGER NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `RateLimitBucket_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AdminSession` ADD CONSTRAINT `AdminSession_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventRevision` ADD CONSTRAINT `EventRevision_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Guest` ADD CONSTRAINT `Guest_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invitation` ADD CONSTRAINT `Invitation_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invitation` ADD CONSTRAINT `Invitation_guestId_fkey` FOREIGN KEY (`guestId`) REFERENCES `Guest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invitation` ADD CONSTRAINT `Invitation_familyParentId_fkey` FOREIGN KEY (`familyParentId`) REFERENCES `Invitation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvitationLink` ADD CONSTRAINT `InvitationLink_invitationId_fkey` FOREIGN KEY (`invitationId`) REFERENCES `Invitation`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `RSVP` ADD CONSTRAINT `RSVP_invitationId_fkey` FOREIGN KEY (`invitationId`) REFERENCES `Invitation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Wish` ADD CONSTRAINT `Wish_invitationId_fkey` FOREIGN KEY (`invitationId`) REFERENCES `Invitation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ImportBatch` ADD CONSTRAINT `ImportBatch_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemporaryObject` ADD CONSTRAINT `TemporaryObject_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemporaryObject` ADD CONSTRAINT `TemporaryObject_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Event` ADD CONSTRAINT `Event_draft_same_event` FOREIGN KEY (`draftRevisionId`, `id`) REFERENCES `EventRevision` (`id`, `eventId`);
ALTER TABLE `Event` ADD CONSTRAINT `Event_published_same_event` FOREIGN KEY (`publishedRevisionId`, `id`) REFERENCES `EventRevision` (`id`, `eventId`);
ALTER TABLE `Invitation` ADD CONSTRAINT `Invitation_guest_same_event` FOREIGN KEY (`guestId`, `eventId`) REFERENCES `Guest` (`id`, `eventId`);
ALTER TABLE `ImportBatch` ADD CONSTRAINT `ImportBatch_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `AdminUser` (`id`);
ALTER TABLE `Wish` ADD CONSTRAINT `Wish_approvedBy_fkey` FOREIGN KEY (`approvedBy`) REFERENCES `AdminUser` (`id`);
ALTER TABLE `RSVP` ADD CONSTRAINT `RSVP_status_valid` CHECK (`status` IN ('ATTENDING', 'DECLINED'));
ALTER TABLE `Wish` ADD CONSTRAINT `Wish_moderation_valid` CHECK (`moderationStatus` IN ('NONE', 'PENDING', 'APPROVED', 'HIDDEN'));
ALTER TABLE `Wish` ADD CONSTRAINT `Wish_approval_requires_consent` CHECK (`moderationStatus` <> 'APPROVED' OR `consentPublic`);
ALTER TABLE `Wish` ADD CONSTRAINT `Wish_pin_requires_public` CHECK (NOT `isPinned` OR (`moderationStatus` = 'APPROVED' AND `consentPublic` AND `deletedAt` IS NULL));
ALTER TABLE `Wish` ADD CONSTRAINT `Wish_body_length` CHECK (CHAR_LENGTH(`body`) BETWEEN 1 AND 1000);
ALTER TABLE `Guest` ADD CONSTRAINT `Guest_code_valid` CHECK (BINARY `guestCode` REGEXP '^[A-Z0-9_-]{1,40}$');
ALTER TABLE `Guest` ADD CONSTRAINT `Guest_name_valid` CHECK (CHAR_LENGTH(TRIM(`fullName`)) BETWEEN 1 AND 120);
ALTER TABLE `InvitationLink` ADD CONSTRAINT `InvitationLink_retired_fields_cleared` CHECK (`invitationId` IS NOT NULL OR (`tokenHash` = '' AND `restoredTokenHash` IS NULL AND `slug` = '' AND `codeCiphertext` = '' AND `keyVersion` = ''));
