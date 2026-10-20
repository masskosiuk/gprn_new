import { PHOTOGRAPHY_CATEGORY_SLUGS } from "@gprn/domain";

export interface PhotoCategory {
  readonly slug: string;
}

export const defaultPhotoCategories: readonly PhotoCategory[] =
  PHOTOGRAPHY_CATEGORY_SLUGS.map((slug) => ({ slug }));

export function photoCategoryFilters(categories: readonly PhotoCategory[]) {
  return [
    { id: "all", key: "category.all" },
    ...categories.map(({ slug }) => ({ id: slug, key: `category.${slug}` })),
  ];
}

export function normalizePhotoCategory(slug?: string | null): string {
  return slug || "documentary";
}
