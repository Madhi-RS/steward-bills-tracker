import { NextResponse } from "next/server";

import { clearAuthenticatedSessionCookie } from "@/lib/auth";

/** End only this app's local Steward session; it does not sign the person out of Steward itself. */
export async function POST() {
  return clearAuthenticatedSessionCookie(NextResponse.json({ data: { signedOut: true } }));
}
