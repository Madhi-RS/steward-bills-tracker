import { NextResponse } from "next/server";

import { AUTH_ATTEMPT_COOKIE, beginStewardSignIn, sessionCookieOptions } from "@/lib/auth";
import { StewardConfigurationError } from "@/lib/steward";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { attemptId, authorizationUrl } = beginStewardSignIn();
    const response = NextResponse.redirect(authorizationUrl, { status: 302 });
    response.cookies.set(AUTH_ATTEMPT_COOKIE, attemptId, sessionCookieOptions(10 * 60));
    return response;
  } catch (error) {
    const message = error instanceof StewardConfigurationError ? error.message : "Steward sign-in could not be started.";
    return new NextResponse(message, { status: 500, headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" } });
  }
}
