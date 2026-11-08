ALTER TABLE "Invitation"
  ADD COLUMN "allowMultipleResponses" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "familyParentId" UUID,
  ADD CONSTRAINT "Invitation_familyParentId_fkey"
    FOREIGN KEY ("familyParentId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Invitation_familyParentId_idx" ON "Invitation"("familyParentId");
