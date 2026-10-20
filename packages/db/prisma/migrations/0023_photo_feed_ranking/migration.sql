BEGIN;

ALTER TABLE "photos" ADD COLUMN "reviewScore" DECIMAL(8, 6);

UPDATE "photos" AS photo
SET "reviewScore" = scores.score
FROM (
  SELECT "photoId",
    AVG(("composition" + "lighting" + "technicalQuality" + "storytelling"
      + "originality" + "color" + "emotionalImpact")::numeric / 7) AS score
  FROM "photo_reviews"
  GROUP BY "photoId"
) AS scores
WHERE photo."id" = scores."photoId";

CREATE INDEX "photos_reviewScore_publishedAt_id_idx"
  ON "photos" ("reviewScore" DESC NULLS LAST, "publishedAt" DESC NULLS LAST, "id" ASC);

CREATE INDEX "photos_publishedAt_id_idx"
  ON "photos" ("publishedAt" DESC NULLS LAST, "id" ASC);

CREATE FUNCTION refresh_photo_review_score() RETURNS trigger
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  target_id uuid;
  target_ids uuid[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_ids := ARRAY[OLD."photoId"];
  ELSIF TG_OP = 'UPDATE' THEN
    target_ids := ARRAY[OLD."photoId", NEW."photoId"];
  ELSE
    target_ids := ARRAY[NEW."photoId"];
  END IF;

  FOR target_id IN SELECT DISTINCT unnest(target_ids) ORDER BY 1 LOOP
    -- Serialize refreshes without blocking the foreign key's key-share locks.
    PERFORM "id" FROM "photos" WHERE "id" = target_id FOR NO KEY UPDATE;
    UPDATE "photos" SET "reviewScore" = (
      SELECT AVG(("composition" + "lighting" + "technicalQuality" + "storytelling"
        + "originality" + "color" + "emotionalImpact")::numeric / 7)
      FROM "photo_reviews" WHERE "photoId" = target_id
    ) WHERE "id" = target_id;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER photo_review_score_changed
AFTER INSERT OR UPDATE OR DELETE ON "photo_reviews"
FOR EACH ROW EXECUTE FUNCTION refresh_photo_review_score();

COMMIT;
