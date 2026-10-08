import "dotenv/config";
import { prisma } from "@gprn/db";
import { planMediaTitleRepairs } from "./media-title-repair.js";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const locale =
    process.argv
      .find((argument) => argument.startsWith("--locale="))
      ?.slice(9) ?? "ru";
  const photos = await prisma.photo.findMany({
    where: { deletedAt: null, NOT: { title: { startsWith: "__profile_" } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      assets: true,
      provenanceEvents: {
        where: { eventType: "ORIGINAL_FILE_RECEIVED" },
        select: { evidence: true },
      },
    },
  });
  const edited = await prisma.auditLog.findMany({
    where: { action: "photo.renamed", targetType: "Photo" },
    select: { targetId: true },
  });
  const repairs = planMediaTitleRepairs(
    photos,
    locale,
    new Set(edited.flatMap((log) => (log.targetId ? [log.targetId] : []))),
  );
  let repaired = 0;
  for (const repair of repairs) {
    const { id, previous, title } = repair;
    if (apply) {
      const changed = await prisma.$transaction(async (tx) => {
        const result = await tx.photo.updateMany({
          where: { id, title: previous, deletedAt: null },
          data: { title },
        });
        if (result.count)
          await tx.auditLog.create({
            data: {
              action: "photo.title_generated",
              targetType: "Photo",
              targetId: id,
              previous: { title: previous },
              next: { title },
              reason: "Replaced an automatically copied technical filename.",
            },
          });
        return result.count;
      });
      if (!changed) continue;
    }
    repaired++;
    console.log(
      `${apply ? "Renamed" : "Would rename"} ${id}: ${previous} -> ${title}`,
    );
  }
  console.log(
    `${apply ? "Repaired" : "Found"} ${repaired} technical titles. Custom titles, profile images and demo works were left unchanged.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
