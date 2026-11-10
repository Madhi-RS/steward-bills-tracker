import "server-only";

import { randomBytes } from "node:crypto";

import { SignInRefused, type SignedIn } from "@pente-ai-inc/module-sdk";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getStewardSignIn, getStewardSessions, shouldUseSecureCookies } from "@/lib/steward";

export const AUTH_ATTEMPT_COOKIE = "steward_auth_attempt";
export const AUTH_SESSION_COOKIE = "steward_bills_session";

const AUTH_ATTEMPT_TTL_SECONDS = 10 * 60;

type AuthAttempt = { expiresAt: number; state: string; verifier: string };
type AuthStore = { attempts: Map<string, AuthAttempt> };

const globalForAuth = globalThis as typeof globalThis & { stewardBillsAuth?: AuthStore };
const store = globalForAuth.stewardBillsAuth ?? { attempts: new Map<string, AuthAttempt>() };

if (process.env.NODE_ENV !== "production") {
  globalForAuth.stewardBillsAuth = store;
}

export type AuthenticatedSession = SignedIn;
export type AuthenticatedSessionResult = {
  session: AuthenticatedSession | null;
  refusalCode: string | null;
  shouldClearCookie: boolean;
};

export function activeStewardContext(session: AuthenticatedSession) {
  const access = session.check.businesses[0];

  if (!access) {
    throw new Error("The Steward session has no active business.");
  }

  return {
    businessId: access.business,
    personId: session.check.person,
    personName: session.check.name,
    role: access.role,
    viewerToken: session.accessToken,
  };
}

export function mayManageBills(role: string) {
  return role === "owner" || role === "admin";
}

export function sessionCookieOptions(maxAge: number) {
  return { httpOnly: true, maxAge, path: "/", sameSite: "lax" as const, secure: shouldUseSecureCookies() };
}

function opaqueId() {
  return randomBytes(32).toString("base64url");
}

function clearExpiredEntries() {
  const now = Date.now();
  for (const [id, attempt] of store.attempts) if (attempt.expiresAt <= now) store.attempts.delete(id);
}

function cookieValue(request: Request, name: string) {
  const values = request.headers.get("cookie")?.split(";") ?? [];
  const prefix = `${name}=`;
  const cookie = values.map((value) => value.trim()).find((value) => value.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : undefined;
}

export function beginStewardSignIn() {
  clearExpiredEntries();
  const started = getStewardSignIn().start();
  const attemptId = opaqueId();
  store.attempts.set(attemptId, { state: started.state, verifier: started.verifier, expiresAt: Date.now() + AUTH_ATTEMPT_TTL_SECONDS * 1000 });
  return { attemptId, authorizationUrl: started.url };
}

export function takeStewardSignInAttempt(request: Request) {
  clearExpiredEntries();
  const attemptId = cookieValue(request, AUTH_ATTEMPT_COOKIE);
  if (!attemptId) return undefined;
  const attempt = store.attempts.get(attemptId);
  store.attempts.delete(attemptId);
  return attempt;
}

export async function createAuthenticatedSession(signedIn: SignedIn) {
  clearExpiredEntries();
  return getStewardSessions().create(signedIn);
}

function safeRefusalCode(code: string | null) {
  return code && /^[a-z_]{1,100}$/.test(code) ? code : "sign_in_failed";
}

/** Read one SDK-managed session and retain the safe reason when Steward ended it. */
export async function findAuthenticatedSession(sessionId: string | undefined): Promise<AuthenticatedSessionResult> {
  const result = await getStewardSessions().get(sessionId);

  if (result instanceof SignInRefused) {
    return { session: null, refusalCode: safeRefusalCode(result.code), shouldClearCookie: Boolean(sessionId) };
  }

  if (!result) {
    return { session: null, refusalCode: null, shouldClearCookie: Boolean(sessionId) };
  }

  return { session: result, refusalCode: null, shouldClearCookie: false };
}

export async function getAuthenticatedSession(): Promise<AuthenticatedSessionResult> {
  const cookieStore = await cookies();
  return findAuthenticatedSession(cookieStore.get(AUTH_SESSION_COOKIE)?.value);
}

export async function requireAuthenticatedRequest(request: Request): Promise<AuthenticatedSessionResult> {
  return findAuthenticatedSession(cookieValue(request, AUTH_SESSION_COOKIE));
}

export function clearAuthenticatedSessionCookie(response: NextResponse) {
  response.cookies.set(AUTH_SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  return response;
}

export function unauthenticatedResponse(authentication: AuthenticatedSessionResult) {
  const response = NextResponse.json(
    {
      error: {
        code: "UNAUTHENTICATED",
        message: "Sign in with Steward to access bills.",
        ...(authentication.refusalCode ? { refusalCode: authentication.refusalCode } : {}),
      },
    },
    { status: 401 },
  );

  return authentication.shouldClearCookie ? clearAuthenticatedSessionCookie(response) : response;
}
