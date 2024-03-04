-- CreateTable
CREATE TABLE "top_fan_notifications" (
    "id" BIGINT NOT NULL,
    "profileId" BIGINT NOT NULL,
    "top1Enabled" BOOLEAN NOT NULL DEFAULT false,
    "top5Enabled" BOOLEAN NOT NULL DEFAULT false,
    "top10Enabled" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT,
    "image" BIGINT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "top_fan_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "top1_fans" (
    "id" BIGINT NOT NULL,
    "userId" BIGINT NOT NULL,
    "creatorId" BIGINT NOT NULL,
    "topFanNotificationId" BIGINT,

    CONSTRAINT "top1_fans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "top5_fans" (
    "id" BIGINT NOT NULL,
    "userId" BIGINT NOT NULL,
    "creatorId" BIGINT NOT NULL,
    "topFanNotificationId" BIGINT,

    CONSTRAINT "top5_fans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "top10_fans" (
    "id" BIGINT NOT NULL,
    "userId" BIGINT NOT NULL,
    "creatorId" BIGINT NOT NULL,
    "topFanNotificationId" BIGINT,

    CONSTRAINT "top10_fans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "top_fan_notifications_profileId_idx" ON "top_fan_notifications"("profileId");

-- CreateIndex
CREATE INDEX "top_fan_notifications_updatedAt_idx" ON "top_fan_notifications"("updatedAt");

-- CreateIndex
CREATE INDEX "top1_fans_userId_idx" ON "top1_fans"("userId");

-- CreateIndex
CREATE INDEX "top1_fans_creatorId_idx" ON "top1_fans"("creatorId");

-- CreateIndex
CREATE INDEX "top5_fans_userId_idx" ON "top5_fans"("userId");

-- CreateIndex
CREATE INDEX "top5_fans_creatorId_idx" ON "top5_fans"("creatorId");

-- CreateIndex
CREATE INDEX "top10_fans_userId_idx" ON "top10_fans"("userId");

-- CreateIndex
CREATE INDEX "top10_fans_creatorId_idx" ON "top10_fans"("creatorId");

-- AddForeignKey
ALTER TABLE "top_fan_notifications" ADD CONSTRAINT "top_fan_notifications_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "top1_fans" ADD CONSTRAINT "top1_fans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "top1_fans" ADD CONSTRAINT "top1_fans_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "top1_fans" ADD CONSTRAINT "top1_fans_topFanNotificationId_fkey" FOREIGN KEY ("topFanNotificationId") REFERENCES "top_fan_notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "top5_fans" ADD CONSTRAINT "top5_fans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "top5_fans" ADD CONSTRAINT "top5_fans_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "top5_fans" ADD CONSTRAINT "top5_fans_topFanNotificationId_fkey" FOREIGN KEY ("topFanNotificationId") REFERENCES "top_fan_notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "top10_fans" ADD CONSTRAINT "top10_fans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "top10_fans" ADD CONSTRAINT "top10_fans_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "top10_fans" ADD CONSTRAINT "top10_fans_topFanNotificationId_fkey" FOREIGN KEY ("topFanNotificationId") REFERENCES "top_fan_notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
