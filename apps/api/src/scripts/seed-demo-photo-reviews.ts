import "dotenv/config";
import { prisma } from "@gprn/db";
import { seedDemoPhotoReviews } from "./demo-photo-review-seed.js";

seedDemoPhotoReviews(prisma)
  .then((result) =>
    console.log(
      `Demo photo reviews created: ${result.created}; newly rated photos: ${result.photos}; already rated photos preserved: ${result.preserved}. No battle votes or account ratings were changed.`,
    ),
  )
  .catch(() => {
    console.error(
      "Demo photo review seed failed. The transaction was rolled back; check demo account ownership and database availability.",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
