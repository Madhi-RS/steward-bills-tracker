import { SigningKey, StewardSessions, type Envelope, type SignedIn, sign } from "@pente-ai-inc/module-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const billRepository = vi.hoisted(() => ({ deleteMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: { bill: billRepository } }));

import { handleStewardEvent } from "@/lib/steward-events";
import { createStewardEventReceiver } from "@/lib/steward";

function signedIn(businesses = ["business_1"]): SignedIn {
  return {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
    check: {
      person: "person_1",
      name: "Test User",
      businesses: businesses.map((business) => ({ business, role: "owner" as const })),
    },
  };
}

function envelope(type: string, seq: number, data: Record<string, unknown>): Envelope {
  return { id: `event_${seq}`, type, version: 1, business: "business_1", seq, at: new Date().toISOString(), data };
}

describe("Steward event lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ends business sessions on a signed module.disabled event and never restores them on re-enable", async () => {
    const sessions = new StewardSessions({ refresh: vi.fn() });
    const sessionId = await sessions.create(signedIn());
    const multiBusinessSessionId = await sessions.create(signedIn(["business_1", "business_2"]));
    const key = SigningKey.generate();
    const endBusiness = vi.fn(sessions.endBusiness.bind(sessions));
    const receiver = createStewardEventReceiver(key, { endBusiness });
    const disabled = envelope("module.disabled", 1, { business: "business_1", plan: "plan", mode: "pause" });
    const body = JSON.stringify(disabled);
    const headers = sign(key, "steward-bills-tracker", "POST", "/steward/events", body);

    await expect(receiver.receive((name) => headers[name], "/steward/events", body)).resolves.toMatchObject({ kind: "event" });
    expect(endBusiness).toHaveBeenCalledWith("business_1");
    await expect(sessions.get(sessionId)).resolves.toBeNull();
    await expect(sessions.get(multiBusinessSessionId)).resolves.toMatchObject({
      check: { businesses: [{ business: "business_2", role: "owner" }] },
    });

    await expect(receiver.caughtUp(envelope("module.enabled", 2, { business: "business_1", plan: "plan" }))).resolves.toMatchObject({ kind: "event" });
    await expect(sessions.get(sessionId)).resolves.toBeNull();
    await expect(sessions.get(multiBusinessSessionId)).resolves.toMatchObject({
      check: { businesses: [{ business: "business_2", role: "owner" }] },
    });
  });

  it("deletes stored bill data only for a confirmed delete or purge", async () => {
    await handleStewardEvent(envelope("module.disabled", 1, { business: "business_1", plan: "plan", mode: "pause" }));
    await handleStewardEvent(envelope("module.disabled", 2, { business: "business_1", plan: "plan", mode: "quarantine" }));
    expect(billRepository.deleteMany).not.toHaveBeenCalled();

    await handleStewardEvent(envelope("module.disabled", 3, { business: "business_1", plan: "plan", mode: "delete" }));
    await handleStewardEvent(envelope("business.purged", 4, { business: "business_1" }));
    expect(billRepository.deleteMany).toHaveBeenCalledTimes(2);
    expect(billRepository.deleteMany).toHaveBeenCalledWith({ where: { businessId: "business_1" } });
  });

  it("links an accepted proposal and marks the bill paid when the Steward task closes", async () => {
    const core = {
      proposal: vi.fn().mockResolvedValue({
        id: "mpr_01proposal",
        kind: "task.create",
        status: "accepted",
        created_at: new Date().toISOString(),
        result: { type: "task", id: "tsk_01task" },
      }),
    };

    await handleStewardEvent(
      envelope("proposal.decided", 5, { proposal: "mpr_01proposal", status: "accepted" }),
      { core },
    );
    expect(billRepository.updateMany).toHaveBeenCalledWith({
      where: { businessId: "business_1", taskProposalId: "mpr_01proposal" },
      data: { taskId: "tsk_01task", taskStatus: "OPEN" },
    });

    billRepository.findFirst.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440000",
      totalAmount: "1250.50",
    });
    await handleStewardEvent(envelope("task.changed", 6, { task: "tsk_01task", change: "closed" }));
    expect(billRepository.update).toHaveBeenCalledWith({
      where: { id: "550e8400-e29b-41d4-a716-446655440000" },
      data: { paidAmount: "1250.50", pendingAmount: "0.00", taskStatus: "COMPLETED" },
    });
  });
});
