import { Prisma } from "@prisma/client";
import { describe, expect, it, beforeEach, vi } from "vitest";

const repository = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
const authentication = vi.hoisted(() => vi.fn());
const unauthenticated = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db: { bill: repository } }));
vi.mock("@/lib/auth", () => ({
  activeStewardContext: () => ({ businessId: "business_1", personId: "person_1", role: "owner", viewerToken: "viewer-token" }),
  mayManageBills: (role: string) => role === "owner" || role === "admin",
  requireAuthenticatedRequest: authentication,
  unauthenticatedResponse: unauthenticated,
}));

import { GET as getBills, POST as createBill } from "@/app/api/bills/route";
import { DELETE as deleteBill, GET as getBill, PUT as updateBill } from "@/app/api/bills/[id]/route";

const routeContext = { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440000" }) };

function databaseBill(overrides = {}) {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    businessId: "business_1",
    createdBy: "person_1",
    companyId: null,
    reason: "Electricity bill",
    totalAmount: new Prisma.Decimal("1250.50"),
    paidAmount: new Prisma.Decimal("500.25"),
    pendingAmount: new Prisma.Decimal("750.25"),
    payBefore: new Date("2026-12-15T00:00:00.000Z"),
    taskProposalId: null,
    taskId: null,
    taskAssigneeId: null,
    taskStatus: null,
    createdAt: new Date("2026-11-05T00:00:00.000Z"),
    updatedAt: new Date("2026-11-05T00:00:00.000Z"),
    ...overrides,
  };
}

const validInput = {
  reason: "Electricity bill",
  totalAmount: "1250.50",
  paidAmount: "500.25",
  payBefore: "2026-12-15",
};

describe("bills API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authentication.mockResolvedValue({ session: { check: { name: "Test user" } }, refusalCode: null, shouldClearCookie: false });
    unauthenticated.mockImplementation((authenticationResult) => Response.json({ error: { code: "UNAUTHENTICATED", refusalCode: authenticationResult.refusalCode } }, { status: 401 }));
  });

  it("lists serialized bills and applies status search filtering", async () => {
    repository.findMany.mockResolvedValue([databaseBill(), databaseBill({ id: "f47ac10b-58cc-4372-a567-0e02b2c3d479", reason: "Water bill", paidAmount: new Prisma.Decimal("1250.50"), pendingAmount: new Prisma.Decimal("0.00") })]);

    const response = await getBills(new Request("http://localhost/api/bills?search=electricity&status=PARTIALLY_PAID"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.bills).toHaveLength(1);
    expect(body.data.bills[0]).toMatchObject({ reason: "Electricity bill", pendingAmount: "750.25", status: "PARTIALLY_PAID" });
  });

  it("refuses requests without an authenticated Steward session", async () => {
    authentication.mockResolvedValueOnce({ session: null, refusalCode: "module_off", shouldClearCookie: true });

    const response = await getBills(new Request("http://localhost/api/bills"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: { code: "UNAUTHENTICATED", refusalCode: "module_off" } });
    expect(unauthenticated).toHaveBeenCalledWith({ session: null, refusalCode: "module_off", shouldClearCookie: true });
    expect(repository.findMany).not.toHaveBeenCalled();
  });

  it("creates bills with a server-calculated pending amount", async () => {
    repository.create.mockResolvedValue(databaseBill());

    const response = await createBill(
      new Request("http://localhost/api/bills", { method: "POST", body: JSON.stringify(validInput) }),
    );

    expect(response.status).toBe(201);
    expect(repository.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ businessId: "business_1", createdBy: "person_1", totalAmount: "1250.50", paidAmount: "500.25", pendingAmount: "750.25" }),
    });
  });

  it("rejects invalid bill input before writing", async () => {
    const response = await createBill(
      new Request("http://localhost/api/bills", { method: "POST", body: JSON.stringify({ ...validInput, paidAmount: "1300.00" }) }),
    );

    expect(response.status).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("gets, updates, and deletes a bill", async () => {
    repository.findFirst.mockResolvedValue(databaseBill());
    repository.update.mockResolvedValue(databaseBill({ reason: "Updated electricity bill" }));
    repository.delete.mockResolvedValue(databaseBill());

    const readResponse = await getBill(new Request("http://localhost/api/bills/550e8400-e29b-41d4-a716-446655440000"), routeContext);
    const updateResponse = await updateBill(
      new Request("http://localhost/api/bills/550e8400-e29b-41d4-a716-446655440000", { method: "PUT", body: JSON.stringify({ ...validInput, reason: "Updated electricity bill" }) }),
      routeContext,
    );
    const deleteResponse = await deleteBill(new Request("http://localhost/api/bills/550e8400-e29b-41d4-a716-446655440000", { method: "DELETE" }), routeContext);

    expect(readResponse.status).toBe(200);
    expect(updateResponse.status).toBe(200);
    expect(repository.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ pendingAmount: "750.25" }) }));
    expect(deleteResponse.status).toBe(204);
  });

  it("returns appropriate errors for missing records and database failures", async () => {
    repository.findFirst.mockResolvedValueOnce(null);
    const missingResponse = await getBill(new Request("http://localhost/api/bills/550e8400-e29b-41d4-a716-446655440000"), routeContext);

    repository.findMany.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Connection failed", { code: "P1001", clientVersion: "6.19.0" }));
    const failureResponse = await getBills(new Request("http://localhost/api/bills"));

    expect(missingResponse.status).toBe(404);
    expect(failureResponse.status).toBe(500);
  });
});
