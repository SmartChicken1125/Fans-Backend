-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('Revolut', 'Payoneer', 'DirectDeposit', 'IBAN');

-- DropIndex
DROP INDEX "payout_payment_methods_paypalEmail_idx";

-- DropIndex
DROP INDEX "payout_payment_methods_provider_idx";

-- AlterTable
ALTER TABLE "payout_payment_methods" ADD COLUMN     "accountNumber" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "company" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "iban" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "payoneer" TEXT,
ADD COLUMN     "payoutMethod" "PayoutMethod" NOT NULL DEFAULT 'IBAN',
ADD COLUMN     "revolut" TEXT,
ADD COLUMN     "routingNumber" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "street" TEXT,
ADD COLUMN     "swift" TEXT,
ADD COLUMN     "unit" TEXT,
ADD COLUMN     "zip" TEXT;

-- CreateIndex
CREATE INDEX "payout_payment_methods_country_idx" ON "payout_payment_methods"("country");

-- CreateIndex
CREATE INDEX "payout_payment_methods_state_idx" ON "payout_payment_methods"("state");

-- CreateIndex
CREATE INDEX "payout_payment_methods_city_idx" ON "payout_payment_methods"("city");

-- CreateIndex
CREATE INDEX "payout_payment_methods_street_idx" ON "payout_payment_methods"("street");

-- CreateIndex
CREATE INDEX "payout_payment_methods_unit_idx" ON "payout_payment_methods"("unit");

-- CreateIndex
CREATE INDEX "payout_payment_methods_zip_idx" ON "payout_payment_methods"("zip");

-- CreateIndex
CREATE INDEX "payout_payment_methods_entityType_idx" ON "payout_payment_methods" USING HASH ("entityType");

-- CreateIndex
CREATE INDEX "payout_payment_methods_usCitizenOrResident_idx" ON "payout_payment_methods" USING HASH ("usCitizenOrResident");

-- CreateIndex
CREATE INDEX "payout_payment_methods_payoutMethod_idx" ON "payout_payment_methods" USING HASH ("payoutMethod");

-- CreateIndex
CREATE INDEX "payout_payment_methods_firstName_idx" ON "payout_payment_methods"("firstName");

-- CreateIndex
CREATE INDEX "payout_payment_methods_lastName_idx" ON "payout_payment_methods"("lastName");

-- CreateIndex
CREATE INDEX "payout_payment_methods_company_idx" ON "payout_payment_methods"("company");

-- AddForeignKey
ALTER TABLE "payout_logs" ADD CONSTRAINT "payout_logs_payoutPaymentMethodId_fkey" FOREIGN KEY ("payoutPaymentMethodId") REFERENCES "payout_payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
