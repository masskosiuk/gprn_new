import { Controller, Get, Header } from "@nestjs/common";
import { prisma } from "@gprn/db";
import {
  indexablePhoto,
  indexablePost,
  indexableProfile,
  seoEntry,
} from "./seo-index.js";

@Controller("seo")
export class SeoController {
  @Get("index")
  @Header("Cache-Control", "no-store")
  async index() {
    // Bound database work and keep the fourteen-language sitemap below 50,000 URLs.
    const [profiles, photos, posts, challenges] = await Promise.all([
      prisma.profile.findMany({
        where: indexableProfile,
        select: { username: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 500,
      }),
      prisma.photo.findMany({
        where: indexablePhoto,
        select: {
          id: true,
          updatedAt: true,
          owner: { select: { profile: { select: { username: true } } } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 1000,
      }),
      prisma.communityPost.findMany({
        where: indexablePost,
        select: { id: true, kind: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 500,
      }),
      prisma.challenge.findMany({
        where: { status: { in: ["ACTIVE", "UPCOMING"] } },
        select: { slug: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 100,
      }),
    ]);
    return {
      entries: [
        ...profiles.map((profile) =>
          seoEntry("profile", { author: profile.username }, profile.updatedAt),
        ),
        ...photos.flatMap((photo) =>
          photo.owner.profile
            ? [
                seoEntry(
                  "profile",
                  { author: photo.owner.profile.username, photo: photo.id },
                  photo.updatedAt,
                ),
              ]
            : [],
        ),
        ...posts.map((post) =>
          seoEntry(
            (
              {
                EVENT: "events",
                DISCUSSION: "discussions",
                CASTING: "search",
              } as Record<string, string>
            )[post.kind]!,
            { post: post.id },
            post.updatedAt,
          ),
        ),
        ...challenges.map((challenge) =>
          seoEntry(
            "challenges",
            { challenge: challenge.slug },
            challenge.updatedAt,
          ),
        ),
      ],
    };
  }
}
