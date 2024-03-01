/*
  Warnings:

  - The `image` column on the `welcome_messages` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "welcome_messages" DROP COLUMN "image",
ADD COLUMN     "image" BIGINT;
