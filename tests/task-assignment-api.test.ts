import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn() }));
const proposeTask = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db: { bill: repository } }));
vi.mock("@/lib/steward", () => ({ getStewardCore: () => ({ proposeTask }) }));
vi.mock("@/lib/auth", () => ({
  activeStewardContext: () => ({ businessId: "ten_01", personId: "usr_owner", role: "owner", viewerToken: "viewer-token" }),
  mayManageBills: (role: string) => role === "owner" || role === "admin",
  requireAuthenticatedRequest: vi.fn().mockResolvedValue({ session: {}, refusalCode: null, shouldClearCookie: false }),
  unauthenticatedResponse: vi.fn(),
}));

import { POST } from "@/app/api/bills/[id]/task/route";

const id = "550e8400-e29b-41d4-a716-446655440000";
const bill = {
  id,
  businessId: "ten_01",
  createdBy: "usr_owner",
  companyId: null,
  reason: "Electricity bill",
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

describe("bill task assignment API", () => {
  it("proposes a linked Steward task and stores its proposal mapping", async () => {
    repository.findFirst.mockResolvedValue(bill);
    proposeTask.mockResolvedValue({ id: "mpr_01proposal" });
    repository.update.mockResolvedValue({
      ...bill,
      companyId: "cmp_01",
      taskProposalId: "mpr_01proposal",
      taskAssigneeId: "usr_01tm",
      taskStatus: "PENDING_REVIEW",
    });

    const response = await POST(
      new Request(`http://localhost/api/bills/${id}/task`, {
        method: "POST",
        body: JSON.stringify({ assignee: "usr_01tm", company: "cmp_01" }),
      }),
      { params: Promise.resolve({ id }) },
    );

    expect(response.status).toBe(201);
    expect(proposeTask).toHaveBeenCalledWith(
      "ten_01",
      expect.objectContaining({
        company: "cmp_01",
        assignee: "usr_01tm",
        title: "Pay invoice: Electricity bill",
        record_ref: `bill:${id}`,
      }),
      [],
      1,
      "viewer-token",
    );
    expect(repository.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ taskProposalId: "mpr_01proposal", taskStatus: "PENDING_REVIEW" }),
    }));
  });
});
