-- AlterTable
ALTER TABLE "chat_paid_post_transactions" ADD COLUMN     "fanReferralCode" TEXT;

-- AddForeignKey
ALTER TABLE "chat_paid_post_transactions" ADD CONSTRAINT "chat_paid_post_transactions_fanReferralCode_fkey" FOREIGN KEY ("fanReferralCode") REFERENCES "fan_referral"("code") ON DELETE SET NULL ON UPDATE CASCADE;
