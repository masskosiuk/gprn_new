import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@gprn/db";
import { S3ObjectStorage } from "@gprn/storage";
import { CommunityService } from "./community.service.js";
import { demoCommunityPosts } from "../scripts/demo-community-catalog.js";
import {
  demoBattleAuthors,
  demoExpertCovers,
  demoModelImages,
  demoStudioImages,
} from "@gprn/domain";
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
const missing = (error: unknown) =>
  (error as { getStatus(): number }).getStatus() === 404;
function sourceResolver() {
  return new CommunityService() as unknown as {
    source(
      type: string,
      id: string,
      locale: string,
    ): Promise<{
      sourceType: string;
      sourceId: string;
      sourcePath: string;
      coverAssetKey: string | null;
      sourceCoverUrl: string | null;
    }>;
  };
}

test("model and studio discussions use the same covers and IDs as their catalogs", async () => {
  const service = sourceResolver();
  for (const [type, directory, route] of [
    ["MODEL", demoModelImages, "models?model"],
    ["STUDIO", demoStudioImages, "studios?studio"],
  ] as const) {
    for (const [key, cover] of Object.entries(directory)) {
      const source = await service.source(type, key, "ru");
      assert.equal(source.sourceCoverUrl, cover);
      assert.equal(source.coverAssetKey, null);
      assert.equal(source.sourcePath, `/ru/${route}=${key}`);
      assert.equal(source.sourceType, type);
      assert.equal(source.sourceId, key);
    }
    for (const invalid of ["missing", "__proto__", "constructor", "toString"])
      await assert.rejects(service.source(type, invalid, "ru"), missing);
  }
});

test("challenge discussions accept catalog slugs and UUIDs and reject hidden sources", async () => {
  const find = prisma.challenge.findFirst;
  let visible = true;
  let query: unknown;
  prisma.challenge.findFirst = (async (args: unknown) => {
    query = args;
    return visible
      ? {
          id,
          slug: "cinema-without-budget",
          coverUrl: "https://images.invalid/challenge.jpg",
        }
      : null;
  }) as unknown as typeof find;
  try {
    const service = sourceResolver();
    for (const key of [id, "cinema-without-budget"]) {
      const source = await service.source("CHALLENGE", key, "en");
      assert.equal(
        source.sourcePath,
        "/en/challenges?challenge=cinema-without-budget",
      );
      assert.equal(
        source.sourceCoverUrl,
        "https://images.invalid/challenge.jpg",
      );
      const where = (query as { where: Record<string, unknown> }).where;
      assert.deepEqual(where.status, {
        in: ["UPCOMING", "ACTIVE", "COMPLETED"],
      });
      assert.equal(where[key === id ? "id" : "slug"], key);
    }
    visible = false;
    await assert.rejects(service.source("CHALLENGE", "hidden", "en"), missing);
  } finally {
    prisma.challenge.findFirst = find;
  }
});

test("battle discussion covers cannot expose private or unmoderated entries", async () => {
  const find = prisma.battle.findFirst;
  let visible = true;
  prisma.battle.findFirst = (async (query: {
    where: { id: string; OR: unknown[] };
    include: { entries: { where: unknown; take: number; orderBy: unknown } };
  }) => {
    assert.equal(query.where.id, id);
    const entry = {
      moderationStatus: "APPROVED",
      photo: {
        deletedAt: null,
        status: "PUBLISHED",
        moderationStatus: "APPROVED",
        visibility: "PUBLIC",
        owner: {
          status: "ACTIVE",
          profile: { visibility: "PUBLIC", deletedAt: null },
        },
      },
    };
    assert.deepEqual(query.include.entries.where, entry);
    assert.deepEqual(query.where.OR, [
      { status: { in: ["OPEN", "CLOSED"] } },
      { status: "DRAFT", entries: { some: entry, every: entry } },
    ]);
    assert.equal(query.include.entries.take, 1);
    assert.deepEqual(query.include.entries.orderBy, { slot: "asc" });
    return visible
      ? {
          entries: [
            {
              photo: {
                assets: [
                  {
                    type: "ORIGINAL",
                    contentType: "image/jpeg",
                    storageKey: "private/original.jpg",
                  },
                  {
                    type: "THUMBNAIL",
                    contentType: "image/webp",
                    storageKey: "battle/preview.webp",
                  },
                ],
              },
            },
          ],
        }
      : null;
  }) as unknown as typeof find;
  try {
    const service = sourceResolver();
    const source = await service.source("BATTLE", id, "ru");
    assert.equal(source.coverAssetKey, "battle/preview.webp");
    assert.equal(source.sourcePath, "/ru/battles?battle=" + id);
    visible = false;
    await assert.rejects(service.source("BATTLE", id, "ru"), missing);
    await assert.rejects(service.source("BATTLE", "not-a-uuid", "ru"));
  } finally {
    prisma.battle.findFirst = find;
  }
});

