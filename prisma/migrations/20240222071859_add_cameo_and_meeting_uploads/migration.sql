-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UploadUsageType" ADD VALUE 'VIDEO_CALL_PREVIEW';
ALTER TYPE "UploadUsageType" ADD VALUE 'CUSTOM_VIDEO_PREVIEW';
ALTER TYPE "UploadUsageType" ADD VALUE 'CUSTOM_VIDEO_REQUEST';

-- CreateTable
CREATE TABLE "meeting_preview_uploads" (
    "profileId" BIGINT NOT NULL,
    "uploadId" BIGINT NOT NULL,

    CONSTRAINT "meeting_preview_uploads_pkey" PRIMARY KEY ("profileId","uploadId")
);

-- CreateTable
CREATE TABLE "custom_video_preview_uploads" (
    "profileId" BIGINT NOT NULL,
    "uploadId" BIGINT NOT NULL,

    CONSTRAINT "custom_video_preview_uploads_pkey" PRIMARY KEY ("profileId","uploadId")
);

-- CreateTable
CREATE TABLE "custom_video_order_request_uploads" (
    "orderId" BIGINT NOT NULL,
    "uploadId" BIGINT NOT NULL,

    CONSTRAINT "custom_video_order_request_uploads_pkey" PRIMARY KEY ("orderId","uploadId")
);

-- CreateTable
CREATE TABLE "custom_video_order_response_uploads" (
    "orderId" BIGINT NOT NULL,
    "uploadId" BIGINT NOT NULL,

    CONSTRAINT "custom_video_order_response_uploads_pkey" PRIMARY KEY ("orderId","uploadId")
);

-- AddForeignKey
ALTER TABLE "meeting_preview_uploads" ADD CONSTRAINT "meeting_preview_uploads_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_preview_uploads" ADD CONSTRAINT "meeting_preview_uploads_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_video_preview_uploads" ADD CONSTRAINT "custom_video_preview_uploads_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_video_preview_uploads" ADD CONSTRAINT "custom_video_preview_uploads_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_video_order_request_uploads" ADD CONSTRAINT "custom_video_order_request_uploads_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "custom_video_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_video_order_request_uploads" ADD CONSTRAINT "custom_video_order_request_uploads_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_video_order_response_uploads" ADD CONSTRAINT "custom_video_order_response_uploads_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "custom_video_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_video_order_response_uploads" ADD CONSTRAINT "custom_video_order_response_uploads_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
