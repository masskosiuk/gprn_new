import { productInclude } from "./digital-product-assets.js";

export const photoSaleInclude = {
  marketplaceProduct: { include: productInclude },
} as const;

export function readLicenseTerms(value: unknown): string {
  return value &&
    typeof value === "object" &&
    "licenseTerms" in value &&
    typeof value.licenseTerms === "string"
    ? value.licenseTerms
    : "";
}

export function serializePhotoSale(photo: {
  status: string;
  visibility: string;
  moderationStatus: string;
  deletedAt?: Date | null;
  marketplaceProduct?: {
    id: string;
    priceMinor: bigint;
    currency: string;
    status: string;
    digitalKind: string | null;
    isDemo: boolean;
    filesJson: unknown;
    seller: {
      status: string;
      user: {
        status: string;
        profile: { visibility: string; deletedAt: Date | null } | null;
      };
    };
  } | null;
}) {
  const product = photo.marketplaceProduct;
  if (
    !product ||
    product.digitalKind ||
    product.status !== "PUBLISHED" ||
    photo.status !== "PUBLISHED" ||
    photo.visibility !== "PUBLIC" ||
    photo.moderationStatus !== "APPROVED" ||
    photo.deletedAt ||
    product.seller.status !== "ACTIVE" ||
    product.seller.user.status !== "ACTIVE" ||
    product.seller.user.profile?.visibility !== "PUBLIC" ||
    product.seller.user.profile.deletedAt ||
    !readLicenseTerms(product.filesJson)
  )
    return null;
  return {
    id: product.id,
    priceMinor: Number(product.priceMinor),
    currency: product.currency,
    ...(product.isDemo ? { isDemo: true } : {}),
  };
}
