import { randomUUID } from "node:crypto";
import { loadRuntimeEnv } from "@gprn/config";
import { prisma, type Prisma } from "@gprn/db";
import { S3ObjectStorage } from "@gprn/storage";
import {
  demoExpertCovers,
  demoModelImages,
  demoStudioImages,
} from "@gprn/domain";
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CurrentUser } from "./auth.service.js";
import { requirePermission, userHasPermission } from "./authorization.js";
import {
  asRecord,
  optionalEnum,
  optionalString,
  requiredString,
} from "./validation.js";
import { publicAssetUrl } from "./serialization.js";
import {
  CommentTranslator,
  translationLanguage,
} from "./comment-translation.js";
import {
  createProductCover,
  decodeProductUpload,
} from "./digital-product-assets.js";
import {
  boundedText,
  checkPublicationAccess,
  communityKind,
  parseCommunityPost,
  parseInquiry,
  requireUuid,
} from "./community-policy.js";

const authorInclude = { profile: true } as const;
const postInclude = {
  author: { include: authorInclude },
  _count: { select: { comments: { where: { deletedAt: null } } } },
} as const;
type Post = Prisma.CommunityPostGetPayload<{ include: typeof postInclude }>;
const visibleAuthor = {
  status: "ACTIVE" as const,
  profile: { visibility: "PUBLIC" as const, deletedAt: null },
};

@Injectable()
export class CommunityService {
  private readonly env = loadRuntimeEnv();
  private readonly translator = new CommentTranslator({
    apiKey: this.env.GOOGLE_TRANSLATION_API_KEY,
    dailyCharacterLimit: this.env.TRANSLATION_DAILY_CHARACTER_LIMIT,
  });
  private readonly storage = new S3ObjectStorage({
    accessKeyId: this.env.S3_ACCESS_KEY,
    secretAccessKey: this.env.S3_SECRET_KEY,
    endpoint: this.env.S3_ENDPOINT,
    region: this.env.S3_REGION,
    forcePathStyle: this.env.S3_FORCE_PATH_STYLE,
  });

  private serialize(post: Post) {
    return {
      id: post.id,
      kind: post.kind,
      title: post.title,
      body: post.body,
      location: post.location,
      language: post.language,
      startsAt: post.startsAt.toISOString(),
      endsAt: post.endsAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
      status: post.moderationStatus,
      moderationReason: post.moderationReason,
      isDemo: Boolean(post.demoKey),
      coverUrl: post.coverAssetKey
        ? publicAssetUrl(this.env, post.coverAssetKey)
        : (post.sourceCoverUrl ?? null),
      commentCount: post._count.comments,
      author: {
        id: post.authorId,
        username: post.author.profile?.username,
        displayName: post.author.profile?.displayName ?? "Author",
        tier: post.author.profile?.tier ?? "VIEWER",
      },
      sourceType: post.sourceType,
      sourceId: post.sourceId,
      sourcePath: post.sourcePath,
    };
  }

  async one(id: string) {
    requireUuid(id);
    const post = await prisma.communityPost.findFirst({
      where: {
        id,
        deletedAt: null,
        moderationStatus: "APPROVED",
        author: visibleAuthor,
      },
      include: postInclude,
    });
    if (!post) throw new NotFoundException({ code: "POST_NOT_FOUND" });
    return { post: this.serialize(post) };
  }

