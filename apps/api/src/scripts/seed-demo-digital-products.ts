import "dotenv/config";
import { randomUUID } from "node:crypto";
import { loadRuntimeEnv } from "@gprn/config";
import { prisma, type Prisma } from "@gprn/db";
import {
  demoBattleAuthors,
  demoDigitalProducts,
  demoProductCovers,
} from "@gprn/domain";
import { S3ObjectStorage } from "@gprn/storage";
import sharp from "sharp";
import {
  createProductCover,
  validateProductFile,
} from "../modules/digital-product-assets.js";

sharp.concurrency(1);
sharp.cache({ memory: 32, files: 0, items: 10 });

export function demoProductFile(offer: (typeof demoDigitalProducts)[number]) {
  const { gain, offset } = offer.look;
  if (offer.kind === "LUT") {
    const size = 17;
    const lines = [
      `TITLE "${offer.title}"`,
      `LUT_3D_SIZE ${size}`,
      "DOMAIN_MIN 0 0 0",
      "DOMAIN_MAX 1 1 1",
    ];
    for (let b = 0; b < size; b++)
      for (let g = 0; g < size; g++)
        for (let r = 0; r < size; r++) {
          lines.push(
            [r, g, b]
              .map((channel, index) =>
                Math.max(
                  0,
                  Math.min(
                    1,
                    (channel / (size - 1)) * gain[index]! +
                      offset[index]! / 255,
                  ),
                ).toFixed(6),
              )
              .join(" "),
          );
        }
    return { name: `${offer.id}.cube`, buffer: Buffer.from(lines.join("\n")) };
  }
  const temperature = Math.round((gain[0] - gain[2]) * 200);
  const exposure = ((gain[0] + gain[1] + gain[2]) / 3 - 1).toFixed(2);
  const content = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" crs:PresetType="Normal" crs:ProcessVersion="11.0" crs:UUID="${randomUUID().replace(/-/g, "").toUpperCase()}" crs:Exposure2012="${exposure}" crs:IncrementalTemperature="${temperature}" crs:WhiteBalance="Custom" crs:Contrast2012="${offset[0] * 2}" crs:HasSettings="True"><crs:Name><rdf:Alt><rdf:li xml:lang="x-default">${offer.title}</rdf:li></rdf:Alt></crs:Name></rdf:Description></rdf:RDF></x:xmpmeta>`;
  return { name: `${offer.id}.xmp`, buffer: Buffer.from(content) };
}

export async function downloadCover(url: string) {
  if (
    ![
      "images.unsplash.com",
      "picsum.photos",
      "images.pexels.com",
      "assets.mixkit.co",
    ].includes(new URL(url).hostname)
  )
    throw new Error("Unsupported demo image host.");
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    redirect: "follow",
  });
  if (
    !response.ok ||
    !response.body ||
    !response.headers.get("content-type")?.startsWith("image/")
  )
    throw new Error(`Demo cover download failed: HTTP ${response.status}.`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > 5 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("Demo cover exceeds 5 MB.");
    }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks);
}

