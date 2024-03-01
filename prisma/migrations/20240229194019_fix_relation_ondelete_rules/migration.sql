/*
  Warnings:

  - You are about to drop the column `ageVerifyId` on the `profiles` table. All the data in the column will be lost.
  - You are about to drop the column `ageVerifyStatus` on the `profiles` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "cameo_payments" DROP CONSTRAINT "cameo_payments_creatorId_fkey";

-- DropForeignKey
ALTER TABLE "cameo_payments" DROP CONSTRAINT "cameo_payments_userId_fkey";

-- DropForeignKey
ALTER TABLE "creator_referral_transactions" DROP CONSTRAINT "creator_referral_transactions_referentId_fkey";

-- DropForeignKey
ALTER TABLE "creator_referral_transactions" DROP CONSTRAINT "creator_referral_transactions_referrerId_fkey";

-- DropForeignKey
ALTER TABLE "fan_referral_transactions" DROP CONSTRAINT "fan_referral_transactions_creatorId_fkey";

-- DropForeignKey
ALTER TABLE "fan_referral_transactions" DROP CONSTRAINT "fan_referral_transactions_fanReferralId_fkey";

-- DropForeignKey
ALTER TABLE "fan_referral_transactions" DROP CONSTRAINT "fan_referral_transactions_referentId_fkey";

-- DropForeignKey
ALTER TABLE "fan_referral_transactions" DROP CONSTRAINT "fan_referral_transactions_referrerId_fkey";

-- DropForeignKey
ALTER TABLE "fundraisers" DROP CONSTRAINT "fundraisers_thumbId_fkey";

-- DropForeignKey
ALTER TABLE "giveaways" DROP CONSTRAINT "giveaways_thumbId_fkey";

-- DropForeignKey
ALTER TABLE "paid_post_transactions" DROP CONSTRAINT "paid_post_transactions_creatorId_fkey";

-- DropForeignKey
ALTER TABLE "paid_post_transactions" DROP CONSTRAINT "paid_post_transactions_userId_fkey";

-- DropForeignKey
ALTER TABLE "payment_subscription_transactions" DROP CONSTRAINT "payment_subscription_transactions_creatorId_fkey";

-- DropForeignKey
ALTER TABLE "payment_subscription_transactions" DROP CONSTRAINT "payment_subscription_transactions_userId_fkey";

-- DropForeignKey
ALTER TABLE "payment_subscriptions" DROP CONSTRAINT "payment_subscriptions_creatorId_fkey";

-- DropForeignKey
ALTER TABLE "payment_subscriptions" DROP CONSTRAINT "payment_subscriptions_userId_fkey";

-- DropForeignKey
ALTER TABLE "playlists" DROP CONSTRAINT "playlists_thumbId_fkey";

-- DropForeignKey
ALTER TABLE "polls" DROP CONSTRAINT "polls_thumbId_fkey";

-- DropForeignKey
ALTER TABLE "posts" DROP CONSTRAINT "posts_thumbId_fkey";

-- DropForeignKey
ALTER TABLE "reports_for_user" DROP CONSTRAINT "reports_for_user_thumbId_fkey";

-- AlterTable
ALTER TABLE "profiles" DROP COLUMN "ageVerifyId",
DROP COLUMN "ageVerifyStatus";

-- AddForeignKey
ALTER TABLE "payment_subscriptions" ADD CONSTRAINT "payment_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_subscriptions" ADD CONSTRAINT "payment_subscriptions_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_subscription_transactions" ADD CONSTRAINT "payment_subscription_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_subscription_transactions" ADD CONSTRAINT "payment_subscription_transactions_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paid_post_transactions" ADD CONSTRAINT "paid_post_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paid_post_transactions" ADD CONSTRAINT "paid_post_transactions_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cameo_payments" ADD CONSTRAINT "cameo_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cameo_payments" ADD CONSTRAINT "cameo_payments_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_referral_transactions" ADD CONSTRAINT "creator_referral_transactions_referentId_fkey" FOREIGN KEY ("referentId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_referral_transactions" ADD CONSTRAINT "creator_referral_transactions_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fan_referral_transactions" ADD CONSTRAINT "fan_referral_transactions_referentId_fkey" FOREIGN KEY ("referentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fan_referral_transactions" ADD CONSTRAINT "fan_referral_transactions_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fan_referral_transactions" ADD CONSTRAINT "fan_referral_transactions_fanReferralId_fkey" FOREIGN KEY ("fanReferralId") REFERENCES "fan_referral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fan_referral_transactions" ADD CONSTRAINT "fan_referral_transactions_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_thumbId_fkey" FOREIGN KEY ("thumbId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fundraisers" ADD CONSTRAINT "fundraisers_thumbId_fkey" FOREIGN KEY ("thumbId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaways" ADD CONSTRAINT "giveaways_thumbId_fkey" FOREIGN KEY ("thumbId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_thumbId_fkey" FOREIGN KEY ("thumbId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_thumbId_fkey" FOREIGN KEY ("thumbId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports_for_user" ADD CONSTRAINT "reports_for_user_thumbId_fkey" FOREIGN KEY ("thumbId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
