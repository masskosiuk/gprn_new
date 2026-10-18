import type { prisma } from "@gprn/db";
import {
  demoBattleAuthors,
  demoBattlePhotos,
  demoChallengeWorks,
} from "@gprn/domain";
import {
  demoPhotoSales,
  demoPhotoSaleTerms,
} from "../modules/demo-photo-sales.js";

export async function seedDemoPhotoSales(
  client: Pick<typeof prisma, "$transaction">,
) {
  return client.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('demo-photo-sales-v1'))`;
      let created = 0;
      let existing = 0;
      let unavailable = 0;
      for (const offer of demoPhotoSales) {
        const source = [...demoBattlePhotos, ...demoChallengeWorks].find(
          (work) => work.id === offer.photoId,
        )!;
        const author = demoBattleAuthors.find(
          (user) => user.key === source.author,
        )!;
        const photo = await tx.photo.findUnique({
          where: { id: offer.photoId },
          include: {
            owner: { include: { profile: true } },
            provenance: true,
            assets: true,
            marketplaceProduct: { include: { seller: true } },
          },
        });
        if (
          !photo ||
          photo.ownerId !== author.id ||
          photo.owner.email !== `${author.key}@demo.gprn.invalid` ||
          photo.owner.passwordHash !== null ||
          photo.owner.profile?.username !== author.username ||
          !["demo", "stock-demo"].includes(
            photo.provenance?.sourceProvider ?? "",
          )
        ) {
          throw new Error(
            "Reserved demo work is missing or its ownership changed. No listings were modified.",
          );
        }
        const slug = `demo-photo-${photo.id}`;
        const prior = photo.marketplaceProduct;
        if (prior) {
          if (
            !prior.isDemo ||
            prior.slug !== slug ||
            prior.digitalKind !== null ||
            prior.seller.userId !== author.id
          )
            throw new Error(
              "Existing listing is not owned by this demo catalog. No listings were modified.",
            );
          existing++;
          continue;
        }
        if (
          photo.deletedAt ||
          photo.status !== "PUBLISHED" ||
          photo.visibility !== "PUBLIC" ||
          photo.moderationStatus !== "APPROVED" ||
          photo.owner.status !== "ACTIVE" ||
          photo.owner.deletedAt ||
          photo.owner.profile.visibility !== "PUBLIC" ||
          photo.owner.profile.deletedAt ||
          !photo.assets.some(
            (asset) =>
              asset.type === "DISPLAY" &&
              !asset.deletedAt &&
              asset.storageVisibility === "PUBLIC",
          )
        ) {
          unavailable++;
          continue;
        }
        const seller = await tx.sellerProfile.upsert({
          where: { userId: author.id },
          create: {
            userId: author.id,
            displayName: photo.owner.profile.displayName,
            status: "ACTIVE",
          },
          update: {},
        });
        if (seller.status !== "ACTIVE") {
          unavailable++;
          continue;
        }
        await tx.marketplaceProduct.create({
          data: {
            slug,
            photoId: photo.id,
            sellerId: seller.id,
            categoryId: photo.categoryId,
            title: photo.title,
            description: demoPhotoSaleTerms,
            priceMinor: BigInt(offer.priceMinor),
            currency: "USD",
            status: "PUBLISHED",
            isDemo: true,
            filesJson: { licenseTerms: demoPhotoSaleTerms },
          },
        });
        created++;
      }
      return { created, existing, unavailable };
    },
    { timeout: 30_000 },
  );
}
