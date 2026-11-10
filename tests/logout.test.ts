import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/steward", () => ({
  getStewardSessions: vi.fn(),
  getStewardSignIn: vi.fn(),
  shouldUseSecureCookies: () => false,
}));

import { POST } from "@/app/auth/logout/route";

describe("bill-app logout", () => {
  it("clears the opaque bill-app session cookie", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { signedOut: true } });
    expect(response.headers.get("set-cookie")).toContain("steward_bills_session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
