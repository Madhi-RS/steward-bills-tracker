import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

type ApiIssue = {
  path: string;
  message: string;
};

export function apiError(status: number, code: string, message: string, issues?: ApiIssue[]) {
  return NextResponse.json({ error: { code, message, issues } }, { status });
}

export function validationError(issues: ApiIssue[]) {
  return apiError(400, "VALIDATION_ERROR", "Some fields need attention.", issues);
}

export function formatValidationIssues(issues: { path: PropertyKey[]; message: string }[]): ApiIssue[] {
  return issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export function handleDatabaseError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return apiError(404, "NOT_FOUND", "The requested bill no longer exists.");
  }

  console.error("Bills API database error", error);
  return apiError(500, "DATABASE_ERROR", "We could not complete that database operation. Please try again.");
}
