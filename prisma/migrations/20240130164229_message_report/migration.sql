-- CreateEnum
CREATE TYPE "MessageReportFlag" AS ENUM ('ILLEGAL_CONTENT', 'UNDERAGE_USER', 'IMPERSONATION_OR_IDENTITY_THEFT', 'PROMOTING_HATE_SPEECH_OR_DISCRIMINATION', 'PROMOTING_DANGEROUS_BEHAVIORS', 'INVOLVED_IN_SPAN_OR_SCAM_ACTIVITIES', 'INFRINGEMENT_OF_MY_COPYRIGHT', 'OTHER');

-- CreateTable
CREATE TABLE "reports_for_message" (
    "id" BIGINT NOT NULL,
    "userId" BIGINT NOT NULL,
    "messageId" BIGINT NOT NULL,
    "flag" "MessageReportFlag" NOT NULL DEFAULT 'OTHER',
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_for_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_for_message_userId_idx" ON "reports_for_message"("userId");

-- CreateIndex
CREATE INDEX "reports_for_message_messageId_idx" ON "reports_for_message"("messageId");

-- CreateIndex
CREATE INDEX "reports_for_message_status_idx" ON "reports_for_message" USING HASH ("status");

-- CreateIndex
CREATE INDEX "reports_for_message_reason_idx" ON "reports_for_message"("reason");

-- CreateIndex
CREATE INDEX "reports_for_message_updatedAt_idx" ON "reports_for_message"("updatedAt");

-- AddForeignKey
ALTER TABLE "reports_for_message" ADD CONSTRAINT "reports_for_message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports_for_message" ADD CONSTRAINT "reports_for_message_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
