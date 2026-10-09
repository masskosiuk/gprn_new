import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@gprn/db";
import { S3ObjectStorage } from "@gprn/storage";
import { CommunityService } from "./community.service.js";
import { demoCommunityPosts } from "../scripts/demo-community-catalog.js";
import { demoBattleAuthors } from "@gprn/domain";
import type { CurrentUser } from "./auth.service.js";

Object.assign(process.env, {
  NODE_ENV: "test",
  APP_ENV: "local",
  APP_URL: "https://site.invalid",
  API_URL: "https://api.invalid",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  REDIS_URL: "redis://127.0.0.1:1",
  S3_ENDPOINT: "https://storage.invalid",
  S3_REGION: "test",
  S3_ACCESS_KEY: "test",
  S3_SECRET_KEY: "test",
  S3_BUCKET_PUBLIC: "public",
  S3_BUCKET_PRIVATE: "private",
  ENCRYPTION_KEY: "test",
  SESSION_SECRET: "test",
});
const id = "de000002-0000-4000-8000-000000000001";
const actor = {
  id,
  roles: [],
  profile: { username: "reader", tier: "STAR" },
} as unknown as CurrentUser;
const forbidden = (error: unknown) =>
  (error as { getStatus(): number }).getStatus() === 403;

test("home highlights contain only public approved posts in newest-publication order", async () => {
  const find = prisma.communityPost.findMany;
  const kinds: string[] = [];
  prisma.communityPost.findMany = (async (query: {
    where: {
      kind: string;
      deletedAt: unknown;
      moderationStatus: string;
      author: unknown;
    };
    take: number;
    orderBy: unknown;
  }) => {
    kinds.push(query.where.kind);
    assert.equal(query.take, 3);
    assert.equal(query.where.deletedAt, null);
    assert.equal(query.where.moderationStatus, "APPROVED");
    assert.match(JSON.stringify(query.where.author), /PUBLIC/);
    assert.deepEqual(query.orderBy, [{ createdAt: "desc" }, { id: "asc" }]);
    return [];
  }) as unknown as typeof find;
  try {
    const result = await new CommunityService().highlights();
    assert.deepEqual(kinds, ["DISCUSSION", "CASTING", "EVENT"]);
    assert.deepEqual(result.groups, { DISCUSSION: [], CASTING: [], EVENT: [] });
  } finally {
    prisma.communityPost.findMany = find;
  }
});

test("translation cannot expose a comment on a hidden or removed material", async () => {
  const find = prisma.comment.findFirst;
  const photo = prisma.photo.findFirst;
  prisma.comment.findFirst = (async () => ({
    body: "Private text",
    photoId: id,
    postId: null,
  })) as unknown as typeof find;
  prisma.photo.findFirst = (async () => null) as typeof photo;
  try {
    await assert.rejects(
      new CommunityService().translateComment(id, { language: "en" }),
      (error: unknown) =>
        (error as { getStatus(): number }).getStatus() === 404,
    );
  } finally {
    prisma.comment.findFirst = find;
    prisma.photo.findFirst = photo;
  }
});

test("translation reads the stored comment, never arbitrary client text", async () => {
  const find = prisma.comment.findFirst;
  const photo = prisma.photo.findFirst;
  prisma.comment.findFirst = (async () => ({
    body: "Stored text",
    photoId: id,
    postId: null,
  })) as unknown as typeof find;
  prisma.photo.findFirst = (async () => ({ id })) as typeof photo;
  const service = new CommunityService();
  (
    service as unknown as {
      translator: {
        translate(text: string, language: string): Promise<{ text: string }>;
      };
    }
  ).translator.translate = async (text, language) => {
    assert.equal(text, "Stored text");
    assert.equal(language, "fr");
    return { text: "Texte stocké" };
  };
  try {
    assert.deepEqual(
      await service.translateComment(id, {
        language: "fr",
        text: "Injected text",
      }),
      { text: "Texte stocké" },
    );
  } finally {
    prisma.comment.findFirst = find;
    prisma.photo.findFirst = photo;
  }
});

test("community demo catalog contains every requested topic and only reserved masters", () => {
  assert.equal(demoCommunityPosts.length, 14);
  assert.equal(new Set(demoCommunityPosts.map((entry) => entry.key)).size, 14);
  for (const [kind, count] of [
    ["EVENT", 6],
    ["DISCUSSION", 4],
    ["CASTING", 4],
  ] as const)
    assert.equal(
      demoCommunityPosts.filter((entry) => entry.kind === kind).length,
      count,
    );
  for (const entry of demoCommunityPosts) {
    assert(demoBattleAuthors.some((author) => author.key === entry.author));
    assert.match(entry.body, /Демо/);
    if ("sourceId" in entry) assert.match(entry.sourceId, /^de[0-9a-f-]+$/);
    else assert.equal(new URL(entry.cover).hostname, "images.unsplash.com");
  }
});