  private async source(
    type: string | undefined,
    id: string | undefined,
    locale: string,
  ) {
    if (!type && !id) return {};
    if (!type || !id) throw new BadRequestException({ code: "SOURCE_INVALID" });
    let sourcePath: string;
    let coverAssetKey: string | null = null;
    let sourceCoverUrl: string | null = null;
    if (type === "PHOTO") {
      requireUuid(id);
      const photo = await prisma.photo.findFirst({
        where: {
          id,
          deletedAt: null,
          status: "PUBLISHED",
          moderationStatus: "APPROVED",
          visibility: "PUBLIC",
          owner: visibleAuthor,
        },
        include: { assets: true, owner: { include: { profile: true } } },
      });
      if (!photo) throw new NotFoundException({ code: "SOURCE_NOT_FOUND" });
      coverAssetKey =
        photo.assets.find(
          (asset) =>
            asset.contentType.startsWith("image/") &&
            asset.type === "THUMBNAIL",
        )?.storageKey ??
        photo.assets.find(
          (asset) =>
            asset.contentType.startsWith("image/") && asset.type === "DISPLAY",
        )?.storageKey ??
        null;
      sourcePath = `/${locale}/profile?author=${encodeURIComponent(photo.owner.profile!.username)}&photo=${id}`;
    } else if (type === "POST") {
      const { post } = await this.one(id);
      const original = await prisma.communityPost.findUniqueOrThrow({
        where: { id },
      });
      coverAssetKey = original.coverAssetKey;
      sourceCoverUrl = original.sourceCoverUrl;
      sourcePath = `/${locale}/${post.kind === "EVENT" ? "events" : post.kind === "CASTING" ? "search" : "discussions"}?post=${id}`;
    } else if (type === "MODEL" || type === "STUDIO") {
      const directory: Readonly<Record<string, string>> =
        type === "MODEL" ? demoModelImages : demoStudioImages;
      if (!Object.hasOwn(directory, id))
        throw new NotFoundException({ code: "SOURCE_NOT_FOUND" });
      sourceCoverUrl = directory[id] ?? null;
      sourcePath = `/${locale}/${type === "MODEL" ? "models?model" : "studios?studio"}=${encodeURIComponent(id)}`;
    } else if (type === "CHALLENGE") {
      const challenge = await prisma.challenge.findFirst({
        where: {
          ...(/^[0-9a-f-]{36}$/i.test(id)
            ? { id: requireUuid(id) }
            : { slug: id }),
          status: { in: ["UPCOMING", "ACTIVE", "COMPLETED"] },
        },
      });
      if (!challenge) throw new NotFoundException({ code: "SOURCE_NOT_FOUND" });
      sourceCoverUrl = challenge.coverUrl;
      sourcePath = `/${locale}/challenges?challenge=${encodeURIComponent(challenge.slug || challenge.id)}`;
    } else if (type === "BATTLE") {
      requireUuid(id);
      const approvedEntry = {
        moderationStatus: "APPROVED" as const,
        photo: {
          deletedAt: null,
          status: "PUBLISHED" as const,
          moderationStatus: "APPROVED" as const,
          visibility: "PUBLIC" as const,
          owner: visibleAuthor,
        },
      };
      const battle = await prisma.battle.findFirst({
        where: {
          id,
          OR: [
            { status: { in: ["OPEN", "CLOSED"] } },
            {
              status: "DRAFT",
              entries: { some: approvedEntry, every: approvedEntry },
            },
          ],
        },
        include: {
          entries: {
            where: approvedEntry,
            orderBy: { slot: "asc" },
            take: 1,
            include: { photo: { include: { assets: true } } },
          },
        },
      });
      if (!battle) throw new NotFoundException({ code: "SOURCE_NOT_FOUND" });
      const assets = battle.entries[0]?.photo.assets ?? [];
      coverAssetKey =
        assets.find(
          (asset) =>
            asset.contentType.startsWith("image/") &&
            asset.type === "THUMBNAIL",
        )?.storageKey ??
        assets.find(
          (asset) =>
            asset.contentType.startsWith("image/") && asset.type === "DISPLAY",
        )?.storageKey ??
        null;
      sourcePath = `/${locale}/battles?battle=${id}`;
    } else if (type === "PROFILE") {
      const profile = await prisma.profile.findFirst({
        where: {
          username: id,
          visibility: "PUBLIC",
          deletedAt: null,
          user: { status: "ACTIVE" },
        },
      });
      if (!profile) throw new NotFoundException({ code: "SOURCE_NOT_FOUND" });
      coverAssetKey = profile.coverAssetKey ?? profile.avatarAssetKey;
      if (!coverAssetKey && Object.hasOwn(demoExpertCovers, profile.username))
        sourceCoverUrl =
          demoExpertCovers[profile.username as keyof typeof demoExpertCovers];
      sourcePath = `/${locale}/profile?author=${encodeURIComponent(profile.username)}`;
    } else if (type === "PRODUCT") {
      requireUuid(id);
      const product = await prisma.marketplaceProduct.findFirst({
        where: {
          id,
          status: "PUBLISHED",
          seller: { status: "ACTIVE", user: visibleAuthor },
        },
        include: {
          seller: { include: { user: { include: { profile: true } } } },
          photo: true,
        },
      });
      if (!product) throw new NotFoundException({ code: "SOURCE_NOT_FOUND" });
      if (
        product.digitalKind === "LUT"
          ? !product.seller.user.profile?.lutSalesEnabled
          : product.digitalKind === "PRESET"
            ? !product.seller.user.profile?.presetSalesEnabled
            : !product.photo ||
              product.photo.deletedAt ||
              product.photo.visibility !== "PUBLIC" ||
              product.photo.status !== "PUBLISHED" ||
              product.photo.moderationStatus !== "APPROVED"
      )
        throw new NotFoundException({ code: "SOURCE_NOT_FOUND" });
      coverAssetKey = product.previewAssetKey;
      sourcePath = `/${locale}/marketplace?product=${id}`;
    } else {
      throw new BadRequestException({ code: "SOURCE_INVALID" });
    }
    if (sourceCoverUrl && !/^(?:https?:\/\/|\/(?!\/))/.test(sourceCoverUrl))
      sourceCoverUrl = null;
    return {
      sourceType: type,
      sourceId: id,
      sourcePath,
      coverAssetKey,
      sourceCoverUrl,
    };
  }

