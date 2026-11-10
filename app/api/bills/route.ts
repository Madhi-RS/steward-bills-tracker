import { NextResponse } from "next/server";

import { formatValidationIssues, handleDatabaseError, validationError } from "@/lib/api";
import { activeStewardContext, mayManageBills, requireAuthenticatedRequest, unauthenticatedResponse } from "@/lib/auth";
import { calculateBillAmounts, calculateBillsSummary, serializeBill } from "@/lib/bills";
import { db } from "@/lib/db";
import { billInputSchema, billsQuerySchema } from "@/lib/validations/bill";

export async function GET(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.session) {
    return unauthenticatedResponse(authentication);
  }
  const context = activeStewardContext(authentication.session);

  const { searchParams } = new URL(request.url);
  const query = billsQuerySchema.safeParse({
    search: searchParams.get("search") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    sortDirection: searchParams.get("sortDirection") ?? undefined,
  });

  if (!query.success) {
    return validationError(formatValidationIssues(query.error.issues));
  }

  try {
    const records = await db.bill.findMany({
      where: mayManageBills(context.role)
        ? { OR: [{ businessId: context.businessId }, { businessId: "legacy-unassigned" }] }
        : { businessId: context.businessId, taskAssigneeId: context.personId },
      orderBy: { payBefore: query.data.sortDirection },
    });
    const normalizedSearch = query.data.search.toLowerCase();
    const bills = records
      .map(serializeBill)
      .filter((bill) => !normalizedSearch || bill.reason.toLowerCase().includes(normalizedSearch))
      .filter((bill) => !query.data.status || bill.status === query.data.status);

    return NextResponse.json({ data: { bills, summary: calculateBillsSummary(bills) } });
  } catch (error) {
    return handleDatabaseError(error);
  }
}

export async function POST(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.session) {
    return unauthenticatedResponse(authentication);
  }
  const context = activeStewardContext(authentication.session);

  if (!mayManageBills(context.role)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Only a Steward owner or admin can add bills." } }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const input = billInputSchema.safeParse(body);

  if (!input.success) {
    return validationError(formatValidationIssues(input.error.issues));
  }

  const amounts = calculateBillAmounts(input.data.totalAmount, input.data.paidAmount);

  try {
    const bill = await db.bill.create({
      data: {
        businessId: context.businessId,
        createdBy: context.personId,
        reason: input.data.reason,
        ...amounts,
        payBefore: new Date(`${input.data.payBefore}T00:00:00.000Z`),
      },
    });

    return NextResponse.json({ data: serializeBill(bill) }, { status: 201 });
  } catch (error) {
    return handleDatabaseError(error);
  }
}
