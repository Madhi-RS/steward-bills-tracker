import { NextResponse } from "next/server";

import { activeStewardContext, mayManageBills, requireAuthenticatedRequest, unauthenticatedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { askHireScope, HireScopeQuestionFormatError, HireScopeQuestionPendingError, listHireScopeInquiries } from "@/lib/hirescope-board";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.session) return unauthenticatedResponse(authentication);

  const context = activeStewardContext(authentication.session);
  const inquiries = await listHireScopeInquiries(context.businessId);
  return NextResponse.json({ data: inquiries });
}

export async function POST(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.session) return unauthenticatedResponse(authentication);

  const context = activeStewardContext(authentication.session);
  if (!mayManageBills(context.role)) {
    return apiError(403, "FORBIDDEN", "Only an owner or admin can ask HireScope from Bills Tracker.");
  }

  const body = await request.json().catch(() => null);
  const question = body && typeof body.question === "string" ? body.question : "";

  try {
    const inquiry = await askHireScope(context.businessId, question);
    return NextResponse.json({ data: inquiry }, { status: 201 });
  } catch (error) {
    if (error instanceof HireScopeQuestionPendingError) {
      return apiError(409, "QUESTION_PENDING", error.message);
    }
    if (error instanceof HireScopeQuestionFormatError) {
      return apiError(400, "VALIDATION_ERROR", error.message);
    }
    throw error;
  }
}