  async list(query: Record<string, string | undefined>) {
    const kind = communityKind(query.kind);
    const page = Number(query.page ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 10000)
      throw new BadRequestException({ code: "INVALID_PAGE" });
    const date = (value?: string) => {
      if (!value) return undefined;
      const parsed = new Date(value);
      if (!Number.isFinite(parsed.getTime()))
        throw new BadRequestException({ code: "COMMUNITY_DATES_INVALID" });
      return parsed;
    };
    const base = {
      kind,
      deletedAt: null,
      moderationStatus: "APPROVED" as const,
      author: visibleAuthor,
    };
    const where: Prisma.CommunityPostWhereInput = {
      ...base,
      startsAt: { gte: date(query.from), lte: date(query.to) },
      language: query.language ? boundedText(query.language, 10) : undefined,
      location: query.location
        ? { contains: boundedText(query.location, 180), mode: "insensitive" }
        : undefined,
      ...(query.search
        ? {
            OR: ["title", "body"].map((field) => ({
              [field]: {
                contains: boundedText(query.search!, 180),
                mode: "insensitive",
              },
            })),
          }
        : {}),
    };
    const [posts, total, locations, languages] = await Promise.all([
      prisma.communityPost.findMany({
        where,
        include: postInclude,
        orderBy: [{ startsAt: "desc" }, { id: "asc" }],
        take: 24,
        skip: (page - 1) * 24,
      }),
      prisma.communityPost.count({ where }),
      prisma.communityPost.groupBy({
        by: ["location"],
        where: base,
        take: 100,
        orderBy: { location: "asc" },
      }),
      prisma.communityPost.groupBy({
        by: ["language"],
        where: base,
        take: 100,
        orderBy: { language: "asc" },
      }),
    ]);
    return {
      posts: posts.map((post) => this.serialize(post)),
      total,
      page,
      locations: locations.map((item) => item.location),
      languages: languages.map((item) => item.language),
    };
  }

