/*
  Warnings:

  - You are about to drop the `_MessageToUpload` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_MessageToUpload" DROP CONSTRAINT "_MessageToUpload_A_fkey";

-- DropForeignKey
ALTER TABLE "_MessageToUpload" DROP CONSTRAINT "_MessageToUpload_B_fkey";

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "uploadId" BIGINT,
ADD COLUMN     "value" TEXT;

-- AlterTable
ALTER TABLE "uploads" ADD COLUMN     "messageId" BIGINT,
ADD COLUMN     "previewMessageId" BIGINT;

-- DropTable
DROP TABLE "_MessageToUpload";

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_previewMessageId_fkey" FOREIGN KEY ("previewMessageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
