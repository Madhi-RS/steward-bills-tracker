import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, formatValidationIssues, handleDatabaseError, validationError } from "@/lib/api";
import { activeStewardContext, mayManageBills, requireAuthenticatedRequest, unauthenticatedResponse } from "@/lib/auth";
import { serializeBill } from "@/lib/bills";
import { db } from "@/lib/db";
import { getStewardCore } from "@/lib/steward";
import { billIdSchema } from "@/lib/validations/bill";

const assignmentSchema = z.object({
  assignee: z.string().regex(/^usr_[0-9a-z]+$/i, "Choose a valid Steward member."),
  company: z.string().regex(/^cmp_[0-9a-z]+$/i, "Choose a valid Steward company."),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, route: RouteContext) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.session) return unauthenticatedResponse(authentication);

  const context = activeStewardContext(authentication.session);
  if (!mayManageBills(context.role)) {
    return apiError(403, "FORBIDDEN", "Only a Steward owner or admin can assign bill tasks.");
  }

  const { id: rawId } = await route.params;
  const id = billIdSchema.safeParse(rawId);
  const input = assignmentSchema.safeParse(await request.json().catch(() => null));
  if (!id.success) return validationError(formatValidationIssues(id.error.issues));
  if (!input.success) return validationError(formatValidationIssues(input.error.issues));

  try {
    const bill = await db.bill.findFirst({
      where: { id: id.data, OR: [{ businessId: context.businessId }, { businessId: "legacy-unassigned" }] },
    });
    if (!bill) return apiError(404, "NOT_FOUND", "The requested bill does not exist.");
    if (bill.taskProposalId && !["REJECTED", "DROPPED", "COMPLETED"].includes(bill.taskStatus ?? "")) {
      return apiError(409, "TASK_EXISTS", "This bill already has a live Steward task.");
    }

    const proposal = await getStewardCore().proposeTask(
      context.businessId,
      {
        company: input.data.company,
        title: `Pay invoice: ${bill.reason}`,
        assignee: input.data.assignee,
        due: bill.payBefore.toISOString().slice(0, 10),
        description: "Open this invoice in Steward Bills Tracker, review it, and mark this task complete after payment is confirmed. No payment is processed by the app.",
        record_ref: `bill:${bill.id}`,
      },
      [],
      1,
      context.viewerToken,
    );

    const updated = await db.bill.update({
      where: { id: bill.id },
      data: {
        businessId: context.businessId,
        createdBy: bill.createdBy === "legacy-unassigned" ? context.personId : bill.createdBy,
        companyId: input.data.company,
        taskProposalId: proposal.id,
        taskId: null,
        taskAssigneeId: input.data.assignee,
        taskStatus: "PENDING_REVIEW",
      },
    });

    return NextResponse.json({ data: serializeBill(updated) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name !== "PrismaClientKnownRequestError") {
      return NextResponse.json({ error: { code: "STEWARD_ERROR", message: error.message } }, { status: 502 });
    }
    return handleDatabaseError(error);
  }
}
