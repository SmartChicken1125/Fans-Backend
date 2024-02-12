-- CreateEnum
CREATE TYPE "CustomVideoOrderStatus" AS ENUM ('Pending', 'Cancelled', 'Declined', 'Accepted', 'Completed');

-- CreateEnum
CREATE TYPE "Pronoun" AS ENUM ('He', 'She', 'They');

-- CreateTable
CREATE TABLE "custom_video_order" (
    "id" BIGINT NOT NULL,
    "status" "CustomVideoOrderStatus" NOT NULL DEFAULT 'Pending',
    "recipientName" TEXT,
    "recipientPronoun" "Pronoun",
    "instructions" TEXT,
    "review" TEXT,
    "score" INTEGER,
    "duration" INTEGER NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fanId" BIGINT NOT NULL,
    "creatorId" BIGINT NOT NULL,

    CONSTRAINT "custom_video_order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_video_order_fanId_idx" ON "custom_video_order"("fanId");

-- CreateIndex
CREATE INDEX "custom_video_order_creatorId_idx" ON "custom_video_order"("creatorId");

-- AddForeignKey
ALTER TABLE "custom_video_order" ADD CONSTRAINT "custom_video_order_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_video_order" ADD CONSTRAINT "custom_video_order_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
