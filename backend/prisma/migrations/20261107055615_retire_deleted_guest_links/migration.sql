BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

ALTER TABLE "InvitationLink"
  ALTER COLUMN "invitationId" DROP NOT NULL,
  ADD CONSTRAINT "InvitationLink_retired_fields_cleared" CHECK (
    "invitationId" IS NOT NULL OR (
      "tokenHash" = '' AND "restoredTokenHash" IS NULL AND "slug" = ''
      AND "codeCiphertext" = '' AND "keyVersion" = ''
    )
  );

COMMIT;
