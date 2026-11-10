import { SignInRefused, StewardSessions, type SignedIn } from "@pente-ai-inc/module-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({ sessions: undefined as StewardSessions | undefined }));

vi.mock("@/lib/steward", () => ({
  getStewardSessions: () => dependencies.sessions,
  getStewardSignIn: () => ({ start: vi.fn() }),
  shouldUseSecureCookies: () => false,
}));

import { findAuthenticatedSession, unauthenticatedResponse } from "@/lib/auth";

function signedIn(expiresAt = Date.now() - 1): SignedIn {
  return {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt,
    check: {
      person: "person_1",
      name: "Test User",
      businesses: [{ business: "business_1", role: "owner" }],
    },
  };
}

async function expiredSession(refusal: SignInRefused) {
  const renewer = { refresh: vi.fn().mockRejectedValue(refusal) };
  const sessions = new StewardSessions(renewer);
  dependencies.sessions = sessions;
  const id = await sessions.create(signedIn());
  return { id, renewer, sessions };
}

describe("SDK-managed authenticated sessions", () => {
  beforeEach(() => {
    dependencies.sessions = undefined;
  });

  it("uses an unexpired session without renewing it", async () => {
    const renewer = { refresh: vi.fn() };
    const sessions = new StewardSessions(renewer);
    dependencies.sessions = sessions;
    const id = await sessions.create(signedIn(Date.now() + 60_000));

    await expect(findAuthenticatedSession(id)).resolves.toMatchObject({
      session: { check: { name: "Test User" } },
      refusalCode: null,
      shouldClearCookie: false,
    });
    expect(renewer.refresh).not.toHaveBeenCalled();
  });

  it("renews an expired session before allowing it", async () => {
    const renewed = signedIn(Date.now() + 60_000);
    const renewer = { refresh: vi.fn().mockResolvedValue(renewed) };
    const sessions = new StewardSessions(renewer);
    dependencies.sessions = sessions;
    const id = await sessions.create(signedIn());

    await expect(findAuthenticatedSession(id)).resolves.toMatchObject({
      session: { accessToken: "access-token", check: { name: "Test User" } },
      refusalCode: null,
      shouldClearCookie: false,
    });
    expect(renewer.refresh).toHaveBeenCalledWith("refresh-token");
  });

  it("ends and clears a session after a token-refresh rejection", async () => {
    const { id, renewer, sessions } = await expiredSession(new SignInRefused("The sign-in ended.", "session_ended"));

    await expect(findAuthenticatedSession(id)).resolves.toMatchObject({
      session: null,
      refusalCode: "session_ended",
      shouldClearCookie: true,
    });
    expect(renewer.refresh).toHaveBeenCalledWith("refresh-token");
    await expect(sessions.get(id)).resolves.toBeNull();
  });

  it("preserves module_off when Steward refuses a renewal", async () => {
    const { id, sessions } = await expiredSession(new SignInRefused("The module is disabled.", "module_off"));

    await expect(findAuthenticatedSession(id)).resolves.toMatchObject({
      session: null,
      refusalCode: "module_off",
      shouldClearCookie: true,
    });
    await expect(sessions.get(id)).resolves.toBeNull();
  });

  it("returns a 401 API response that exposes the safe refusal code and clears the cookie", async () => {
    const response = unauthenticatedResponse({ session: null, refusalCode: "module_off", shouldClearCookie: true });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "UNAUTHENTICATED",
        message: "Sign in with Steward to access bills.",
        refusalCode: "module_off",
      },
    });
    expect(response.headers.get("set-cookie")).toContain("steward_bills_session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