test("inquiry quota is checked before processing or uploading an attachment", async () => {
  const count = prisma.communityInquiry.count;
  const put = S3ObjectStorage.prototype.putObject;
  let uploads = 0;
  prisma.communityInquiry.count = (async () => 20) as typeof count;
  S3ObjectStorage.prototype.putObject = async () => {
    uploads++;
  };
  try {
    await assert.rejects(
      new CommunityService().inquire(actor, {
        kind: "SUGGESTION",
        body: "Suggestion",
        imageDataUrl: "invalid",
      }),
      (error: unknown) =>
        (error as { getStatus(): number }).getStatus() === 429,
    );
    assert.equal(uploads, 0);
  } finally {
    prisma.communityInquiry.count = count;
    S3ObjectStorage.prototype.putObject = put;
  }
});
test("private inquiry images cannot be read by another member", async () => {
  const old = prisma.communityInquiry.findUnique;
  const read = S3ObjectStorage.prototype.readObject;
  let reads = 0;
  prisma.communityInquiry.findUnique = (async () => ({
    authorId: "other",
    attachmentKey: "private/attachment.webp",
  })) as unknown as typeof old;
  S3ObjectStorage.prototype.readObject = async () => {
    reads++;
    return Buffer.alloc(0);
  };
  try {
    await assert.rejects(
      new CommunityService().inquiryImage(actor, id),
      forbidden,
    );
    assert.equal(reads, 0);
  } finally {
    prisma.communityInquiry.findUnique = old;
    S3ObjectStorage.prototype.readObject = read;
  }
});
test("moderation, administrative replies and Pro grants require permissions", async () => {
  const service = new CommunityService();
  await assert.rejects(service.moderation(actor), forbidden);
  await assert.rejects(service.inquiries(actor, true), forbidden);
  await assert.rejects(service.reply(actor, id, { reply: "fake" }), forbidden);
  await assert.rejects(
    service.setPro(actor, id, { proUntil: "2099-01-01" }),
    forbidden,
  );
});
test("comment pagination orders by current author rank before recency", async () => {
  const photo = prisma.photo.findFirst;
  const find = prisma.comment.findMany;
  const count = prisma.comment.count;
  let options: unknown;
  prisma.photo.findFirst = (async (args: unknown) => {
    assert.match(JSON.stringify(args), /APPROVED/);
    assert.match(JSON.stringify(args), /PUBLIC/);
    return { id };
  }) as typeof photo;
  prisma.comment.findMany = (async (args: unknown) => {
    options = args;
    return [];
  }) as typeof find;
  prisma.comment.count = (async () => 0) as typeof count;
  try {
    await new CommunityService().comments("PHOTO", id, "2");
    const query = options as { skip: number; take: number; orderBy: unknown[] };
    assert.equal(query.skip, 30);
    assert.equal(query.take, 30);
    assert.deepEqual(query.orderBy[0], { user: { profile: { tier: "desc" } } });
  } finally {
    prisma.photo.findFirst = photo;
    prisma.comment.findMany = find;
    prisma.comment.count = count;
  }
});
test("a discussion copies the public original's image and canonical link", async () => {
  const old = prisma.photo.findFirst;
  prisma.photo.findFirst = (async () => ({
    assets: [
      {
        type: "THUMBNAIL",
        contentType: "image/webp",
        storageKey: "original/preview.webp",
      },
    ],
    owner: { profile: { username: "demo.author" } },
  })) as unknown as typeof old;
  try {
    const service = new CommunityService() as unknown as {
      source(
        type: string,
        id: string,
        locale: string,
      ): Promise<{ coverAssetKey: string; sourcePath: string }>;
    };
    const source = await service.source("PHOTO", id, "ru");
    assert.equal(source.coverAssetKey, "original/preview.webp");
    assert.equal(
      source.sourcePath,
      "/ru/profile?author=demo.author&photo=" + id,
    );
  } finally {
    prisma.photo.findFirst = old;
  }
});
test("cooldown checks include removed and rejected posts", async () => {
  const profile = prisma.profile.findUnique;
  const find = prisma.communityPost.findFirst;
  const put = S3ObjectStorage.prototype.putObject;
  let uploads = 0;
  prisma.profile.findUnique = (async () => ({
    proUntil: null,
  })) as unknown as typeof profile;
  prisma.communityPost.findFirst = (async (args: {
    where: Record<string, unknown>;
  }) => {
    assert.equal("deletedAt" in args.where, false);
    assert.equal("moderationStatus" in args.where, false);
    return { createdAt: new Date() };
  }) as unknown as typeof find;
  S3ObjectStorage.prototype.putObject = async () => {
    uploads++;
  };
  try {
    await assert.rejects(
      new CommunityService().create(actor, {
        kind: "DISCUSSION",
        title: "Title",
        body: "Body",
        language: "en",
        location: "Paris",
        startsAt: new Date().toISOString(),
        coverDataUrl: "invalid",
      }),
      (error: unknown) =>
        (error as { getStatus(): number }).getStatus() === 429,
    );
    assert.equal(uploads, 0);
  } finally {
    prisma.profile.findUnique = profile;
    prisma.communityPost.findFirst = find;
    S3ObjectStorage.prototype.putObject = put;
  }
});
