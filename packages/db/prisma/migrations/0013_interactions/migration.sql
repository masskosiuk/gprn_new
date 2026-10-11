BEGIN;

CREATE TABLE "interaction_threads" (
  "id" UUID NOT NULL PRIMARY KEY,
  "initiatorId" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "recipientId" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "topic" TEXT NOT NULL CHECK ("topic" IN ('MESSAGE', 'SHOOT', 'REVIEW', 'MENTORSHIP')),
  "status" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN', 'ACCEPTED', 'DECLINED', 'CLOSED')),
  "initiatorReadAt" TIMESTAMP(3),
  "recipientReadAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK ("initiatorId" <> "recipientId")
);
-- Either participant may start a new request after the preceding one is closed.
CREATE UNIQUE INDEX "interaction_threads_active_pair_topic_key" ON "interaction_threads"(LEAST("initiatorId", "recipientId"), GREATEST("initiatorId", "recipientId"), "topic") WHERE "status" IN ('OPEN', 'ACCEPTED');
CREATE INDEX "interaction_threads_initiatorId_updatedAt_idx" ON "interaction_threads"("initiatorId", "updatedAt");
CREATE INDEX "interaction_threads_recipientId_updatedAt_idx" ON "interaction_threads"("recipientId", "updatedAt");
CREATE TABLE "interaction_messages" (
  "id" UUID NOT NULL PRIMARY KEY,
  "threadId" UUID NOT NULL REFERENCES "interaction_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "authorId" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "interaction_messages_threadId_createdAt_id_idx" ON "interaction_messages"("threadId", "createdAt", "id");
CREATE INDEX "interaction_messages_authorId_createdAt_idx" ON "interaction_messages"("authorId", "createdAt");

-- Recover the original messages without changing or removing notifications.
WITH valid AS (
  SELECT n.*, u."id" AS sender, COALESCE(n."payload"->>'topic', 'MESSAGE') AS topic
  FROM "notifications" n JOIN "users" u ON u."id"::text = n."payload"->>'senderId'
  WHERE n."type" = 'MEMBER_MESSAGE' AND n."userId" <> u."id"
    AND length(trim(n."payload"->>'message')) > 0
    AND COALESCE(n."payload"->>'topic', 'MESSAGE') IN ('MESSAGE', 'SHOOT', 'REVIEW', 'MENTORSHIP')
), grouped AS (
  SELECT *, row_number() OVER (PARTITION BY LEAST(sender, "userId"), GREATEST(sender, "userId"), topic ORDER BY "createdAt", "id") AS first_message,
    min("createdAt") OVER (PARTITION BY LEAST(sender, "userId"), GREATEST(sender, "userId"), topic) AS started,
    max("createdAt") OVER (PARTITION BY LEAST(sender, "userId"), GREATEST(sender, "userId"), topic) AS updated
  FROM valid
)
INSERT INTO "interaction_threads" ("id", "initiatorId", "recipientId", "topic", "createdAt", "updatedAt")
SELECT gen_random_uuid(), sender, "userId", topic, started, updated FROM grouped WHERE first_message = 1;
INSERT INTO "interaction_messages" ("id", "threadId", "authorId", "body", "createdAt")
SELECT n."id", t."id", u."id", n."payload"->>'message', n."createdAt"
FROM "notifications" n JOIN "users" u ON u."id"::text = n."payload"->>'senderId'
JOIN "interaction_threads" t ON ((t."initiatorId" = u."id" AND t."recipientId" = n."userId")
  OR (t."recipientId" = u."id" AND t."initiatorId" = n."userId")) AND t."topic" = COALESCE(n."payload"->>'topic', 'MESSAGE')
WHERE n."type" = 'MEMBER_MESSAGE' AND length(trim(n."payload"->>'message')) > 0;

COMMIT;
