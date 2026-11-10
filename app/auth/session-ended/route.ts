import { NextResponse } from "next/server";

import { clearAuthenticatedSessionCookie } from "@/lib/auth";

function safeRefusalCode(value: string | null) {
  return value && /^[a-z_]{1,100}$/.test(value) ? value : null;
}

export function GET(request: Request) {
  const url = new URL("/", request.url);
  const refusalCode = safeRefusalCode(new URL(request.url).searchParams.get("code"));
  if (refusalCode) url.searchParams.set("refusal", refusalCode);

  return clearAuthenticatedSessionCookie(NextResponse.redirect(url, { status: 303 }));
}
