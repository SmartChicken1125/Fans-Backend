-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "price" INTEGER NOT NULL DEFAULT 0;
