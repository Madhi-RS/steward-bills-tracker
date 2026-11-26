import "server-only";

import { isSwitchDelete, type CoreClient, type Envelope } from "@pente-ai-inc/module-sdk";

import { db } from "@/lib/db";
import { answerPendingBillCount, isBoardMention, isPendingBillCountQuestion, receiveHireScopeAnswer, type HireScopeInquiryRepository, type PendingBillRepository } from "@/lib/hirescope-board";
import { getStewardCore } from "@/lib/steward";

/**
 * Deletion is deliberately limited to confirmed delete requests (and business purges).
 * Pause and quarantine events have already ended affected SDK sessions before this runs.
 */
export async function handleStewardEvent(event: Envelope, dependencies: { core?: Partial<Pick<CoreClient, "proposal" | "proposalPlan" | "readMention" | "boardPostSigned">>; inquiryRepository?: HireScopeInquiryRepository; billRepository?: PendingBillRepository; signingKey?: import("@pente-ai-inc/module-sdk").SigningKey; moduleId?: string } = {}) {
  if (event.type === "board.mention") {
    // The EventReceiver has already verified the signature, expiry, nonce, and replay status.
    // This path stores matching HireScope answers and answers one fixed, read-only bill question.
    if (!isBoardMention(event.data, event.business)) return;
    const mentionClient = dependencies.core?.readMention
      ? dependencies.core as Pick<CoreClient, "readMention">
      : getStewardCore();
    const post = await mentionClient.readMention(event.data);
    const recordedHireScopeAnswer = await receiveHireScopeAnswer(event, {
      post,
      repository: dependencies.inquiryRepository,
    });
    const answeredPendingBillCount = await answerPendingBillCount(event, {
      client: dependencies.core?.readMention && dependencies.core.boardPostSigned ? dependencies.core as Pick<CoreClient, "readMention" | "boardPostSigned"> : undefined,
      key: dependencies.signingKey,
      moduleId: dependencies.moduleId,
      post,
      repository: dependencies.billRepository,
    });
    if (process.env.NODE_ENV !== "test") {
      console.info("[steward-bills-tracker] board mention handled", {
        eventId: event.id,
        channel: post.channel,
        postType: post.post_type,
        authorKind: post.author_kind,
        pendingBillQuestionMatch: isPendingBillCountQuestion(post.text),
        recordedHireScopeAnswer,
        answeredPendingBillCount,
      });
    }
    return;
  }

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

    const core = dependencies.core?.proposal ? dependencies.core as Pick<CoreClient, "proposal"> : getStewardCore();
    const proposal = await core.proposal(event.business, proposalId);
    if (proposal.result?.type !== "task") return;
    await db.bill.updateMany({
      where: { businessId: event.business, taskProposalId: proposalId },
      data: { taskId: proposal.result.id, taskStatus: "OPEN" },
    });
    return;
  }

  if (event.type === "proposal_plan.decided") {
    const planId = typeof event.data.plan === "string" ? event.data.plan : null;
    if (!planId) return;

    const core = dependencies.core?.proposalPlan ? dependencies.core as Pick<CoreClient, "proposalPlan"> : getStewardCore();
    const plan = await core.proposalPlan(event.business, planId);
    await Promise.all(plan.proposals.map(async (proposal) => {
      if (proposal.kind !== "task.create") return;
      if (proposal.status === "rejected") {
        await db.bill.updateMany({
          where: { businessId: event.business, taskProposalId: proposal.id },
          data: { taskStatus: "REJECTED" },
        });
        return;
      }
      if (proposal.status === "accepted" && proposal.result?.type === "task") {
        await db.bill.updateMany({
          where: { businessId: event.business, taskProposalId: proposal.id },
          data: { taskId: proposal.result.id, taskStatus: "OPEN" },
        });
      }
    }));
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
