import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, formatValidationIssues, handleDatabaseError, validationError } from "@/lib/api";
import { activeStewardContext, mayManageBills, requireAuthenticatedRequest, unauthenticatedResponse } from "@/lib/auth";
import { serializeBill } from "@/lib/bills";
import { db } from "@/lib/db";
import { getStewardCore } from "@/lib/steward";
import { billIdSchema } from "@/lib/validations/bill";

const taskPlanSchema = z.object({
  billIds: z.array(billIdSchema).min(2, "Select at least two bills.").max(25, "A Steward proposal plan can contain at most 25 tasks."),
  assignee: z.string().regex(/^usr_[0-9a-z]+$/i, "Choose a valid Steward member."),
  company: z.string().regex(/^cmp_[0-9a-z]+$/i, "Choose a valid Steward company."),
}).superRefine((value, context) => {
  if (new Set(value.billIds).size !== value.billIds.length) {
    context.addIssue({ code: "custom", path: ["billIds"], message: "Each bill can be included only once." });
  }
});

function taskProposal(bill: { id: string; reason: string; payBefore: Date }, assignee: string, company: string) {
  return {
    kind: "task.create",
    company,
    payload: {
      title: `Pay invoice: ${bill.reason}`,
      assignee,
      due: bill.payBefore.toISOString().slice(0, 10),
      description: "Open this invoice in Steward Bills Tracker, review it, and mark this task complete after payment is confirmed. No payment is processed by the app.",
      record_ref: `bill:${bill.id}`,
      context: "@computer",
      time_minutes: 15,
      energy: "low",
    },
    sources: [],
    confidence: 1,
  };
}

export async function POST(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.session) return unauthenticatedResponse(authentication);

  const context = activeStewardContext(authentication.session);
  if (!mayManageBills(context.role)) {
    return apiError(403, "FORBIDDEN", "Only a Steward owner or admin can assign bill tasks.");
  }

  const input = taskPlanSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return validationError(formatValidationIssues(input.error.issues));

  try {
    const bills = await db.bill.findMany({
      where: {
        id: { in: input.data.billIds },
        OR: [{ businessId: context.businessId }, { businessId: "legacy-unassigned" }],
      },
    });
    const billsById = new Map(bills.map((bill) => [bill.id, bill]));
    const orderedBills = input.data.billIds.map((id) => billsById.get(id));

    if (orderedBills.some((bill) => !bill)) {
      return apiError(404, "NOT_FOUND", "One or more selected bills no longer exist.");
    }

    const selectedBills = orderedBills as typeof bills;
    if (selectedBills.some((bill) => bill.taskProposalId && !["REJECTED", "DROPPED", "COMPLETED"].includes(bill.taskStatus ?? ""))) {
      return apiError(409, "TASK_EXISTS", "One or more selected bills already have a live Steward task.");
    }

    const plan = await getStewardCore().proposePlan(
      context.businessId,
      {
        title: `Assign ${selectedBills.length} invoice payment tasks`,
        proposals: selectedBills.map((bill) => taskProposal(bill, input.data.assignee, input.data.company)),
      },
      context.viewerToken,
    );

    if (plan.proposals.length !== selectedBills.length || plan.proposals.some((proposal) => proposal.kind !== "task.create")) {
      throw new Error("Steward returned an invalid task proposal plan.");
    }

    const updated = await db.$transaction(selectedBills.map((bill, index) => db.bill.update({
      where: { id: bill.id },
      data: {
        businessId: context.businessId,
        createdBy: bill.createdBy === "legacy-unassigned" ? context.personId : bill.createdBy,
        companyId: input.data.company,
        taskProposalId: plan.proposals[index].id,
        taskId: null,
        taskAssigneeId: input.data.assignee,
        taskStatus: "PENDING_REVIEW",
      },
    })));

    return NextResponse.json({ data: { planId: plan.id, bills: updated.map(serializeBill) } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name !== "PrismaClientKnownRequestError") {
      return NextResponse.json({ error: { code: "STEWARD_ERROR", message: error.message } }, { status: 502 });
    }
    return handleDatabaseError(error);
  }
}
