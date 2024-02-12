/*
  Warnings:

  - You are about to drop the `story_medias` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "story_medias" DROP CONSTRAINT "story_medias_storyId_fkey";

-- DropForeignKey
ALTER TABLE "story_medias" DROP CONSTRAINT "story_medias_uploadId_fkey";

-- DropTable
DROP TABLE "story_medias";

-- CreateTable
CREATE TABLE "story_urls" (
    "id" BIGINT NOT NULL,
    "storyId" BIGINT NOT NULL,
    "url" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_urls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_tags" (
    "id" BIGINT NOT NULL,
    "storyId" BIGINT NOT NULL,
    "creatorId" BIGINT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#484CFF',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "story_urls_storyId_idx" ON "story_urls"("storyId");

-- CreateIndex
CREATE INDEX "story_tags_storyId_idx" ON "story_tags"("storyId");

-- CreateIndex
CREATE INDEX "story_tags_creatorId_idx" ON "story_tags"("creatorId");

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_urls" ADD CONSTRAINT "story_urls_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_tags" ADD CONSTRAINT "story_tags_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_tags" ADD CONSTRAINT "story_tags_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
