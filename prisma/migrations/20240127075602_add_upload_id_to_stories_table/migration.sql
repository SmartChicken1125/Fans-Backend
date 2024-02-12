/*
  Warnings:

  - You are about to drop the column `medias` on the `stories` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "stories" ADD COLUMN "uploadId" BIGINT NOT NULL DEFAULT 0;

DO $$
DECLARE
	cur REFCURSOR;
	story stories%ROWTYPE;
	arow jsonb;
	arow_text text;
BEGIN
	OPEN cur FOR SELECT * FROM stories;
	LOOP
		FETCH cur INTO story;
		EXIT WHEN NOT FOUND;
		
		IF EXISTS (SELECT * FROM story_medias WHERE "storyId" = story.id) THEN
			UPDATE stories SET "uploadId" = (SELECT "uploadId" FROM story_medias WHERE "storyId" = story.id LIMIT 1 );
		END IF;
	END LOOP;
	CLOSE cur;
END $$;

ALTER TABLE "stories" DROP COLUMN "medias";
