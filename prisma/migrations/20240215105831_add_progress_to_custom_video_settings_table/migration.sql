-- CreateEnum
CREATE TYPE "CameoSettingsProgress" AS ENUM ('None', 'Pricing', 'Content', 'RequestLimits', 'Description', 'Notifications', 'Completed');

-- AlterTable
ALTER TABLE "custom_video_settings" ADD COLUMN     "progress" "CameoSettingsProgress" NOT NULL DEFAULT 'None';
