/*
  Warnings:

  - Made the column `userId` on table `story_tags` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "story_tags" ALTER COLUMN "userId" SET NOT NULL;
