-- CreateTable
CREATE TABLE "role_paid_posts" (
    "id" BIGINT NOT NULL,
    "roleId" BIGINT NOT NULL,
    "paidPostId" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_paid_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tier_paid_posts" (
    "id" BIGINT NOT NULL,
    "tierId" BIGINT NOT NULL,
    "paidPostId" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tier_paid_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_paid_posts" (
    "id" BIGINT NOT NULL,
    "userId" BIGINT NOT NULL,
    "paidPostId" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_paid_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_paid_posts_roleId_idx" ON "role_paid_posts"("roleId");

-- CreateIndex
CREATE INDEX "role_paid_posts_paidPostId_idx" ON "role_paid_posts"("paidPostId");

-- CreateIndex
CREATE INDEX "role_paid_posts_updatedAt_idx" ON "role_paid_posts"("updatedAt");

-- CreateIndex
CREATE INDEX "tier_paid_posts_tierId_idx" ON "tier_paid_posts"("tierId");

-- CreateIndex
CREATE INDEX "tier_paid_posts_paidPostId_idx" ON "tier_paid_posts"("paidPostId");

-- CreateIndex
CREATE INDEX "tier_paid_posts_updatedAt_idx" ON "tier_paid_posts"("updatedAt");

-- CreateIndex
CREATE INDEX "user_paid_posts_userId_idx" ON "user_paid_posts"("userId");

-- CreateIndex
CREATE INDEX "user_paid_posts_paidPostId_idx" ON "user_paid_posts"("paidPostId");

-- CreateIndex
CREATE INDEX "user_paid_posts_updatedAt_idx" ON "user_paid_posts"("updatedAt");

-- AddForeignKey
ALTER TABLE "role_paid_posts" ADD CONSTRAINT "role_paid_posts_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_paid_posts" ADD CONSTRAINT "role_paid_posts_paidPostId_fkey" FOREIGN KEY ("paidPostId") REFERENCES "paid_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tier_paid_posts" ADD CONSTRAINT "tier_paid_posts_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "tiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tier_paid_posts" ADD CONSTRAINT "tier_paid_posts_paidPostId_fkey" FOREIGN KEY ("paidPostId") REFERENCES "paid_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_paid_posts" ADD CONSTRAINT "user_paid_posts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_paid_posts" ADD CONSTRAINT "user_paid_posts_paidPostId_fkey" FOREIGN KEY ("paidPostId") REFERENCES "paid_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
