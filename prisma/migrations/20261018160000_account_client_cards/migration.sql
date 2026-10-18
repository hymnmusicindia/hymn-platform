ALTER TABLE "team_workspaces"
  ADD COLUMN "client_cards_imported_at" TIMESTAMP(3);

ALTER TABLE "team_clients"
  ADD COLUMN "userId" INTEGER;

CREATE UNIQUE INDEX "team_clients_userId_key" ON "team_clients"("userId");

ALTER TABLE "team_clients"
  ADD CONSTRAINT "team_clients_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Attach existing manual cards to the matching account first, then create one
-- card for every current customer/producer in the first owner-managed workspace.
WITH owner AS (
  SELECT m."workspaceId", m."id" AS "ownerId"
  FROM "team_memberships" m
  JOIN "team_roles" r ON r."id" = m."roleId" AND r."owner" = TRUE
  WHERE m."status" = 'ACTIVE'
  ORDER BY m."joinedAt" ASC
  LIMIT 1
),
ranked_matches AS (
  SELECT u."id" AS "userId", c."id" AS "clientId",
         ROW_NUMBER() OVER (PARTITION BY u."id" ORDER BY c."createdAt", c."id") AS rank
  FROM "users" u
  JOIN "team_clients" c ON LOWER(c."email") = LOWER(u."email") OR LOWER(c."secondaryEmail") = LOWER(u."email")
  CROSS JOIN owner o
  WHERE c."workspaceId" = o."workspaceId" AND c."userId" IS NULL
    AND u."role" IN ('CUSTOMER', 'PRODUCER')
    AND u."status" NOT IN ('BANNED', 'DELETION_SCHEDULED')
)
UPDATE "team_clients" c
SET "userId" = m."userId",
    "phone" = CASE WHEN c."phone" = '' THEN COALESCE(u."mobile", '') ELSE c."phone" END,
    "secondaryEmail" = CASE WHEN c."secondaryEmail" = '' AND NULLIF(u."contact_email", '') IS NOT NULL AND LOWER(u."contact_email") <> LOWER(u."email") THEN u."contact_email" ELSE c."secondaryEmail" END,
    "interests" = CASE WHEN CARDINALITY(c."interests") = 0 THEN ARRAY(
      SELECT interest FROM (VALUES
        ('DISTRIBUTION', LOWER(CONCAT_WS(' ', u."onboarding_purpose", u."onboarding_user_type")) ~ '(distribution|release|artist|label)'),
        ('BEAT_PURCHASE', LOWER(CONCAT_WS(' ', u."onboarding_purpose", u."onboarding_user_type")) ~ '(buy.*beat|beat.*buy|find beat)'),
        ('BEAT_SALES', LOWER(CONCAT_WS(' ', u."onboarding_purpose", u."onboarding_user_type")) ~ '(sell.*beat|beat.*sell|producer)'),
        ('PLAYLIST_CURATION', LOWER(CONCAT_WS(' ', u."onboarding_purpose", u."onboarding_user_type")) ~ '(playlist|curat)'),
        ('MIX_MASTER', LOWER(CONCAT_WS(' ', u."onboarding_purpose", u."onboarding_user_type")) ~ '(mix|master|studio)'),
        ('BECOME_ENGINEER', LOWER(CONCAT_WS(' ', u."onboarding_purpose", u."onboarding_user_type")) ~ '(engineer|audio professional)')
      ) AS interests(interest, matched) WHERE matched
    ) ELSE c."interests" END,
    "notes" = CASE WHEN c."notes" = '' THEN CONCAT_WS(E'\n',
      CASE WHEN NULLIF(u."onboarding_purpose", '') IS NULL THEN NULL ELSE 'Onboarding goal: ' || u."onboarding_purpose" END,
      CASE WHEN NULLIF(u."onboarding_user_type", '') IS NULL THEN NULL ELSE 'Account type: ' || u."onboarding_user_type" END
    ) ELSE c."notes" END,
    "updatedAt" = CURRENT_TIMESTAMP
FROM ranked_matches m
JOIN "users" u ON u."id" = m."userId"
WHERE m.rank = 1 AND c."id" = m."clientId";

WITH owner AS (
  SELECT m."workspaceId", m."id" AS "ownerId"
  FROM "team_memberships" m
  JOIN "team_roles" r ON r."id" = m."roleId" AND r."owner" = TRUE
  WHERE m."status" = 'ACTIVE'
  ORDER BY m."joinedAt" ASC
  LIMIT 1
)
INSERT INTO "team_clients" (
  "id", "workspaceId", "ownerId", "userId", "name", "phone", "email",
  "secondaryEmail", "interests", "state", "city", "notes", "status",
  "version", "createdAt", "updatedAt"
)
SELECT
  'account_' || u."id"::TEXT, o."workspaceId", o."ownerId", u."id", u."name",
  COALESCE(u."mobile", ''), u."email", '',
  ARRAY(
    SELECT interest FROM (VALUES
      ('DISTRIBUTION', LOWER(CONCAT_WS(' ', u."onboarding_purpose", u."onboarding_user_type")) ~ '(distribution|release|artist|label)'),
      ('BEAT_PURCHASE', LOWER(CONCAT_WS(' ', u."onboarding_purpose", u."onboarding_user_type")) ~ '(buy.*beat|beat.*buy|find beat)'),
      ('BEAT_SALES', LOWER(CONCAT_WS(' ', u."onboarding_purpose", u."onboarding_user_type")) ~ '(sell.*beat|beat.*sell|producer)'),
      ('PLAYLIST_CURATION', LOWER(CONCAT_WS(' ', u."onboarding_purpose", u."onboarding_user_type")) ~ '(playlist|curat)'),
      ('MIX_MASTER', LOWER(CONCAT_WS(' ', u."onboarding_purpose", u."onboarding_user_type")) ~ '(mix|master|studio)'),
      ('BECOME_ENGINEER', LOWER(CONCAT_WS(' ', u."onboarding_purpose", u."onboarding_user_type")) ~ '(engineer|audio professional)')
    ) AS interests(interest, matched)
    WHERE matched
  ),
  '', '', CONCAT_WS(E'\n',
    CASE WHEN NULLIF(u."onboarding_purpose", '') IS NULL THEN NULL ELSE 'Onboarding goal: ' || u."onboarding_purpose" END,
    CASE WHEN NULLIF(u."onboarding_user_type", '') IS NULL THEN NULL ELSE 'Account type: ' || u."onboarding_user_type" END
  ),
  'ACTIVE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users" u
CROSS JOIN owner o
WHERE u."role" IN ('CUSTOMER', 'PRODUCER')
  AND u."status" NOT IN ('BANNED', 'DELETION_SCHEDULED')
  AND NOT EXISTS (SELECT 1 FROM "team_clients" c WHERE c."userId" = u."id")
ON CONFLICT ("userId") DO NOTHING;

UPDATE "team_workspaces"
SET "client_cards_imported_at" = CURRENT_TIMESTAMP
WHERE "id" = (SELECT "workspaceId" FROM "team_memberships" m JOIN "team_roles" r ON r."id" = m."roleId" WHERE r."owner" = TRUE AND m."status" = 'ACTIVE' ORDER BY m."joinedAt" ASC LIMIT 1);
