-- CreateEnum
CREATE TYPE "VideoCallStatus" AS ENUM ('Started', 'Ended');

-- AlterTable
ALTER TABLE "video_calls" ADD COLUMN     "endCallJobId" TEXT,
ADD COLUMN     "status" "VideoCallStatus" NOT NULL DEFAULT 'Started';
