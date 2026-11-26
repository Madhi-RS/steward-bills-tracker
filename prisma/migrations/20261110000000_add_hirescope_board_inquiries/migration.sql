-- Board answers are a display-only inbox, deliberately separate from bills.
CREATE TABLE "HireScopeInquiry" (
    "id" UUID NOT NULL,
    "businessId" VARCHAR(64) NOT NULL,
    "correlationToken" VARCHAR(64) NOT NULL,
    "questionText" VARCHAR(4000) NOT NULL,
    "questionPostId" VARCHAR(64),
    "answerPostId" VARCHAR(64),
    "mentionEventId" VARCHAR(64),
    "answerText" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HireScopeInquiry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HireScopeInquiry_questionPostId_key" ON "HireScopeInquiry"("questionPostId");
CREATE UNIQUE INDEX "HireScopeInquiry_answerPostId_key" ON "HireScopeInquiry"("answerPostId");
CREATE UNIQUE INDEX "HireScopeInquiry_mentionEventId_key" ON "HireScopeInquiry"("mentionEventId");
CREATE UNIQUE INDEX "HireScopeInquiry_businessId_correlationToken_key" ON "HireScopeInquiry"("businessId", "correlationToken");
CREATE INDEX "HireScopeInquiry_businessId_answerPostId_idx" ON "HireScopeInquiry"("businessId", "answerPostId");
-- One open question per business keeps the exchange to a single question/answer pair.
CREATE UNIQUE INDEX "HireScopeInquiry_one_open_question_per_business" ON "HireScopeInquiry"("businessId") WHERE "answerPostId" IS NULL;
