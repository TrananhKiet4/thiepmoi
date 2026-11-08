-- CreateTable
CREATE TABLE "InvitationLink" (
    "codeHash" TEXT NOT NULL,
    "invitationId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "codeCiphertext" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvitationLink_pkey" PRIMARY KEY ("codeHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvitationLink_invitationId_tokenHash_slug_key" ON "InvitationLink"("invitationId", "tokenHash", "slug");

-- AddForeignKey
ALTER TABLE "InvitationLink" ADD CONSTRAINT "InvitationLink_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InvitationLink" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "InvitationLink" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE "InvitationLink" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE "InvitationLink" FROM authenticated; END IF;
END $$;
