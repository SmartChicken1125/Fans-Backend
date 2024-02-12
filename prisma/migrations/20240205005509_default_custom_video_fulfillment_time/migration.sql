UPDATE "custom_video_settings" SET "fulfillmentTime" = 24 WHERE "fulfillmentTime" IS NULL;
-- AlterTable
ALTER TABLE "custom_video_settings" ALTER COLUMN "fulfillmentTime" SET NOT NULL,
ALTER COLUMN "fulfillmentTime" SET DEFAULT 24;
