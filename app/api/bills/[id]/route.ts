import { NextResponse } from "next/server";

import { apiError, formatValidationIssues, handleDatabaseError, validationError } from "@/lib/api";
import { activeStewardContext, mayManageBills, requireAuthenticatedRequest, unauthenticatedResponse } from "@/lib/auth";
import { calculateBillAmounts, serializeBill } from "@/lib/bills";
import { db } from "@/lib/db";
import { billIdSchema, billInputSchema } from "@/lib/validations/bill";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function parseBillId(context: RouteContext) {
  const { id } = await context.params;
  return billIdSchema.safeParse(id);
}

function billScope(context: ReturnType<typeof activeStewardContext>, id: string) {
  return mayManageBills(context.role)
    ? { id, OR: [{ businessId: context.businessId }, { businessId: "legacy-unassigned" }] }
    : { id, businessId: context.businessId, taskAssigneeId: context.personId };
}

export async function GET(request: Request, context: RouteContext) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.session) {
    return unauthenticatedResponse(authentication);
  }
  const steward = activeStewardContext(authentication.session);

  const id = await parseBillId(context);

  if (!id.success) {
    return validationError(formatValidationIssues(id.error.issues));
  }

  try {
    const bill = await db.bill.findFirst({ where: billScope(steward, id.data) });

    if (!bill) {
      return apiError(404, "NOT_FOUND", "The requested bill does not exist.");
    }

    return NextResponse.json({ data: serializeBill(bill) });
  } catch (error) {
    return handleDatabaseError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.session) {
    return unauthenticatedResponse(authentication);
  }
  const steward = activeStewardContext(authentication.session);

  if (!mayManageBills(steward.role)) {
    return apiError(403, "FORBIDDEN", "Only a Steward owner or admin can edit bills.");
  }

  const id = await parseBillId(context);

  if (!id.success) {
    return validationError(formatValidationIssues(id.error.issues));
  }

  const body = await request.json().catch(() => null);
  const input = billInputSchema.safeParse(body);

  if (!input.success) {
    return validationError(formatValidationIssues(input.error.issues));
  }

  const amounts = calculateBillAmounts(input.data.totalAmount, input.data.paidAmount);

  try {
    const existing = await db.bill.findFirst({ where: billScope(steward, id.data) });
    if (!existing) {
      return apiError(404, "NOT_FOUND", "The requested bill does not exist.");
    }

    const bill = await db.bill.update({
      where: { id: id.data },
      data: {
        businessId: steward.businessId,
        createdBy: existing.createdBy === "legacy-unassigned" ? steward.personId : existing.createdBy,
        reason: input.data.reason,
        ...amounts,
        payBefore: new Date(`${input.data.payBefore}T00:00:00.000Z`),
      },
    });

    return NextResponse.json({ data: serializeBill(bill) });
  } catch (error) {
    return handleDatabaseError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.session) {
    return unauthenticatedResponse(authentication);
  }
  const steward = activeStewardContext(authentication.session);

  if (!mayManageBills(steward.role)) {
    return apiError(403, "FORBIDDEN", "Only a Steward owner or admin can delete bills.");
  }

  const id = await parseBillId(context);

  if (!id.success) {
    return validationError(formatValidationIssues(id.error.issues));
  }

  try {
    const existing = await db.bill.findFirst({ where: billScope(steward, id.data) });
    if (!existing) {
      return apiError(404, "NOT_FOUND", "The requested bill does not exist.");
    }

    await db.bill.delete({ where: { id: id.data } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleDatabaseError(error);
  }
}
