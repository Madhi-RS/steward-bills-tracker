import { CoreClient, CoreError, EventReceiver, SignatureError, StaticToken, sign } from "@pente-ai-inc/module-sdk";
import { FakeCore } from "@pente-ai-inc/module-sdk/testkit";
import { afterEach, describe, expect, it } from "vitest";

import { askHireScope, HireScopeQuestionPendingError, PENDING_BILL_COUNT_QUESTION } from "@/lib/hirescope-board";
import { handleStewardEvent } from "@/lib/steward-events";

type Row = {
  id: string;
  businessId: string;
  correlationToken: string;
  questionText: string;
  questionPostId: string | null;
  answerPostId: string | null;
  mentionEventId: string | null;
  answerText: string | null;
  answeredAt: Date | null;
};

function inbox() {
  const rows: Row[] = [];
  return {
    rows,
    repository: {
      findFirst: async ({ where }: { where: Partial<Row> }) => rows.find((row) => Object.entries(where).every(([key, value]) => row[key as keyof Row] === value)) ?? null,
      create: async ({ data }: { data: Pick<Row, "businessId" | "correlationToken" | "questionText"> }) => {
        const row: Row = { id: `inquiry_${rows.length + 1}`, ...data, questionPostId: null, answerPostId: null, mentionEventId: null, answerText: null, answeredAt: null };
        rows.push(row);
        return row;
      },
      update: async ({ where, data }: { where: Pick<Row, "id">; data: Partial<Row> }) => {
        const row = rows.find((item) => item.id === where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: { where: Pick<Row, "id"> }) => {
        const index = rows.findIndex((row) => row.id === where.id);
        if (index >= 0) rows.splice(index, 1);
      },
      updateMany: async ({ where, data }: { where: Partial<Row>; data: Partial<Row> }) => {
        const matched = rows.filter((row) => Object.entries(where).every(([key, value]) => row[key as keyof Row] === value));
        matched.forEach((row) => Object.assign(row, data));
        return { count: matched.length };
      },
      findMany: async () => rows,
    },
  };
}

describe("HireScope business-board exchange", () => {
  const cores: FakeCore[] = [];

  afterEach(async () => {
    await Promise.all(cores.splice(0).map((core) => core.stop()));
  });

  it("posts exactly one signed question and refuses unsigned or replayed posts", async () => {
    const core = await FakeCore.start();
    cores.push(core);
    core.addBusiness("business_1", true);
    const client = new CoreClient(core.url, new StaticToken(core.serviceToken));
    const { repository } = inbox();

    const asked = await askHireScope("business_1", "onboarding status for EMP-001", {
      client,
      key: core.key,
      moduleId: core.moduleId,
      repository: repository as never,
      token: "0123456789abcdef0123",
    });

    expect(asked.text).toBe("onboarding status for EMP-001 [ref:0123456789abcdef0123]");
    expect(core.boardPosts).toHaveLength(1);
    expect(core.boardPosts[0]).toEqual([
      "business_1",
      expect.objectContaining({ channel: "module.hirescope", post_type: "question", sources: [] }),
    ]);

    await expect(client.boardPost("business_1", {
      channel: "module.hirescope", post_type: "question", text: "unsigned", sources: [],
    })).rejects.toMatchObject<Partial<CoreError>>({ code: "unauthenticated" });

    const body = JSON.stringify({ channel: "module.hirescope", post_type: "question", text: "replay", sources: [] });
    const headers = { authorization: `Bearer ${core.serviceToken}`, "content-type": "application/json", ...sign(core.key, core.moduleId, "POST", "/api/module/v1/business_1/board/posts", body) };
    const first = await fetch(`${core.url}/api/module/v1/business_1/board/posts`, { method: "POST", headers, body });
    const replay = await fetch(`${core.url}/api/module/v1/business_1/board/posts`, { method: "POST", headers, body });
    expect(first.status).toBe(200);
    expect(replay.status).toBe(401);
  });

  it("maps a concurrent open-inquiry unique conflict to the pending-question error", async () => {
    let findCount = 0;
    const pendingInquiry: Row = {
      id: "inquiry_existing",
      businessId: "business_1",
      correlationToken: "0123456789abcdef0123",
      questionText: "onboarding status for EMP-001 [ref:0123456789abcdef0123]",
      questionPostId: null,
      answerPostId: null,
      mentionEventId: null,
      answerText: null,
      answeredAt: null,
    };
    const repository = {
      findFirst: async () => (++findCount === 1 ? null : pendingInquiry),
      create: async () => { throw Object.assign(new Error("unique constraint"), { code: "P2002" }); },
    };

    await expect(askHireScope("business_1", "onboarding status for EMP-001", {
      repository: repository as never,
      token: "abcdef0123456789abcd",
    })).rejects.toBeInstanceOf(HireScopeQuestionPendingError);
  });

  it("reads a matching answer once and never acts on its content", async () => {
    const core = await FakeCore.start();
    cores.push(core);
    core.addBusiness("business_1", true);
    const client = new CoreClient(core.url, new StaticToken(core.serviceToken));
    const { rows, repository } = inbox();
    const asked = await askHireScope("business_1", "onboarding status for EMP-001", {
      client,
      key: core.key,
      moduleId: core.moduleId,
      repository: repository as never,
      token: "abcdef0123456789abcd",
    });
    const answerText = `Ada is ready to start. [ref:${asked.correlationToken}]`;
    const answerPost = core.addBoardPost("business_1", "module.steward-bills-tracker", "answer", answerText);
    const event = {
      id: "event_answer_1",
      type: "board.mention",
      version: 1,
      business: "business_1",
      seq: 1,
      at: new Date().toISOString(),
      data: { business: "business_1", channel: "module.steward-bills-tracker", post: answerPost, sender: "hirescope" },
    };

    await handleStewardEvent(event, { core: client, inquiryRepository: repository as never });
    await handleStewardEvent(event, { core: client, inquiryRepository: repository as never });

    expect(rows).toEqual([
      expect.objectContaining({ answerPostId: answerPost, mentionEventId: "event_answer_1", answerText }),
    ]);
    expect(core.proposals).toEqual([]);
    expect(core.tasksMade).toEqual([]);
    expect(core.recordReads).toEqual([]);
  });

  it("answers the fixed pending-bill-count question after its Board mention, with or without a final full stop", async () => {
    const core = await FakeCore.start();
    cores.push(core);
    core.addBusiness("business_1", true);
    const client = new CoreClient(core.url, new StaticToken(core.serviceToken));
    const count = async ({ where }: { where: unknown }) => {
      expect(where).toEqual({ businessId: "business_1", pendingAmount: { gt: 0 } });
      return 3;
    };
    const questionPost = core.addBoardPost(
      "business_1",
      "module.steward-bills-tracker",
      "question",
      `@steward-bills-tracker ${PENDING_BILL_COUNT_QUESTION.slice(0, -1)}`,
    );
    core.boardPosts[0][1].author_kind = "module";
    core.boardPosts[0][1].author = core.moduleId;
    const event = {
      id: "event_question_1",
      type: "board.mention",
      version: 1,
      business: "business_1",
      seq: 1,
      at: new Date().toISOString(),
      data: { business: "business_1", channel: "module.steward-bills-tracker", post: questionPost, sender: "hirescope" },
    };

    await handleStewardEvent(event, {
      core: client,
      billRepository: { count } as never,
      signingKey: core.key,
      moduleId: core.moduleId,
    });

    expect(core.boardPosts).toHaveLength(2);
    expect(core.boardPosts[1]).toEqual([
      "business_1",
      expect.objectContaining({
        channel: "module.steward-bills-tracker",
        post_type: "answer",
        text: "Bills Tracker has 3 pending bills.",
        sources: [],
      }),
    ]);
    expect(core.proposals).toEqual([]);
    expect(core.tasksMade).toEqual([]);

    const unsupportedPost = core.addBoardPost("business_1", "module.steward-bills-tracker", "question", "How many pending bills are there?");
    await handleStewardEvent({ ...event, id: "event_question_2", seq: 2, data: { ...event.data, post: unsupportedPost } }, {
      core: client,
      billRepository: { count } as never,
      signingKey: core.key,
      moduleId: core.moduleId,
    });
    expect(core.boardPosts).toHaveLength(3);

    const pairedModulePost = core.addBoardPost("business_1", "module.steward-bills-tracker", "question", PENDING_BILL_COUNT_QUESTION);
    core.boardPosts[3][1].author_kind = "module";
    core.boardPosts[3][1].author = "mod_hirescope";
    await handleStewardEvent({ ...event, id: "event_question_3", seq: 3, data: { ...event.data, post: pairedModulePost, sender: "hirescope" } }, {
      core: client,
      billRepository: { count } as never,
      signingKey: core.key,
      moduleId: core.moduleId,
    });
    expect(core.boardPosts[4]).toEqual([
      "business_1",
      expect.objectContaining({ channel: "module.hirescope", post_type: "answer" }),
    ]);

    const hireScopeChannelPost = core.addBoardPost("business_1", "module.hirescope", "question", PENDING_BILL_COUNT_QUESTION);
    await handleStewardEvent({
      ...event,
      id: "event_question_4",
      seq: 4,
      data: { ...event.data, channel: "module.hirescope", post: hireScopeChannelPost },
    }, {
      core: client,
      billRepository: { count } as never,
      signingKey: core.key,
      moduleId: core.moduleId,
    });
    expect(core.boardPosts[6]).toEqual([
      "business_1",
      expect.objectContaining({
        channel: "module.hirescope",
        post_type: "answer",
        text: "Bills Tracker has 3 pending bills.",
      }),
    ]);
  });

  it("leaves mention authentication and replay rejection to the SDK receiver", async () => {
    const core = await FakeCore.start();
    cores.push(core);
    const receiver = new EventReceiver(core.key);
    const event = {
      id: "event_signed_mention_1",
      type: "board.mention",
      version: 1,
      business: "business_1",
      seq: 1,
      at: new Date().toISOString(),
      data: { business: "business_1", channel: "module.steward-bills-tracker", post: "post_1", sender: "hirescope" },
    };
    const body = JSON.stringify(event);
    const headers = sign(core.key, "steward", "POST", "/steward/events", body);

    await expect(receiver.receive((name) => headers[name], "/steward/events", body)).resolves.toMatchObject({ kind: "event" });
    await expect(receiver.receive((name) => headers[name], "/steward/events", body)).rejects.toMatchObject<Partial<SignatureError>>({ reason: "replayed" });
    await expect(receiver.receive(() => null, "/steward/events", body)).rejects.toBeInstanceOf(SignatureError);
  });
});
