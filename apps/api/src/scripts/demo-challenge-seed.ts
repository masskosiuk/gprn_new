import type { prisma } from "@gprn/db";
import {
  demoBattleAuthors,
  demoBattleEndsAt,
  demoChallenges,
  demoChallengeWorks,
} from "@gprn/domain";
import type { DemoImageAsset } from "./demo-battle-seed.js";

export interface DemoWorkAsset extends DemoImageAsset {
  readonly publicUrl: string;
  readonly contentType: string;
  readonly type: "DISPLAY" | "THUMBNAIL";
  readonly durationSeconds?: number;
}

export async function seedDemoChallenges(
  client: Pick<typeof prisma, "$transaction">,
  assets: readonly DemoWorkAsset[],
  now = new Date(),
) {
  return client.$transaction(
    async (tx) => {
      const categories = await tx.category.findMany();
      const season = await tx.season.findFirst({
        where: {
          status: "ACTIVE",
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
      });
      const categoryFor = (slug: string) => {
        const category = categories.find(
          (candidate) => candidate.slug === slug,
        );
        if (!category)
          throw new Error(
            `Missing category ${slug}. Initialize the empty database with the base seed first.`,
          );
        return category;
      };
      const assetFor = (id: string, type = "DISPLAY") => {
        const asset = assets.find(
          (candidate) => candidate.sourceId === id && candidate.type === type,
        );
        if (!asset)
          throw new Error(`Missing prepared demo asset ${id} (${type}).`);
        return asset;
      };
      let created = 0;
      let existing = 0;
      for (const challenge of demoChallenges) {
        // Never recreate withdrawn entries or overwrite administrative changes on subsequent runs.
        if (await tx.challenge.findUnique({ where: { id: challenge.id } })) {
          existing += 1;
          continue;
        }
        const works = demoChallengeWorks.filter(
          (work) => work.challenge === challenge.slug,
        );
        for (const work of works) {
          const author = demoBattleAuthors.find(
            (candidate) => candidate.key === work.author,
          )!;
          const avatar = assetFor(author.id);
          const cover = assetFor(
            work.id,
            work.mediaType === "VIDEO" ? "THUMBNAIL" : "DISPLAY",
          );
          const city = await tx.city.findFirst({
            where: { slug: author.city, country: { slug: author.country } },
          });
          if (!city)
            throw new Error(
              `Missing city ${author.city}. Initialize the empty database with the base seed first.`,
            );
          const email = `${author.key}@demo.gprn.invalid`;
          const user = await tx.user.upsert({
            where: { id: author.id },
            update: {},
            create: {
              id: author.id,
              email,
              passwordHash: null,
              profile: {
                create: {
                  username: author.username,
                  displayName: author.name,
                  bio: "Demo profile with licensed stock examples; not a real service provider or original authorship claim.",
                  visibility: "PUBLIC",
                  availableForHire: false,
                  tier: author.tier,
                  avatarAssetKey: avatar.storageKey,
                  coverAssetKey: cover.storageKey,
                  countryId: city.countryId,
                  cityId: city.id,
                },
              },
              ratings: {
                create: {
                  scope: "GLOBAL",
                  scopeKey: "global",
                  rating: author.rating,
                },
              },
            },
          });
          if (user.email !== email)
            throw new Error(
              `Reserved demo user ID ${author.id} belongs to another account.`,
            );
          const workAssets = assets.filter(
            (asset) => asset.sourceId === work.id,
          );
          if (work.mediaType === "VIDEO") assetFor(work.id, "THUMBNAIL");
          assetFor(work.id);
          const photo = await tx.photo.upsert({
            where: { id: work.id },
            update: {},
            create: {
              id: work.id,
              ownerId: author.id,
              categoryId: categoryFor(work.category).id,
              title: work.title,
              description: `Stock demo example, not the demo master's original work. ${work.credit}. ${work.license}. Source: ${work.sourcePage}`,
              status: "PUBLISHED",
              moderationStatus: "APPROVED",
              visibility: "PUBLIC",
              publishedAt: now,
              assets: {
                create: workAssets.map((asset) => ({
                  bucket: asset.bucket,
                  storageKey: asset.storageKey,
                  byteSize: BigInt(asset.byteSize),
                  width: asset.width,
                  height: asset.height,
                  contentType: asset.contentType,
                  type: asset.type,
                  checksumSha256: asset.checksumSha256,
                  storageVisibility: "PUBLIC",
                })),
              },
              metadata: {
                create: {
                  exifJson: {
                    mediaType: work.mediaType,
                    sourcePage: work.sourcePage,
                    credit: work.credit,
                    durationSeconds: assetFor(work.id).durationSeconds ?? null,
                  },
                },
              },
              provenance: {
                create: { sourceProvider: "stock-demo", status: "UNVERIFIED" },
              },
              location: {
                create: {
                  visibility: "HIDDEN",
                  precision: "UNKNOWN",
                  source: "USER_ENTERED",
                },
              },
            },
          });
          if (photo.ownerId !== author.id)
            throw new Error(
              `Reserved demo work ID ${work.id} belongs to another author.`,
            );
          if (
            photo.deletedAt ||
            photo.status !== "PUBLISHED" ||
            photo.visibility !== "PUBLIC" ||
            photo.moderationStatus !== "APPROVED"
          )
            throw new Error(
              `Demo work ${work.id} is unavailable or rejected; existing moderation was preserved.`,
            );
        }
        const cover = assetFor(
          challenge.coverWorkId,
          challenge.mediaType === "VIDEO" ? "THUMBNAIL" : "DISPLAY",
        );
        const endsAt = demoBattleEndsAt(challenge.durationDays, now);
        await tx.challenge.create({
          data: {
            id: challenge.id,
            slug: challenge.slug,
            titleKey: challenge.titleKey,
            descriptionKey: challenge.descriptionKey,
            categoryId: categoryFor(challenge.category).id,
            seasonId: season?.id,
            status: "ACTIVE",
            startsAt: now,
            endsAt: season && season.endsAt < endsAt ? season.endsAt : endsAt,
            coverUrl: cover.publicUrl,
            rules: {
              mediaType: challenge.mediaType,
              ...(challenge.mediaType === "VIDEO"
                ? { minDurationSeconds: 10, maxDurationSeconds: 60 }
                : {}),
            },
            entries: {
              create: works.map((work) => ({
                photoId: work.id,
                userId: demoBattleAuthors.find(
                  (author) => author.key === work.author,
                )!.id,
                moderationStatus: "APPROVED",
                moderatedAt: now,
              })),
            },
          },
        });
        created += 1;
      }
      return { created, existing };
    },
    { timeout: 30_000 },
  );
}
