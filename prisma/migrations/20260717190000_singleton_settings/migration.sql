-- Keep the newest settings row, then assign the stable singleton id.
DELETE FROM "Setting"
WHERE "id" NOT IN (
  SELECT "id" FROM "Setting" ORDER BY "updated_at" DESC LIMIT 1
);

UPDATE "Setting" SET "id" = 'default' WHERE "id" <> 'default';
