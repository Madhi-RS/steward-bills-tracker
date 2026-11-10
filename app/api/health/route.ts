import { NextResponse } from "next/server";

import { healthCheckResponseSchema } from "@/lib/validations/health";

export function GET() {
  const response = healthCheckResponseSchema.parse({ status: "ok" });

  return NextResponse.json(response);
}
