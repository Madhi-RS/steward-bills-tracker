import "server-only";

import { randomBytes } from "node:crypto";

import type { BoardMentionV1, BoardPostRequest, BoardPostView, CoreClient, SigningKey } from "@pente-ai-inc/module-sdk";

import { db } from "@/lib/db";
import { getStewardCore, getStewardModuleId, getStewardSigningKey } from "@/lib/steward";

export const HIRESCOPE_CHANNEL = "module.hirescope";
export const BILLS_TRACKER_CHANNEL = "module.steward-bills-tracker";
export const PENDING_BILL_COUNT_QUESTION = "Please provide the total number of pending bills.";

/** Accept the Board's same question whether its final full stop was included or omitted. */
export function isPendingBillCountQuestion(text: string) {
  const normalized = text.trim();
  return normalized === PENDING_BILL_COUNT_QUESTION
    || normalized === PENDING_BILL_COUNT_QUESTION.slice(0, -1)
    // The Board may preserve the @mention in the stored post text. The fixed question must still
    // be the complete final sentence; other text is not accepted as a pending-bill request.
    || /(?:^|\s)Please provide the total number of pending bills\.?$/i.test(normalized);
}

type BoardClient = Pick<CoreClient, "boardPostSigned" | "readMention">;
export type PendingBillRepository = Pick<typeof db.bill, "count">;

export type HireScopeInquiryRepository = Pick<typeof db.hireScopeInquiry, "create" | "delete" | "findFirst" | "findMany" | "update" | "updateMany">;

export class HireScopeQuestionPendingError extends Error {
  constructor() {
    super("A HireScope question is already awaiting an answer for this business.");
    this.name = "HireScopeQuestionPendingError";
  }
}

export class HireScopeQuestionFormatError extends Error {
  constructor() {
    super("Use the format: onboarding status for <employee-code>.");
    this.name = "HireScopeQuestionFormatError";
  }
}

function correlationToken() {
  // Fixed-width and plain ASCII so the paired module can echo it verbatim.
  return randomBytes(10).toString("hex");
}

export function questionText(question: string, token: string) {
  const match = /^onboarding status for ([A-Za-z0-9_-]{1,64})$/i.exec(question.trim());
  const suffix = ` [ref:${token}]`;

  if (!match) {
    throw new HireScopeQuestionFormatError();
  }

  return `onboarding status for ${match[1]}${suffix}`;
}

export function correlationFromAnswer(text: string) {
  return text.match(/\[ref:([a-f0-9]{20})\]/i)?.[1]?.toLowerCase() ?? null;
}

/**
 * Posts one signed, source-free question to the paired HireScope channel.
 * The stored record is only an inbox/correlation aid; a board response never updates a Bill.
 */
export async function askHireScope(
  business: string,
  question: string,
  dependencies: { client?: BoardClient; key?: SigningKey; moduleId?: string; repository?: HireScopeInquiryRepository; token?: string } = {},
) {
  const repository = dependencies.repository ?? db.hireScopeInquiry;
  const outstanding = await repository.findFirst({ where: { businessId: business, answerPostId: null } });
  if (outstanding) {
    throw new HireScopeQuestionPendingError();
  }

  const token = dependencies.token ?? correlationToken();
  const text = questionText(question, token);
  let inquiry: { id: string };

  try {
    inquiry = await repository.create({
      data: { businessId: business, correlationToken: token, questionText: text },
    });
  } catch (error) {
    // The database has a partial unique index for one unanswered inquiry per business.
    // If another request wins the race after the read above, return the same expected error.
    if (isUniqueConstraintError(error)) {
      const pendingInquiry = await repository.findFirst({
        where: { businessId: business, answerPostId: null },
      });
      if (pendingInquiry) throw new HireScopeQuestionPendingError();
    }
    throw error;
  }
  const request: BoardPostRequest = { channel: HIRESCOPE_CHANNEL, post_type: "question", text, sources: [] };

  try {
    const post = await (dependencies.client ?? getStewardCore()).boardPostSigned(
      business,
      request,
      dependencies.key ?? getStewardSigningKey(),
      dependencies.moduleId ?? getStewardModuleId(),
    );
    await repository.update({ where: { id: inquiry.id }, data: { questionPostId: post.id } });
    return { id: inquiry.id, questionPostId: post.id, correlationToken: token, text };
  } catch (error) {
    // A failed post is not outstanding, so a person may try again. Never auto-retry a write.
    await repository.delete({ where: { id: inquiry.id } });
    throw error;
  }
}