  async highlights() {
    const kinds = ["DISCUSSION", "CASTING", "EVENT"] as const;
    const groups = await Promise.all(
      kinds.map(async (kind) => {
        const posts = await prisma.communityPost.findMany({
          where: {
            kind,
            deletedAt: null,
            moderationStatus: "APPROVED",
            author: visibleAuthor,
          },
          include: postInclude,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: 3,
        });
        return [kind, posts.map((post) => this.serialize(post))] as const;
      }),
    );
    return { groups: Object.fromEntries(groups) };
  }

  async mine(user: CurrentUser) {
    const [posts, profile, recent] = await Promise.all([
      prisma.communityPost.findMany({
        where: { authorId: user.id, deletedAt: null },
        include: postInclude,
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.profile.findUnique({
        where: { userId: user.id },
        select: { proUntil: true },
      }),
      prisma.communityPost.findMany({
        where: { authorId: user.id, kind: { in: ["DISCUSSION", "CASTING"] } },
        orderBy: { createdAt: "desc" },
        distinct: ["kind"],
        take: 2,
        select: { kind: true, createdAt: true },
      }),
    ]);
    return {
      posts: posts.map((post) => this.serialize(post)),
      isPro: Boolean(profile?.proUntil && profile.proUntil > new Date()),
      proUntil: profile?.proUntil?.toISOString() ?? null,
      recent,
    };
  }

  async create(user: CurrentUser, body: unknown) {
    const { coverDataUrl, sourceType, sourceId, locale, ...input } =
      parseCommunityPost(body);
    if ((sourceType || sourceId) && input.kind !== "DISCUSSION")
      throw new BadRequestException({ code: "SOURCE_INVALID" });
    const profile = await prisma.profile.findUnique({
      where: { userId: user.id },
      select: { proUntil: true },
    });
    const last = await prisma.communityPost.findFirst({
      where: { authorId: user.id, kind: input.kind },
      orderBy: { createdAt: "desc" },
    });
    checkPublicationAccess(input.kind, profile?.proUntil, last?.createdAt);
    if (
      (await prisma.communityPost.count({
        where: {
          authorId: user.id,
          createdAt: { gte: new Date(Date.now() - 60000) },
        },
      })) >= 5
    )
      throw new HttpException({ code: "RATE_LIMITED" }, 429);
    const source = await this.source(sourceType, sourceId, locale);
    const id = randomUUID();
    const key =
      coverDataUrl && !sourceType
        ? `community/${user.id}/${id}.webp`
        : undefined;
    if (key) {
      const cover = await createProductCover(
        decodeProductUpload(coverDataUrl, 5 * 1024 * 1024),
      );
      await this.storage.putObject({
        bucket: this.env.S3_BUCKET_PUBLIC,
        key,
        body: cover.buffer,
        contentType: "image/webp",
      });
    }
    try {
      const post = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`community:${user.id}`}))`;
        const profile = await tx.profile.findUnique({
          where: { userId: user.id },
          select: { proUntil: true },
        });
        const last = await tx.communityPost.findFirst({
          where: { authorId: user.id, kind: input.kind },
          orderBy: { createdAt: "desc" },
        });
        checkPublicationAccess(input.kind, profile?.proUntil, last?.createdAt);
        if (
          (await tx.communityPost.count({
            where: {
              authorId: user.id,
              createdAt: { gte: new Date(Date.now() - 60000) },
            },
          })) >= 5
        )
          throw new HttpException({ code: "RATE_LIMITED" }, 429);
        return tx.communityPost.create({
          data: {
            id,
            ...input,
            ...source,
            authorId: user.id,
            ...(key ? { coverAssetKey: key } : {}),
          },
          include: postInclude,
        });
      });
      return { post: this.serialize(post) };
    } catch (error) {
      if (key)
        await this.storage
          .deleteObject(this.env.S3_BUCKET_PUBLIC, key)
          .catch(() => undefined);
      throw error;
    }
  }

  async remove(user: CurrentUser, id: string) {
    requireUuid(id);
    const post = await prisma.communityPost.findUnique({ where: { id } });
    if (!post || post.deletedAt)
      throw new NotFoundException({ code: "POST_NOT_FOUND" });
    if (
      post.authorId !== user.id &&
      !userHasPermission(user, "report:moderate")
    )
      throw new ForbiddenException();
    await prisma.communityPost.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { removed: true };
  }

  async moderation(user: CurrentUser) {
    requirePermission(user, "report:moderate");
    const posts = await prisma.communityPost.findMany({
      where: {
        deletedAt: null,
        moderationStatus: { in: ["PENDING", "UNDER_REVIEW"] },
      },
      include: postInclude,
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return { posts: posts.map((post) => this.serialize(post)) };
  }

  async moderate(user: CurrentUser, id: string, body: unknown) {
    requirePermission(user, "report:moderate");
    requireUuid(id);
    const record = asRecord(body);
    const status = optionalEnum(record, "status", [
      "APPROVED",
      "REJECTED",
      "UNDER_REVIEW",
    ] as const);
    const reason = optionalString(record, "reason");
    if (!status || (status === "REJECTED" && !reason))
      throw new BadRequestException({ code: "MODERATION_REASON_REQUIRED" });
    const post = await prisma.$transaction(async (tx) => {
      const prior = await tx.communityPost.findUnique({ where: { id } });
      if (!prior || prior.deletedAt)
        throw new NotFoundException({ code: "POST_NOT_FOUND" });
      const saved = await tx.communityPost.update({
        where: { id },
        data: {
          moderationStatus: status,
          moderationReason: reason ? boundedText(reason, 2000) : null,
        },
        include: postInclude,
      });
      await tx.notification.create({
        data: {
          userId: saved.authorId,
          type: "COMMUNITY_MODERATION",
          payload: {
            postId: id,
            title: saved.title,
            status,
            reason: reason ?? null,
            kind: saved.kind,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "community.moderated",
          targetType: "community_post",
          targetId: id,
          previous: { status: prior.moderationStatus },
          next: { status },
          reason,
        },
      });
      return saved;
    });
    return { post: this.serialize(post) };
  }

  async inquiries(user: CurrentUser, admin = false, kind?: string) {
    if (admin) requirePermission(user, "report:moderate");
    const inquiries = await prisma.communityInquiry.findMany({
      where: {
        ...(admin ? {} : { authorId: user.id }),
        ...(kind ? { kind } : {}),
      },
      include: {
        author: {
          select: {
            email: true,
            profile: { select: { displayName: true, username: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return {
      inquiries: inquiries.map(({ attachmentKey, ...item }) => ({
        ...item,
        imageUrl: attachmentKey
          ? `/api/v1/community/inquiries/${item.id}/image`
          : null,
      })),
    };
  }

  async inquire(user: CurrentUser, body: unknown) {
    const { imageDataUrl, ...input } = parseInquiry(body);
    if (
      (await prisma.communityInquiry.count({
        where: {
          authorId: user.id,
          createdAt: { gte: new Date(Date.now() - 3600000) },
        },
      })) >= 20
    )
      throw new HttpException({ code: "RATE_LIMITED" }, 429);
    const id = randomUUID();
    const key = imageDataUrl
      ? `community/inquiries/${user.id}/${id}.webp`
      : undefined;
    if (key) {
      const cover = await createProductCover(
        decodeProductUpload(imageDataUrl, 5 * 1024 * 1024),
      );
      await this.storage.putObject({
        bucket: this.env.S3_BUCKET_PRIVATE,
        key,
        body: cover.buffer,
        contentType: "image/webp",
      });
    }
    try {
      const inquiry = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`inquiry:${user.id}`}))`;
        if (
          (await tx.communityInquiry.count({
            where: {
              authorId: user.id,
              createdAt: { gte: new Date(Date.now() - 3600000) },
            },
          })) >= 20
        )
          throw new HttpException({ code: "RATE_LIMITED" }, 429);
        return tx.communityInquiry.create({
          data: { id, ...input, authorId: user.id, attachmentKey: key },
        });
      });
      return { inquiry: { id: inquiry.id, status: inquiry.status } };
    } catch (error) {
      if (key)
        await this.storage
          .deleteObject(this.env.S3_BUCKET_PRIVATE, key)
          .catch(() => undefined);
      throw error;
    }
  }

  async inquiryImage(user: CurrentUser, id: string) {
    requireUuid(id);
    const inquiry = await prisma.communityInquiry.findUnique({ where: { id } });
    if (!inquiry || !inquiry.attachmentKey) throw new NotFoundException();
    if (
      inquiry.authorId !== user.id &&
      !userHasPermission(user, "report:moderate")
    )
      throw new ForbiddenException();
    return this.storage.readObject(
      this.env.S3_BUCKET_PRIVATE,
      inquiry.attachmentKey,
      5 * 1024 * 1024,
    );
  }

  async reply(user: CurrentUser, id: string, body: unknown) {
    requirePermission(user, "report:moderate");
    requireUuid(id);
    const record = asRecord(body);
    const reply = optionalString(record, "reply");
    const status = optionalEnum(record, "status", [
      "OPEN",
      "UNDER_REVIEW",
      "RESOLVED",
      "DISMISSED",
    ] as const);
    const inquiry = await prisma.$transaction(async (tx) => {
      const prior = await tx.communityInquiry.findUnique({ where: { id } });
      if (!prior) throw new NotFoundException();
      const saved = await tx.communityInquiry.update({
        where: { id },
        data: {
          ...(reply ? { reply: boundedText(reply, 10000) } : {}),
          status,
        },
      });
      if (reply && reply !== prior.reply)
        await tx.notification.create({
          data: {
            userId: saved.authorId,
            type: "COMMUNITY_REPLY",
            payload: { inquiryId: id, message: reply, kind: saved.kind },
          },
        });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "community.inquiry_updated",
          targetType: "community_inquiry",
          targetId: id,
          next: { status: saved.status },
        },
      });
      return saved;
    });
    return { inquiry: { id: inquiry.id, status: inquiry.status } };
  }

  private async commentTarget(kind: string, id: string) {
    requireUuid(id);
    if (kind === "PHOTO") {
      const photo = await prisma.photo.findFirst({
        where: {
          id,
          deletedAt: null,
          status: "PUBLISHED",
          moderationStatus: "APPROVED",
          visibility: "PUBLIC",
          owner: visibleAuthor,
        },
      });
      if (!photo) throw new NotFoundException({ code: "PHOTO_NOT_FOUND" });
      return { photoId: id };
    }
    if (kind !== "POST")
      throw new BadRequestException({ code: "COMMENT_TARGET_INVALID" });
    const post = await prisma.communityPost.findFirst({
      where: {
        id,
        deletedAt: null,
        moderationStatus: "APPROVED",
        author: visibleAuthor,
      },
    });
    if (!post) throw new NotFoundException({ code: "POST_NOT_FOUND" });
    return { postId: id };
  }

  async comments(kind: string, id: string, pageValue = "1") {
    const target = await this.commentTarget(kind, id);
    const page = Number(pageValue);
    if (!Number.isInteger(page) || page < 1 || page > 10000)
      throw new BadRequestException({ code: "INVALID_PAGE" });
    const where = {
      ...target,
      deletedAt: null,
      user: { status: "ACTIVE" as const, profile: { deletedAt: null } },
    };
    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where,
        include: { user: { include: { profile: true } } },
        orderBy: [
          { user: { profile: { tier: "desc" } } },
          { createdAt: "desc" },
          { id: "asc" },
        ],
        take: 30,
        skip: (page - 1) * 30,
      }),
      prisma.comment.count({ where }),
    ]);
    return {
      comments: comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        author: {
          id: comment.userId,
          username: comment.user.profile?.username,
          displayName: comment.user.profile?.displayName ?? "Author",
          tier: comment.user.profile?.tier ?? "VIEWER",
          avatarUrl: comment.user.profile?.avatarAssetKey
            ? publicAssetUrl(this.env, comment.user.profile.avatarAssetKey)
            : null,
        },
      })),
      translationAvailable:
        Boolean(this.env.GOOGLE_TRANSLATION_API_KEY) &&
        this.env.TRANSLATION_DAILY_CHARACTER_LIMIT > 0,
      total,
      page,
    };
  }

  async translateComment(id: string, body: unknown) {
    requireUuid(id);
    const language = translationLanguage(asRecord(body).language);
    const comment = await prisma.comment.findFirst({
      where: {
        id,
        deletedAt: null,
        user: { status: "ACTIVE", profile: { deletedAt: null } },
      },
    });
    if (!comment) throw new NotFoundException({ code: "COMMENT_NOT_FOUND" });
    if (comment.photoId) await this.commentTarget("PHOTO", comment.photoId);
    else if (comment.postId) await this.commentTarget("POST", comment.postId);
    else throw new NotFoundException({ code: "COMMENT_NOT_FOUND" });
    return this.translator.translate(comment.body, language);
  }

  async comment(user: CurrentUser, kind: string, id: string, body: unknown) {
    const target = await this.commentTarget(kind, id);
    const text = boundedText(requiredString(asRecord(body), "body"), 3000);
    const comment = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`comment:${user.id}`}))`;
      if (
        (await tx.comment.count({
          where: {
            userId: user.id,
            createdAt: { gte: new Date(Date.now() - 60000) },
          },
        })) >= 5
      )
        throw new HttpException({ code: "RATE_LIMITED" }, 429);
      return tx.comment.create({
        data: { ...target, userId: user.id, body: text },
      });
    });
    return { comment: { id: comment.id } };
  }

  async deleteComment(user: CurrentUser, id: string) {
    requireUuid(id);
    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException();
    if (
      comment.userId !== user.id &&
      !userHasPermission(user, "report:moderate")
    )
      throw new ForbiddenException();
    await prisma.comment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { removed: true };
  }

  async setPro(user: CurrentUser, target: string, body: unknown) {
    requirePermission(user, "user:admin");
    requireUuid(target);
    const input = asRecord(body);
    const value = optionalString(input, "proUntil");
    const proUntil = value ? new Date(value) : null;
    if (proUntil && !Number.isFinite(proUntil.getTime()))
      throw new BadRequestException();
    await prisma.$transaction(async (tx) => {
      await tx.profile.update({
        where: { userId: target },
        data: { proUntil },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "subscription.pro_updated",
          targetType: "user",
          targetId: target,
          next: { proUntil: proUntil?.toISOString() ?? null },
        },
      });
    });
    return { proUntil };
  }

  async contact(user: CurrentUser, username: string, body: unknown) {
    const input = asRecord(body);
    const topic =
      optionalEnum(input, "topic", [
        "SHOOT",
        "REVIEW",
        "MENTORSHIP",
        "MESSAGE",
      ] as const) ?? "MESSAGE";
    const message = boundedText(requiredString(input, "body"), 5000);
    const recipient = await prisma.profile.findFirst({
      where: {
        username,
        visibility: "PUBLIC",
        deletedAt: null,
        user: { status: "ACTIVE" },
      },
    });
    if (!recipient || recipient.userId === user.id)
      throw new BadRequestException({ code: "RECIPIENT_INVALID" });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contact:${user.id}`}))`;
      const count = await tx.auditLog.count({
        where: {
          actorUserId: user.id,
          action: "community.message_sent",
          createdAt: { gte: new Date(Date.now() - 3600000) },
        },
      });
      if (count >= 20) throw new HttpException({ code: "RATE_LIMITED" }, 429);
      await tx.notification.create({
        data: {
          userId: recipient.userId,
          type: "MEMBER_MESSAGE",
          payload: {
            topic,
            message,
            senderId: user.id,
            senderName: user.profile?.displayName ?? "Author",
            senderUsername: user.profile?.username ?? "",
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "community.message_sent",
          targetType: "user",
          targetId: recipient.userId,
        },
      });
    });
    return { sent: true };
  }
}
