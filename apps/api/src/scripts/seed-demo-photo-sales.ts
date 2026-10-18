import "dotenv/config";
import { prisma } from "@gprn/db";
import { seedDemoPhotoSales } from "./demo-photo-sale-seed.js";

seedDemoPhotoSales(prisma)
  .then(({ created, existing, unavailable }) => {
    console.log(
      `Demo media listings: created ${created}, preserved ${existing}, unavailable ${unavailable}. Photos, votes and real sales were not modified.`,
    );
  })
  .catch(() => {
    console.error(
      "Demo listing preparation failed. Seed demo battles and challenges first; check ownership. No listings were modified.",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
