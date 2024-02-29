-- CreateTable
CREATE TABLE "paid_post_thumbs" (
    "id" BIGINT NOT NULL,
    "paidPostId" BIGINT NOT NULL,
    "uploadId" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paid_post_thumbs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "paid_post_thumbs_paidPostId_idx" ON "paid_post_thumbs"("paidPostId");

-- CreateIndex
CREATE INDEX "paid_post_thumbs_uploadId_idx" ON "paid_post_thumbs"("uploadId");

-- CreateIndex
CREATE INDEX "paid_post_thumbs_updatedAt_idx" ON "paid_post_thumbs"("updatedAt");

-- AddForeignKey
ALTER TABLE "paid_post_thumbs" ADD CONSTRAINT "paid_post_thumbs_paidPostId_fkey" FOREIGN KEY ("paidPostId") REFERENCES "paid_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paid_post_thumbs" ADD CONSTRAINT "paid_post_thumbs_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;


/*
 *
 * Migrate old thumb from paid_posts to paid_post_thumbs table
 *
 */

CREATE SEQUENCE IF NOT EXISTS pg_temp.global_id_seq;

CREATE OR REPLACE FUNCTION pg_temp.snowflake_gen()
    RETURNS bigint
	LANGUAGE 'plpgsql'
AS $$
DECLARE
    our_epoch bigint := 1672531200000;
    seq_id bigint;
    now_millis bigint;
    -- the id of this DB shard, must be set for each
    -- schema shard you have - you could pass this as a parameter too
    shard_id int := 1023;
    result bigint := 0;
BEGIN
    SELECT nextval('pg_temp.global_id_seq') % 1024 INTO seq_id;

    SELECT FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000) INTO now_millis;
    result := (now_millis - our_epoch) << 23;
    result := result | (shard_id << 10);
    result := result | (seq_id);
	return result;
END;
$$;

DO $$
DECLARE
	cur REFCURSOR;
	paid_post paid_posts%ROWTYPE;
BEGIN
	OPEN cur FOR SELECT * FROM paid_posts;
	LOOP
		FETCH cur INTO paid_post;
		EXIT WHEN NOT FOUND;
		
		if paid_post."thumbId" IS NOT NULL THEN
			INSERT INTO paid_post_thumbs ("id", "paidPostId", "uploadId", "updatedAt") VALUES (pg_temp.snowflake_gen(), paid_post."id", paid_post."thumbId", NOW());
		END IF;

	END LOOP;
	CLOSE cur;
END $$;


/*
  Warnings:

  - You are about to drop the column `thumb` on the `paid_posts` table. All the data in the column will be lost.
  - You are about to drop the column `thumbId` on the `paid_posts` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "paid_posts" DROP CONSTRAINT "paid_posts_thumbId_fkey";

-- DropIndex
DROP INDEX "paid_posts_thumbId_idx";

-- AlterTable
ALTER TABLE "paid_posts" DROP COLUMN "thumb",
DROP COLUMN "thumbId";
