import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregatePhotoReviews,
  photoEngagementResponse,
  type PhotoReviewScores,
} from "./photo-engagement.js";

const scores = (value: number): PhotoReviewScores => ({
  composition: value,
  lighting: value,
  technicalQuality: value,
  storytelling: value,
  originality: value,
  color: value,
  emotionalImpact: value,
});

test("profile and feed photo serializers share actual interaction counts and reviews", () => {
  const photo = {
    _count: { likes: 12, savedBy: 3, moodboardItems: 2, reviews: 2 },
    reviews: [scores(6), scores(9)],
  };
  assert.deepEqual(photoEngagementResponse(photo), {
    counts: { bookmarks: 3, likes: 12, moodboards: 2, reviews: 2 },
    reviewScores: scores(7.5),
  });
});

test("unreviewed photos keep null scores, never fabricated ratings", () => {
  assert.equal(aggregatePhotoReviews([]), null);
  assert.deepEqual(
    photoEngagementResponse({
      _count: { likes: 0, savedBy: 0, moodboardItems: 0, reviews: 0 },
      reviews: [],
    }).counts,
    { bookmarks: 0, likes: 0, moodboards: 0, reviews: 0 },
  );
});
