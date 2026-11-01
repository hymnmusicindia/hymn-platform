ALTER TABLE "team_tasks" DROP CONSTRAINT "team_task_record_pair_check";
ALTER TABLE "team_tasks" ADD CONSTRAINT "team_task_record_pair_check"
  CHECK (("recordType" IS NULL AND "recordId" IS NULL) OR ("recordType" IN ('beat', 'release', 'engineer', 'studio', 'support') AND "recordId" > 0));