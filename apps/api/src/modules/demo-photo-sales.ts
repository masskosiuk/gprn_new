import { demoBattlePhotos, demoChallengeWorks } from "@gprn/domain";

export const demoPhotoSales = [
  { photoId: demoBattlePhotos[0].id, priceMinor: 2500 },
  { photoId: demoBattlePhotos[1].id, priceMinor: 1800 },
  { photoId: demoBattlePhotos[4].id, priceMinor: 3200 },
  { photoId: demoBattlePhotos[6].id, priceMinor: 2400 },
  { photoId: demoBattlePhotos[8].id, priceMinor: 4500 },
  { photoId: demoBattlePhotos[9].id, priceMinor: 3800 },
  { photoId: demoChallengeWorks[1].id, priceMinor: 6500 },
] as const;

export const demoPhotoSaleTerms =
  "Demonstration only. This stock/sample work is not for sale. No purchase, license transfer or payment is available.";
