import { loadRuntimeEnv } from "@gprn/config";
import { prisma, type Prisma } from "@gprn/db";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CurrentUser } from "./auth.service.js";
import { asRecord, optionalEnum, requiredString } from "./validation.js";
import { boundedText, requireUuid } from "./community-policy.js";
import { publicAssetUrl } from "./serialization.js";

const topics = ["MESSAGE", "SHOOT", "REVIEW", "MENTORSHIP"] as const;
const memberSelect = {
  id: true,
  status: true,
  profile: {
    select: {
      username: true,
      displayName: true,
      avatarAssetKey: true,
      deletedAt: true,
    },
  },
} as const;
const threadInclude = {
  initiator: { select: memberSelect },
  recipient: { select: memberSelect },
  messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
} satisfies Prisma.InteractionThreadInclude;
type Thread = Prisma.InteractionThreadGetPayload<{
  include: typeof threadInclude;
}>;
const participant = (userId: string) => ({
  OR: [{ initiatorId: userId }, { recipientId: userId }],
});
function pageNumber(value = "1") {
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1 || page > 10000)
    throw new BadRequestException({ code: "INVALID_PAGE" });
  return page;
}

@Injectable()
export class InteractionsService {
  private readonly env = loadRuntimeEnv();
  private member(user: Thread["initiator"]) {
    return {
      id: user.id,
      username: user.profile?.username,
      displayName: user.profile?.displayName ?? "Member",
      avatarUrl: user.profile?.avatarAssetKey
        ? publicAssetUrl(this.env, user.profile.avatarAssetKey)
        : null,
    };
  }
  private serialize(thread: Thread, userId: string) {
    const incoming = thread.recipientId === userId;
    const last = thread.messages[0];
    const readAt = incoming ? thread.recipientReadAt : thread.initiatorReadAt;
    return {
      id: thread.id,
      topic: thread.topic,
      status: thread.status,
      incoming,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      peer: this.member(incoming ? thread.initiator : thread.recipient),
      unread: Boolean(
        last &&
        last.authorId !== userId &&
        (!readAt || last.createdAt > readAt),
      ),
      lastMessage: last ?? null,
    };
  }
  async list(user: CurrentUser, query: Record<string, string | undefined>) {
    const page = pageNumber(query.page);
    const topic = optionalEnum(query, "topic", topics);
    const where = {
      ...participant(user.id),
      ...(topic
        ? { topic }
        : query.requests === "true"
          ? { topic: { not: "MESSAGE" } }
          : {}),
    };
    const [threads, total] = await Promise.all([
      prisma.interactionThread.findMany({
        where,
        include: threadInclude,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 30,
        skip: (page - 1) * 30,
      }),
      prisma.interactionThread.count({ where }),
    ]);
    return {
      threads: threads.map((t) => this.serialize(t, user.id)),
      total,
      page,
    };
  }
  async detail(user: CurrentUser, id: string, pageValue?: string) {
    requireUuid(id);
    const page = pageNumber(pageValue);
    const thread = await prisma.interactionThread.findFirst({
      where: { id, ...participant(user.id) },
      include: threadInclude,
    });
    if (!thread) throw new NotFoundException({ code: "THREAD_NOT_FOUND" });
    const [messages, total] = await Promise.all([
      prisma.interactionMessage.findMany({
        where: { threadId: id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
        skip: (page - 1) * 50,
      }),
      prisma.interactionMessage.count({ where: { threadId: id } }),
    ]);
    if (page === 1 && thread.messages[0]) {
      const readAt = thread.messages[0].createdAt;
      // Read receipts must not reorder conversations or overwrite a concurrent send.
      if (thread.initiatorId === user.id)
        await prisma.$executeRaw`UPDATE interaction_threads SET "initiatorReadAt" = GREATEST("initiatorReadAt", ${readAt}) WHERE id = ${id}::uuid`;
      else
        await prisma.$executeRaw`UPDATE interaction_threads SET "recipientReadAt" = GREATEST("recipientReadAt", ${readAt}) WHERE id = ${id}::uuid`;
    }
    return {
      thread: {
        ...this.serialize(thread, user.id),
        ...(page === 1 ? { unread: false } : {}),
      },
      messages: messages.reverse(),
      total,
      page,
    };
  }
  private async quota(tx: Prisma.TransactionClient, userId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`interaction-send:${userId}`}))`;
    if (
      (await tx.interactionMessage.count({
        where: {
          authorId: userId,
          createdAt: { gte: new Date(Date.now() - 3600000) },
        },
      })) >= 60
    )
      throw new HttpException({ code: "RATE_LIMITED" }, 429);
  }
  async contact(user: CurrentUser, username: string, body: unknown) {
    const input = asRecord(body),
      topic = optionalEnum(input, "topic", topics) ?? "MESSAGE";
    const text = boundedText(requiredString(input, "body"), 5000);
    const peer = await prisma.user.findFirst({
      where: {
        status: "ACTIVE",
        deletedAt: null,
        profile: {
          username: username.toLowerCase(),
          deletedAt: null,
          visibility: "PUBLIC",
        },
      },
    });
    if (!peer || peer.id === user.id)
      throw new BadRequestException({ code: "RECIPIENT_INVALID" });
    const thread = await prisma.$transaction(async (tx) => {
      await this.quota(tx, user.id);
      const pair = [user.id, peer.id].sort().join(":") + ":" + topic;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`interaction-pair:${pair}`}))`;
      let existing = await tx.interactionThread.findFirst({
        where: {
          topic,
          status: { in: ["OPEN", "ACCEPTED"] },
          OR: [
            { initiatorId: user.id, recipientId: peer.id },
            { initiatorId: peer.id, recipientId: user.id },
          ],
        },
      });
      if (existing) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`interaction-thread:${existing.id}`}))`;
        existing = await tx.interactionThread.findUnique({
          where: { id: existing.id },
        });
      }
      if (existing && ["CLOSED", "DECLINED"].includes(existing.status))
        existing = null;
      const saved =
        existing ??
        (await tx.interactionThread.create({
          data: { initiatorId: user.id, recipientId: peer.id, topic },
        }));
      await this.append(tx, saved, user, text);
      return saved;
    });
    return { sent: true, threadId: thread.id };
  }
  private async append(
    tx: Prisma.TransactionClient,
    thread: {
      id: string;
      initiatorId: string;
      recipientId: string;
      topic: string;
    },
    user: CurrentUser,
    body: string,
  ) {
    const message = await tx.interactionMessage.create({
      data: { threadId: thread.id, authorId: user.id, body },
    });
    await tx.interactionThread.update({
      where: { id: thread.id },
      data: {
        updatedAt: message.createdAt,
        ...(thread.initiatorId === user.id
          ? { initiatorReadAt: message.createdAt }
          : { recipientReadAt: message.createdAt }),
      },
    });
    await tx.notification.create({
      data: {
        userId:
          thread.initiatorId === user.id
            ? thread.recipientId
            : thread.initiatorId,
        type: "MEMBER_MESSAGE",
        payload: {
          threadId: thread.id,
          topic: thread.topic,
          message: body,
          senderId: user.id,
          senderName: user.profile?.displayName ?? "Member",
          senderUsername: user.profile?.username ?? "",
        },
      },
    });
    return message;
  }
  async send(user: CurrentUser, id: string, body: unknown) {
    requireUuid(id);
    const text = boundedText(requiredString(asRecord(body), "body"), 5000);
    return prisma.$transaction(async (tx) => {
      await this.quota(tx, user.id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`interaction-thread:${id}`}))`;
      const thread = await tx.interactionThread.findFirst({
        where: { id, ...participant(user.id) },
        include: threadInclude,
      });
      if (!thread) throw new NotFoundException({ code: "THREAD_NOT_FOUND" });
      const peer =
        thread.initiatorId === user.id ? thread.recipient : thread.initiator;
      if (peer.status !== "ACTIVE" || !peer.profile || peer.profile.deletedAt)
        throw new ConflictException({ code: "RECIPIENT_INVALID" });
      if (["CLOSED", "DECLINED"].includes(thread.status))
        throw new ConflictException({ code: "THREAD_CLOSED" });
      return { message: await this.append(tx, thread, user, text) };
    });
  }
  async update(user: CurrentUser, id: string, body: unknown) {
    requireUuid(id);
    const action = optionalEnum(asRecord(body), "action", [
      "accept",
      "decline",
      "close",
    ] as const);
    if (!action) throw new BadRequestException({ code: "ACTION_REQUIRED" });
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`interaction-thread:${id}`}))`;
      const thread = await tx.interactionThread.findFirst({
        where: { id, ...participant(user.id) },
      });
      if (!thread) throw new NotFoundException({ code: "THREAD_NOT_FOUND" });
      if (["CLOSED", "DECLINED"].includes(thread.status))
        throw new ConflictException({ code: "THREAD_CLOSED" });
      if (
        action !== "close" &&
        (thread.topic === "MESSAGE" ||
          thread.recipientId !== user.id ||
          thread.status !== "OPEN")
      )
        throw new ConflictException({ code: "INVALID_STATUS_TRANSITION" });
      const status =
        action === "close"
          ? "CLOSED"
          : action === "accept"
            ? "ACCEPTED"
            : "DECLINED";
      const saved = await tx.interactionThread.update({
        where: { id },
        data: { status },
      });
      await tx.notification.create({
        data: {
          userId:
            thread.initiatorId === user.id
              ? thread.recipientId
              : thread.initiatorId,
          type: "INTERACTION_UPDATED",
          payload: { threadId: id, status },
        },
      });
      return { thread: { id: saved.id, status: saved.status } };
    });
  }
}
