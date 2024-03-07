-- DropForeignKey
ALTER TABLE "story_tags" DROP CONSTRAINT "story_tags_creatorId_fkey";

-- DropIndex
DROP INDEX "story_tags_creatorId_idx";

-- AlterTable
ALTER TABLE "story_tags" ADD COLUMN "userId" BIGINT;


DO $$
DECLARE
	cur REFCURSOR;
	story_tag story_tags%ROWTYPE;
	user_id BIGINT;
BEGIN
	OPEN cur FOR SELECT * FROM story_tags;
	LOOP

		FETCH cur INTO story_tag;
		EXIT WHEN NOT FOUND;
		
		if story_tag."creatorId" IS NOT NULL THEN
			user_id := (SELECT "userId" FROM "profiles" WHERE "id" = story_tag."creatorId");
			UPDATE story_tags SET "userId" = user_id WHERE "id" = story_tag.id;
		END IF;

	END LOOP;
	CLOSE cur;
END $$;


-- AlterTable
ALTER TABLE "story_tags" ALTER COLUMN "creatorId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "story_tags_userId_idx" ON "story_tags"("userId");

-- AddForeignKey
ALTER TABLE "story_tags" ADD CONSTRAINT "story_tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
