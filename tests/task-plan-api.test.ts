import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({ findMany: vi.fn(), update: vi.fn(), $transaction: vi.fn() }));
const proposePlan = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db: {
  bill: { findMany: repository.findMany, update: repository.update },
  $transaction: repository.$transaction,
} }));
vi.mock("@/lib/steward", () => ({ getStewardCore: () => ({ proposePlan }) }));
vi.mock("@/lib/auth", () => ({
  activeStewardContext: () => ({ businessId: "ten_01", personId: "usr_owner", role: "owner", viewerToken: "viewer-token" }),
  mayManageBills: (role: string) => role === "owner" || role === "admin",
  requireAuthenticatedRequest: vi.fn().mockResolvedValue({ session: {}, refusalCode: null, shouldClearCookie: false }),
  unauthenticatedResponse: vi.fn(),
}));

import { POST } from "@/app/api/bills/task-plan/route";

const billIds = ["550e8400-e29b-41d4-a716-446655440000", "f47ac10b-58cc-4372-a567-0e02b2c3d479"];

function bill(id: string, reason: string) {
  return {
    id,
    businessId: "ten_01",
    createdBy: "usr_owner",
    companyId: null,
    reason,
    totalAmount: new Prisma.Decimal("1250.50"),
    paidAmount: new Prisma.Decimal("0.00"),
    pendingAmount: new Prisma.Decimal("1250.50"),
    payBefore: new Date("2026-12-15T00:00:00.000Z"),
    taskProposalId: null,
    taskId: null,
    taskAssigneeId: null,
    taskStatus: null,
    createdAt: new Date("2026-11-05T00:00:00.000Z"),
    updatedAt: new Date("2026-11-05T00:00:00.000Z"),
  };
}

describe("bill task plan API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.$transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it("proposes up to 25 linked invoice tasks as one Steward plan", async () => {
    const selectedBills = [bill(billIds[0], "Electricity bill"), bill(billIds[1], "Water bill")];
    repository.findMany.mockResolvedValue(selectedBills);
    repository.update.mockImplementation(({ where, data }) => Promise.resolve({
      ...selectedBills.find((item) => item.id === where.id),
      ...data,
    }));
    proposePlan.mockResolvedValue({
      id: "mpp_01plan",
      proposals: [
        { id: "mpr_electricity", kind: "task.create" },
        { id: "mpr_water", kind: "task.create" },
      ],
    });

    const response = await POST(new Request("http://localhost/api/bills/task-plan", {
      method: "POST",
      body: JSON.stringify({ billIds, assignee: "usr_01tm", company: "cmp_01" }),
    }));

    expect(response.status).toBe(201);
    expect(proposePlan).toHaveBeenCalledWith("ten_01", expect.objectContaining({
      title: "Assign 2 invoice payment tasks",
      proposals: expect.arrayContaining([
        expect.objectContaining({ kind: "task.create", company: "cmp_01", payload: expect.objectContaining({ assignee: "usr_01tm", record_ref: `bill:${billIds[0]}`, context: "@computer", time_minutes: 15, energy: "low" }) }),
        expect.objectContaining({ kind: "task.create", company: "cmp_01", payload: expect.objectContaining({ assignee: "usr_01tm", record_ref: `bill:${billIds[1]}`, context: "@computer", time_minutes: 15, energy: "low" }) }),
      ]),
    }), "viewer-token");
    expect(repository.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: billIds[0] },
      data: expect.objectContaining({ taskProposalId: "mpr_electricity", taskStatus: "PENDING_REVIEW" }),
    }));
    expect(repository.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: billIds[1] },
      data: expect.objectContaining({ taskProposalId: "mpr_water", taskStatus: "PENDING_REVIEW" }),
    }));
  });
});