test("master discussion sources preserve real usernames and require a public active profile", async () => {
  const find = prisma.profile.findFirst;
  let visible = true;
  prisma.profile.findFirst = (async (args: { where: { username: string } }) => {
    assert.deepEqual(args.where, {
      username: "iryna",
      visibility: "PUBLIC",
      deletedAt: null,
      user: { status: "ACTIVE" },
    });
    return visible
      ? {
          username: "iryna",
          coverAssetKey: null,
          avatarAssetKey: "profile/avatar.webp",
        }
      : null;
  }) as unknown as typeof find;
  try {
    const service = sourceResolver();
    const source = await service.source("PROFILE", "iryna", "ru");
    assert.equal(source.sourcePath, "/ru/profile?author=iryna");
    assert.equal(source.coverAssetKey, "profile/avatar.webp");
    visible = false;
    await assert.rejects(service.source("PROFILE", "iryna", "ru"), missing);
  } finally {
    prisma.profile.findFirst = find;
  }
});

test("demo expert discussions retain catalog covers when no profile image is stored", async () => {
  const find = prisma.profile.findFirst;
  prisma.profile.findFirst = (async (args: {
    where: { username: string };
  }) => ({
    username: args.where.username,
    coverAssetKey: null,
    avatarAssetKey: null,
  })) as unknown as typeof find;
  try {
    const service = sourceResolver();
    for (const [username, cover] of Object.entries(demoExpertCovers)) {
      const source = await service.source("PROFILE", username, "ru");
      assert.equal(source.sourceCoverUrl, cover);
      assert.equal(source.sourcePath, "/ru/profile?author=" + username);
    }
    assert.equal(
      (await service.source("PROFILE", "another.author", "ru")).sourceCoverUrl,
      null,
    );
  } finally {
    prisma.profile.findFirst = find;
  }
});

test("a discussion of another post preserves an inherited source cover", async () => {
  const find = prisma.communityPost.findUniqueOrThrow;
  prisma.communityPost.findUniqueOrThrow = (async () => ({
    coverAssetKey: null,
    sourceCoverUrl: demoModelImages.aiko,
  })) as unknown as typeof find;
  try {
    const service = sourceResolver() as ReturnType<typeof sourceResolver> & {
      one(id: string): Promise<{ post: { kind: string } }>;
    };
    service.one = async () => ({ post: { kind: "DISCUSSION" } });
    const source = await service.source("POST", id, "ru");
    assert.equal(source.sourceCoverUrl, demoModelImages.aiko);
    assert.equal(source.sourcePath, "/ru/discussions?post=" + id);
  } finally {
    prisma.communityPost.findUniqueOrThrow = find;
  }
});

test("card discussions persist their server-resolved source and remain pending moderation", async () => {
  const profile = prisma.profile.findUnique;
  const find = prisma.communityPost.findFirst;
  const count = prisma.communityPost.count;
  const transaction = prisma.$transaction;
  const create = prisma.communityPost.create;
  prisma.profile.findUnique = (async () => ({
    proUntil: null,
  })) as unknown as typeof profile;
  prisma.communityPost.findFirst = (async () => null) as typeof find;
  prisma.communityPost.count = (async () => 0) as typeof count;
  prisma.communityPost.create = (async ({
    data,
  }: {
    data: Record<string, unknown>;
  }) => {
    assert.equal(data.sourceType, "MODEL");
    assert.equal(data.sourceId, "aiko");
    assert.equal(data.sourceCoverUrl, demoModelImages.aiko);
    assert.equal(data.sourcePath, "/ru/models?model=aiko");
    assert.equal(data.authorId, actor.id);
    assert.equal(data.body, "Question about this portfolio");
    assert.equal("moderationStatus" in data, false);
    return {
      ...data,
      moderationStatus: "PENDING",
      author: { profile: actor.profile },
      _count: { comments: 0 },
      createdAt: new Date(),
    };
  }) as unknown as typeof create;
  prisma.$transaction = (async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      profile: prisma.profile,
      communityPost: prisma.communityPost,
      $executeRaw: async () => 1,
    })) as unknown as typeof transaction;
  try {
    const { post } = await new CommunityService().create(actor, {
      kind: "DISCUSSION",
      title: "Portfolio discussion",
      body: "Question about this portfolio",
      language: "ru",
      locale: "ru",
      location: "Tokyo",
      startsAt: new Date().toISOString(),
      sourceType: "MODEL",
      sourceId: "aiko",
      coverDataUrl: "invalid-client-cover",
      sourceCoverUrl: "https://untrusted.invalid/cover.jpg",
      sourcePath: "https://untrusted.invalid",
    });
    assert.equal(post.status, "PENDING");
    assert.equal(post.coverUrl, demoModelImages.aiko);
  } finally {
    prisma.profile.findUnique = profile;
    prisma.communityPost.findFirst = find;
    prisma.communityPost.count = count;
    prisma.communityPost.create = create;
    prisma.$transaction = transaction;
  }
});

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
