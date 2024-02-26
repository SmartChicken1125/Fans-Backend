-- CreateTable
CREATE TABLE "story_texts" (
    "id" BIGINT NOT NULL,
    "storyId" BIGINT NOT NULL,
    "text" TEXT NOT NULL,
    "color" TEXT,
    "font" TEXT,
    "pointX" INTEGER NOT NULL DEFAULT 0,
    "pointY" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_texts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "story_texts_storyId_idx" ON "story_texts"("storyId");

-- AddForeignKey
ALTER TABLE "story_texts" ADD CONSTRAINT "story_texts_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
