-- CreateTable
CREATE TABLE "Bill" (
    "id" UUID NOT NULL,
    "reason" VARCHAR(160) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pendingAmount" DECIMAL(12,2) NOT NULL,
    "payBefore" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Bill_totalAmount_positive" CHECK ("totalAmount" > 0),
    CONSTRAINT "Bill_paidAmount_non_negative" CHECK ("paidAmount" >= 0),
    CONSTRAINT "Bill_paidAmount_within_total" CHECK ("paidAmount" <= "totalAmount"),
    CONSTRAINT "Bill_pendingAmount_non_negative" CHECK ("pendingAmount" >= 0),
    CONSTRAINT "Bill_pendingAmount_matches_amounts" CHECK ("pendingAmount" = "totalAmount" - "paidAmount")
);

-- CreateIndex
CREATE INDEX "Bill_payBefore_idx" ON "Bill"("payBefore");
