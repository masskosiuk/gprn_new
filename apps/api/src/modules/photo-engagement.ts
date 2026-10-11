const reviewCriteria = [
  "composition",
  "lighting",
  "technicalQuality",
  "storytelling",
  "originality",
  "color",
  "emotionalImpact",
] as const;

export type PhotoReviewScores = Record<(typeof reviewCriteria)[number], number>;

export const photoEngagementInclude = {
  _count: {
    select: { likes: true, moodboardItems: true, reviews: true, savedBy: true },
  },
  reviews: {
    select: {
      color: true,
      composition: true,
      emotionalImpact: true,
      lighting: true,
      originality: true,
      storytelling: true,
      technicalQuality: true,
    },
  },
} as const;

export function aggregatePhotoReviews(reviews: readonly PhotoReviewScores[]) {
  return reviews.length
    ? (Object.fromEntries(
        reviewCriteria.map((criterion) => [
          criterion,
          reviews.reduce((sum, review) => sum + review[criterion], 0) /
            reviews.length,
        ]),
      ) as PhotoReviewScores)
    : null;
}

export function photoEngagementResponse(photo: {
  _count: {
    savedBy: number;
    likes: number;
    moodboardItems: number;
    reviews: number;
  };
  reviews: readonly PhotoReviewScores[];
}) {
  return {
    counts: {
      bookmarks: photo._count.savedBy,
      likes: photo._count.likes,
      moodboards: photo._count.moodboardItems,
      reviews: photo._count.reviews,
    },
    reviewScores: aggregatePhotoReviews(photo.reviews),
  };
}
