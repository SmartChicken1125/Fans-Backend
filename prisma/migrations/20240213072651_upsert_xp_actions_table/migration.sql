INSERT INTO "xp_actions" ("action", "xp", "type", "updatedAt")
SELECT 'Subscribe', 10, 'Multiple', NOW()
WHERE 
	NOT EXISTS (
		SELECT "action" FROM "xp_actions" WHERE "action" = 'Subscribe'
	);

INSERT INTO "xp_actions" ("action", "xp", "type", "updatedAt")
SELECT 'Donate', 10, 'Multiple', NOW()
WHERE 
	NOT EXISTS (
		SELECT "action" FROM "xp_actions" WHERE "action" = 'Donate'
	);

INSERT INTO "xp_actions" ("action", "xp", "type", "updatedAt")
SELECT 'Like', 3, 'Add', NOW()
WHERE 
	NOT EXISTS (
		SELECT "action" FROM "xp_actions" WHERE "action" = 'Like'
	);

INSERT INTO "xp_actions" ("action", "xp", "type", "updatedAt")
SELECT 'Comment', 10, 'Add', NOW()
WHERE 
	NOT EXISTS (
		SELECT "action" FROM "xp_actions" WHERE "action" = 'Comment'
	);

INSERT INTO "xp_actions" ("action", "xp", "type", "updatedAt")
SELECT 'Share', 10, 'Add', NOW()
WHERE 
	NOT EXISTS (
		SELECT "action" FROM "xp_actions" WHERE "action" = 'Share'
	);

INSERT INTO "xp_actions" ("action", "xp", "type", "updatedAt")
SELECT 'Purchase', 10, 'Multiple', NOW()
WHERE 
	NOT EXISTS (
		SELECT "action" FROM "xp_actions" WHERE "action" = 'Purchase'
	);

INSERT INTO "xp_actions" ("action", "xp", "type", "updatedAt")
SELECT 'Poll', 5, 'Add', NOW()
WHERE 
	NOT EXISTS (
		SELECT "action" FROM "xp_actions" WHERE "action" = 'Poll'
	);
