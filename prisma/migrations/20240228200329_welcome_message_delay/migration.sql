-- AlterTable
ALTER TABLE "welcome_messages" ADD COLUMN     "delay" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isDelayEnabled" BOOLEAN NOT NULL DEFAULT false;
