import { SignInRefused } from "@pente-ai-inc/module-sdk";
import { NextResponse } from "next/server";

import { AUTH_ATTEMPT_COOKIE, AUTH_SESSION_COOKIE, createAuthenticatedSession, sessionCookieOptions, takeStewardSignInAttempt } from "@/lib/auth";
import { getStewardSignIn } from "@/lib/steward";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function refusedResponse(error: unknown) {
  const code = error instanceof SignInRefused && error.code ? error.code : "sign_in_failed";
  const safeCode = /^[a-z_]{1,100}$/.test(code) ? code : "sign_in_failed";
  const response = new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sign-in unavailable</title></head><body><main><h1>Sign-in unavailable</h1><p>Steward did not approve access to Bills Tracker.</p><p><strong>Refusal code:</strong> ${safeCode}</p><p><a href="/auth/login">Try again</a></p></main></body></html>`, { status: 403, headers: { "cache-control": "no-store", "content-type": "text/html; charset=utf-8" } });
  response.cookies.set(AUTH_ATTEMPT_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  const attempt = takeStewardSignInAttempt(request);
  if (!attempt) return refusedResponse(new SignInRefused("The sign-in attempt ended.", "state_mismatch"));

  try {
    // finish() exchanges the code and performs Steward's required sign-in check.
    const signedIn = await getStewardSignIn().finish(request.url, attempt);
    const sessionId = await createAuthenticatedSession(signedIn);
    const response = NextResponse.redirect(new URL("/", request.url), { status: 303 });
    response.cookies.set(AUTH_SESSION_COOKIE, sessionId, sessionCookieOptions(8 * 60 * 60));
    response.cookies.set(AUTH_ATTEMPT_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
    return response;
  } catch (error) {
    return refusedResponse(error);
  }
}
