-- Existing pre-Steward rows are kept with a sentinel owner. The first owner/admin action on one
-- adopts it into the active sandbox business; no bill data is deleted by this migration.
ALTER TABLE "Bill"
  ADD COLUMN "businessId" VARCHAR(64),
  ADD COLUMN "createdBy" VARCHAR(64),
  ADD COLUMN "companyId" VARCHAR(64),
  ADD COLUMN "taskProposalId" VARCHAR(64),
  ADD COLUMN "taskId" VARCHAR(64),
  ADD COLUMN "taskAssigneeId" VARCHAR(64),
  ADD COLUMN "taskStatus" VARCHAR(24);

UPDATE "Bill"
SET "businessId" = 'legacy-unassigned', "createdBy" = 'legacy-unassigned'
WHERE "businessId" IS NULL;

ALTER TABLE "Bill"
  ALTER COLUMN "businessId" SET NOT NULL,
  ALTER COLUMN "createdBy" SET NOT NULL;

CREATE UNIQUE INDEX "Bill_taskProposalId_key" ON "Bill"("taskProposalId");
CREATE UNIQUE INDEX "Bill_taskId_key" ON "Bill"("taskId");
CREATE INDEX "Bill_businessId_idx" ON "Bill"("businessId");
CREATE INDEX "Bill_businessId_taskAssigneeId_idx" ON "Bill"("businessId", "taskAssigneeId");
