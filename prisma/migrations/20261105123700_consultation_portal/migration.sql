CREATE TYPE "ConsultationStatus" AS ENUM (
    'NEW_LEAD',
    'UNASSIGNED',
    'ASSIGNED',
    'CALLBACK_SCHEDULED',
    'CONTACTED',
    'CONSULTATION_COMPLETED',
    'FOLLOW_UP_REQUIRED',
    'CONVERTED',
    'NOT_INTERESTED',
    'LOST'
);

CREATE TABLE "consultation_requests" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "client_id" TEXT NOT NULL,
    "assigned_member_id" TEXT,
    "calendar_event_id" TEXT,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "dial_code" TEXT NOT NULL,
    "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "other_requirement" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'website',
    "campaign" TEXT,
    "referral_url" TEXT,
    "utm" JSONB NOT NULL DEFAULT '{}',
    "landing_page_url" TEXT NOT NULL DEFAULT '/',
    "referrer" TEXT,
    "first_touch_source" TEXT NOT NULL DEFAULT 'website',
    "latest_touch_source" TEXT NOT NULL DEFAULT 'website',
    "preferred_callback" TIMESTAMP(3),
    "consent_at" TIMESTAMP(3) NOT NULL,
    "consent_version" TEXT NOT NULL DEFAULT 'consultation-privacy-v1',
    "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
    "funnel_events" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "idempotency_key" TEXT NOT NULL,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'NEW_LEAD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "consultation_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "consultation_activities" (
    "id" TEXT NOT NULL,
    "consultation_id" TEXT NOT NULL,
    "actor_member_id" TEXT,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "consultation_activities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "consultation_requests_calendar_event_id_key" ON "consultation_requests"("calendar_event_id");
CREATE UNIQUE INDEX "consultation_requests_user_id_idempotency_key_key" ON "consultation_requests"("user_id", "idempotency_key");
CREATE INDEX "consultation_requests_workspace_id_status_created_at_idx" ON "consultation_requests"("workspace_id", "status", "created_at");
CREATE INDEX "consultation_requests_workspace_id_assigned_member_id_status_idx" ON "consultation_requests"("workspace_id", "assigned_member_id", "status");
CREATE INDEX "consultation_requests_user_id_created_at_idx" ON "consultation_requests"("user_id", "created_at");
CREATE INDEX "consultation_requests_workspace_id_preferred_callback_idx" ON "consultation_requests"("workspace_id", "preferred_callback");
CREATE INDEX "consultation_activities_consultation_id_created_at_idx" ON "consultation_activities"("consultation_id", "created_at");

ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "team_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_assigned_member_id_fkey" FOREIGN KEY ("assigned_member_id") REFERENCES "team_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_calendar_event_id_fkey" FOREIGN KEY ("calendar_event_id") REFERENCES "team_calendar_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "consultation_activities" ADD CONSTRAINT "consultation_activities_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultation_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consultation_activities" ADD CONSTRAINT "consultation_activities_actor_member_id_fkey" FOREIGN KEY ("actor_member_id") REFERENCES "team_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
