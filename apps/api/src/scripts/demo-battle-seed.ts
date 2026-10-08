import type { prisma } from "@gprn/db";
import {
  demoBattleAuthors,
  demoBattleEndsAt,
  demoBattlePhotos,
  demoBattles,
} from "@gprn/domain";

export interface DemoImageAsset {
  readonly sourceId: string;
  readonly bucket: string;
  readonly storageKey: string;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly checksumSha256: string;
}

export async function seedDemoBattles(
  client: Pick<typeof prisma, "$transaction">,
  assets: readonly DemoImageAsset[],
  now = new Date(),
): Promise<{ created: number; existing: number }> {
  return client.$transaction(
    async (tx) => {
      const categories = await tx.category.findMany();
      const cities = await tx.city.findMany({
        include: { country: true },
        where: { slug: { in: demoBattleAuthors.map((author) => author.city) } },
      });
      const assetById = new Map(assets.map((asset) => [asset.sourceId, asset]));
      const categoryFor = (category: string) => {
        const slug = category === "nature" ? "wildlife" : category;
        const record = categories.find((candidate) => candidate.slug === slug);
        if (!record)
          throw new Error(
            `Missing category ${slug}. Initialize an empty database with the base seed first.`,
          );
        return record;
      };
      const cityFor = (author: (typeof demoBattleAuthors)[number]) => {
        const city = cities.find(
          (candidate) =>
            candidate.slug === author.city &&
            candidate.country.slug === author.country,
        );
        if (!city)
          throw new Error(
            `Missing city ${author.city}. Initialize an empty database with the base seed first.`,
          );
        return city;
      };
      const assetFor = (id: string) => {
        const asset = assetById.get(id);
        if (!asset) throw new Error(`Missing prepared demo image ${id}.`);
        return asset;
      };

      for (const author of demoBattleAuthors) {
        const city = cityFor(author);
        const avatar = assetFor(author.id);
        const cover = assetFor(
          demoBattlePhotos.find((photo) => photo.author === author.key)!.id,
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
                bio: "Demo profile with sample images. Not a real service provider.",
                avatarAssetKey: avatar.storageKey,
                coverAssetKey: cover.storageKey,
                countryId: city.countryId,
                cityId: city.id,
                tier: author.tier,
                visibility: "PUBLIC",
                availableForHire: false,
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
      }

      for (const photo of demoBattlePhotos) {
        const author = demoBattleAuthors.find(
          (candidate) => candidate.key === photo.author,
        )!;
        const city = cityFor(author);
        const asset = assetFor(photo.id);
        const record = await tx.photo.upsert({
          where: { id: photo.id },
          update: {},
          create: {
            id: photo.id,
            ownerId: author.id,
            categoryId: categoryFor(photo.category).id,
            title: photo.title,
            description: `Demo image from ${photo.imageUrl}. Sample attribution is fictional; no original authorship claim.`,
            status: "PUBLISHED",
            visibility: "PUBLIC",
            moderationStatus: "APPROVED",
            publishedAt: now,
            assets: {
              create: {
                bucket: asset.bucket,
                storageKey: asset.storageKey,
                byteSize: BigInt(asset.byteSize),
                width: asset.width,
                height: asset.height,
                checksumSha256: asset.checksumSha256,
                contentType: "image/jpeg",
                storageVisibility: "PUBLIC",
                type: "DISPLAY",
              },
            },
            provenance: {
              create: { sourceProvider: "demo", status: "UNVERIFIED" },
            },
            location: {
              create: {
                countryId: city.countryId,
                cityId: city.id,
                publicLabel: author.city,
                publicLatitude: city.latitude,
                publicLongitude: city.longitude,
                precision: "CITY",
                visibility: "CITY",
                source: "USER_ENTERED",
              },
            },
          },
        });
        if (record.ownerId !== author.id)
          throw new Error(
            `Reserved demo photo ID ${photo.id} belongs to another author.`,
          );
      }

      let created = 0;
      let existing = 0;
      for (const battle of demoBattles) {
        // Existing battles keep votes, deadlines and moderation decisions, including cancellations.
        if (await tx.battle.findUnique({ where: { id: battle.id } })) {
          existing += 1;
          continue;
        }
        const photos = await tx.photo.findMany({
          where: { id: { in: [...battle.photoIds] } },
        });
        if (
          photos.length !== 2 ||
          photos.some(
            (photo) =>
              photo.deletedAt ||
              photo.status !== "PUBLISHED" ||
              photo.visibility !== "PUBLIC" ||
              photo.moderationStatus !== "APPROVED",
          )
        ) {
          throw new Error(
            `Demo battle ${battle.id} contains unavailable or rejected photos.`,
          );
        }
        await tx.battle.create({
          data: {
            id: battle.id,
            categoryId: categoryFor(battle.category).id,
            status: "OPEN",
            startsAt: now,
            endsAt: demoBattleEndsAt(battle.durationDays, now),
            entries: {
              create: battle.photoIds.map((photoId, index) => {
                const photo = demoBattlePhotos.find(
                  (candidate) => candidate.id === photoId,
                )!;
                const author = demoBattleAuthors.find(
                  (candidate) => candidate.key === photo.author,
                )!;
                return {
                  photoId,
                  userId: author.id,
                  slot: index === 0 ? "A" : "B",
                  moderationStatus: "APPROVED",
                  moderatedAt: now,
                };
              }),
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
