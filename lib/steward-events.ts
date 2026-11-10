import "server-only";

import { isSwitchDelete, type CoreClient, type Envelope } from "@pente-ai-inc/module-sdk";

import { db } from "@/lib/db";
import { getStewardCore } from "@/lib/steward";

/**
 * Deletion is deliberately limited to confirmed delete requests (and business purges).
 * Pause and quarantine events have already ended affected SDK sessions before this runs.
 */
export async function handleStewardEvent(event: Envelope, dependencies: { core?: Pick<CoreClient, "proposal"> } = {}) {
  if (event.type === "business.purged" || isSwitchDelete(event)) {
    await db.bill.deleteMany({ where: { businessId: event.business } });
    return;
  }

  if (event.type === "proposal.decided") {
    const proposalId = typeof event.data.proposal === "string" ? event.data.proposal : null;
    const status = event.data.status;
    if (!proposalId || (status !== "accepted" && status !== "rejected")) return;

    if (status === "rejected") {
      await db.bill.updateMany({
        where: { businessId: event.business, taskProposalId: proposalId },
        data: { taskStatus: "REJECTED" },
      });
      return;
    }

    const proposal = await (dependencies.core ?? getStewardCore()).proposal(event.business, proposalId);
    if (proposal.result?.type !== "task") return;
    await db.bill.updateMany({
      where: { businessId: event.business, taskProposalId: proposalId },
      data: { taskId: proposal.result.id, taskStatus: "OPEN" },
    });
    return;
  }

  if (event.type === "task.changed") {
    const taskId = typeof event.data.task === "string" ? event.data.task : null;
    const change = typeof event.data.change === "string" ? event.data.change : null;
    if (!taskId || !change) return;

    if (change === "closed") {
      const bill = await db.bill.findFirst({ where: { businessId: event.business, taskId } });
      if (!bill) return;
      await db.bill.update({
        where: { id: bill.id },
        data: { paidAmount: bill.totalAmount, pendingAmount: "0.00", taskStatus: "COMPLETED" },
      });
      return;
    }

    const mappedStatus: Record<string, string> = {
      created: "OPEN",
      reopened: "OPEN",
      active: "ACTIVE",
      updated: "ACTIVE",
      waiting: "WAITING",
      dropped: "DROPPED",
    };
    const taskStatus = mappedStatus[change];
    if (taskStatus) {
      await db.bill.updateMany({
        where: { businessId: event.business, taskId },
        data: { taskStatus },
      });
    }
  }
}