async function main() {
  const env = loadRuntimeEnv();
  const storage = new S3ObjectStorage({
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
  let created = 0;
  let refreshed = 0;
  let existing = 0;
  const extras = [
    {
      key: "iryna",
      id: "de000001-0000-4000-8000-000000000007",
      name: "Iryna Melnyk",
      username: "demo.iryna.melnyk",
    },
    {
      key: "marcus",
      id: "de000001-0000-4000-8000-000000000008",
      name: "Marcus Reed",
      username: "demo.marcus.reed",
    },
    {
      key: "sofia",
      id: "de000001-0000-4000-8000-000000000009",
      name: "Sofia Rossi",
      username: "demo.sofia.rossi",
    },
  ];
  for (const offer of demoDigitalProducts) {
    const author = [...demoBattleAuthors, ...extras].find(
      (candidate) => candidate.key === offer.author,
    )!;
    const email = `${author.key}@demo.gprn.invalid`;
    const user = await prisma.user.findUnique({
      where: { id: author.id },
      include: { profile: true },
    });
    if (
      user &&
      (user.email !== email || user.profile?.username !== author.username)
    )
      throw new Error(
        "Reserved demo account is not owned by the demo catalog. No account was modified.",
      );
    if (!user && !extras.some((extra) => extra.id === author.id))
      throw new Error(
        "Seed the demo masters before their products. No real accounts were modified.",
      );
    const slug = `demo-product-${offer.id}`;
    const prior = await prisma.marketplaceProduct.findUnique({
      where: { slug },
      include: { seller: true },
    });
    if (prior) {
      if (!prior.isDemo || prior.seller.userId !== author.id)
        throw new Error(
          "Reserved demo product slug belongs to custom content.",
        );
      if (
        !process.argv.includes("--refresh-covers") ||
        !prior.previewAssetKey?.startsWith("demo/products/v1/")
      ) {
        existing++;
        continue;
      }
    }
    const original = await downloadCover(offer.imageUrl);
    const graded = await sharp(original, { limitInputPixels: 24_000_000 })
      .rotate()
      .resize(1200, 750, { fit: "cover" })
      .linear([...offer.look.gain], [...offer.look.offset])
      .webp({ quality: 88 })
      .toBuffer();
    const cover = await createProductCover(graded);
    const source = demoProductCovers.find(
      (entry) => entry.productId === offer.id,
    )!;
    const genre =
      offer.kind === "LUT"
        ? "cinematic"
        : ((
            {
              elena: "landscape",
              anna: "architecture",
              lucas: "portrait",
              marcus: "commercial",
              sofia: "portrait",
            } as Record<string, string>
          )[offer.author] ?? "street");
    if (prior) {
      const coverKey = "demo/products/v2/" + offer.id + "/cover.webp";
      await storage.putObject({
        bucket: env.S3_BUCKET_PUBLIC,
        key: coverKey,
        body: cover.buffer,
        contentType: "image/webp",
      });
      const saved = await prisma.marketplaceProduct.updateMany({
        where: {
          id: prior.id,
          isDemo: true,
          previewAssetKey: prior.previewAssetKey,
          updatedAt: prior.updatedAt,
        },
        data: {
          previewAssetKey: coverKey,
          palette: cover.palette,
          genre,
          description:
            "Demo color treatment. Cover: " +
            source.credit +
            " / Unsplash. " +
            source.sourcePage,
        },
      });
      if (!saved.count)
        throw new Error(
          "Demo product changed during cover refresh; no customer files were modified.",
        );
      refreshed++;
      continue;
    }
    const file = demoProductFile(offer);
    validateProductFile(offer.kind, {
      name: file.name,
      dataUrl: `data:application/octet-stream;base64,${file.buffer.toString("base64")}`,
    });
    const productId = randomUUID();
    const fileId = randomUUID();
    const coverKey = "demo/products/v2/" + offer.id + "/" + productId + ".webp";
    const fileKey = `demo/products/v1/${offer.id}/${fileId}.${offer.kind === "LUT" ? "cube" : "xmp"}`;
    try {
      await storage.putObject({
        body: cover.buffer,
        bucket: env.S3_BUCKET_PUBLIC,
        contentType: "image/webp",
        key: coverKey,
      });
      await storage.putObject({
        body: file.buffer,
        bucket: env.S3_BUCKET_PRIVATE,
        contentType: "application/octet-stream",
        key: fileKey,
      });
      await prisma.$transaction(async (tx) => {
        if (!user)
          await tx.user.create({
            data: {
              id: author.id,
              email,
              passwordHash: null,
              profile: {
                create: {
                  username: author.username,
                  displayName: author.name,
                  tier: "PROFESSIONAL",
                  visibility: "PUBLIC",
                  bio: "Demo profile. Not a real seller.",
                },
              },
            },
          });
        const seller = await tx.sellerProfile.upsert({
          where: { userId: author.id },
          create: {
            userId: author.id,
            displayName: author.name,
            status: "ACTIVE",
          },
          update: {},
        });
        const files = [
          {
            id: fileId,
            name: file.name,
            key: fileKey,
            size: file.buffer.length,
            format: offer.kind === "LUT" ? ".CUBE" : ".XMP",
          },
        ];
        await tx.marketplaceProduct.create({
          data: {
            id: productId,
            sellerId: seller.id,
            slug,
            title: offer.title,
            genre,
            priceMinor: offer.priceMinor,
            currency: "USD",
            digitalKind: offer.kind,
            isDemo: true,
            status: "PUBLISHED",
            previewAssetKey: coverKey,
            palette: cover.palette,
            filesJson: files as Prisma.InputJsonValue,
            description:
              "Demo color treatment. Cover: " +
              source.credit +
              " / Unsplash. " +
              source.sourcePage,
          },
        });
        await tx.profile.update({
          where: { userId: author.id },
          data:
            offer.kind === "LUT"
              ? { lutSalesEnabled: true }
              : { presetSalesEnabled: true },
        });
      });
    } catch (error) {
      await Promise.allSettled([
        storage.deleteObject(env.S3_BUCKET_PUBLIC, coverKey),
        storage.deleteObject(env.S3_BUCKET_PRIVATE, fileKey),
      ]);
      throw error;
    }
    created++;
    console.log(`Demo product prepared: ${offer.id}`);
  }
  console.log(
    "Demo products: created " +
      created +
      ", refreshed covers " +
      refreshed +
      ", preserved " +
      existing +
      ". Real products, accounts and competition entries were not modified.",
  );
}

if (
  process.argv[1]?.endsWith("seed-demo-digital-products.ts") ||
  process.argv[1]?.endsWith("seed-demo-digital-products.js")
) {
  main()
    .catch(() => {
      console.error(
        "Demo product preparation failed. Saved products were preserved; retry to prepare the remaining cards.",
      );
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
