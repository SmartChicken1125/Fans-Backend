-- CreateEnum
CREATE TYPE "MeetingSettingsProgress" AS ENUM ('None', 'Pricing', 'Availability', 'Content', 'Description', 'Notifications', 'Completed');

-- AlterTable
ALTER TABLE "meeting_settings" ADD COLUMN     "progress" "MeetingSettingsProgress" NOT NULL DEFAULT 'None';