export function isBoardMention(value: unknown, eventBusiness: string): value is BoardMentionV1 {
  if (!value || typeof value !== "object") return false;
  const mention = value as Record<string, unknown>;
  return mention.business === eventBusiness
    && typeof mention.channel === "string"
    && typeof mention.post === "string"
    && typeof mention.sender === "string";
}

function isMatchingAnswer(post: BoardPostView, mention: BoardMentionV1) {
  return post.id === mention.post
    && mention.channel === BILLS_TRACKER_CHANNEL
    && post.channel === BILLS_TRACKER_CHANNEL
    && post.post_type === "answer";
}

/**
 * Reads an ids-only mention and records a matching answer exactly once. Text remains untrusted
 * data: it is only returned to React as text (never HTML), and never drives a bill/task/proposal.
 */
export async function receiveHireScopeAnswer(
  event: { id: string; business: string; data: unknown },
  dependencies: { client?: Pick<CoreClient, "readMention">; post?: BoardPostView; repository?: HireScopeInquiryRepository } = {},
) {
  if (!isBoardMention(event.data, event.business)) return false;

  const repository = dependencies.repository ?? db.hireScopeInquiry;
  const post = dependencies.post ?? await (dependencies.client ?? getStewardCore()).readMention(event.data);
  if (!isMatchingAnswer(post, event.data)) return false;

  const token = correlationFromAnswer(post.text);
  if (!token) return false;

  const inquiry = await repository.findFirst({
    where: { businessId: event.business, correlationToken: token, answerPostId: null },
  });
  if (!inquiry) return false;

  const recorded = await repository.updateMany({
    where: { id: inquiry.id, answerPostId: null, mentionEventId: null },
    data: {
      answerPostId: post.id,
      mentionEventId: event.id,
      answerText: post.text,
      answeredAt: new Date(post.at),
    },
  });

  return recorded.count === 1;
}

/**
 * Answers one fixed, informational question from either channel in the paired Board exchange.
 * The count is scoped to the event business and reads only local Bill records; it never changes
 * a bill or creates work.
 */
export async function answerPendingBillCount(
  event: { business: string; data: unknown },
  dependencies: {
    client?: BoardClient;
    key?: SigningKey;
    moduleId?: string;
    post?: BoardPostView;
    repository?: PendingBillRepository;
  } = {},
) {
  if (!isBoardMention(event.data, event.business)
    || (event.data.channel !== BILLS_TRACKER_CHANNEL && event.data.channel !== HIRESCOPE_CHANNEL)) {
    return false;
  }

  const client = dependencies.client ?? getStewardCore();
  const post = dependencies.post ?? await client.readMention(event.data);
  if (post.id !== event.data.post
    || post.channel !== event.data.channel
    || post.post_type !== "question"
    || !isPendingBillCountQuestion(post.text)) {
    return false;
  }

  const pendingCount = await (dependencies.repository ?? db.bill).count({
    where: { businessId: event.business, pendingAmount: { gt: 0 } },
  });
  const text = `Bills Tracker has ${pendingCount} pending bill${pendingCount === 1 ? "" : "s"}.`;
  const moduleId = dependencies.moduleId ?? getStewardModuleId();
  // Keep answers to a person, agent, or this module's own UI post in its visible channel.
  // Only a question written by the paired module itself is routed to HireScope's channel.
  const replyChannel = post.author_kind === "module" && post.author !== moduleId
    ? HIRESCOPE_CHANNEL
    : post.channel;

  await client.boardPostSigned(
    event.business,
    { channel: replyChannel, post_type: "answer", text, sources: [] },
    dependencies.key ?? getStewardSigningKey(),
    moduleId,
  );
  return true;
}

export async function listHireScopeInquiries(business: string, repository: Pick<HireScopeInquiryRepository, "findMany"> = db.hireScopeInquiry) {
  return repository.findMany({
    where: { businessId: business },
    orderBy: { createdAt: "desc" },
    select: { id: true, questionText: true, answerText: true, answeredAt: true, createdAt: true },
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
