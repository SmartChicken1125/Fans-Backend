/*
  Warnings:

  - You are about to drop the column `videoStreamId` on the `custom_video_order` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "UploadUsageType" ADD VALUE 'CUSTOM_VIDEO';

-- AlterTable
ALTER TABLE "custom_video_order" DROP COLUMN "videoStreamId",
ADD COLUMN     "videoUploadId" BIGINT;

-- AddForeignKey
ALTER TABLE "custom_video_order" ADD CONSTRAINT "custom_video_order_videoUploadId_fkey" FOREIGN KEY ("videoUploadId") REFERENCES "uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
