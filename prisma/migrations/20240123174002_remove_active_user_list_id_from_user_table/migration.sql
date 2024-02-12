/*
  Warnings:

  - You are about to drop the column `activeUserListId` on the `users` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_activeUserListId_fkey";

-- DropIndex
DROP INDEX "users_activeUserListId_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "activeUserListId";
