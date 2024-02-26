/*
  Warnings:

  - You are about to drop the column `image` on the `reports_for_user` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "reports_for_user" DROP COLUMN "image",
ADD COLUMN     "thumbId" BIGINT;

-- AddForeignKey
ALTER TABLE "reports_for_user" ADD CONSTRAINT "reports_for_user_thumbId_fkey" FOREIGN KEY ("thumbId") REFERENCES "uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
