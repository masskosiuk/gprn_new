import assert from "node:assert/strict";
import test from "node:test";
import { supportedLocales } from "@gprn/i18n";
import {
  pageMetadata,
  pageAlternates,
  pagePath,
  jsonLd,
  publicImage,
  publicSections,
  sitemapUrl,
} from "./seo.ts";
import { publicPageMetadata, publicPageSchema } from "./public-metadata.ts";
import type { PublicPageData } from "./public-page-data.ts";
import { imageSource } from "./image-source.ts";
import { contentSecurityPolicy } from "../../security-headers.mjs";

test("every locale and public section has its own canonical and reciprocal alternates", () => {
  for (const locale of supportedLocales)
    for (const section of publicSections) {
      const metadata = pageMetadata(locale, section);
      assert.equal(metadata.alternates?.canonical, pagePath(locale, section));
      const languages = pageAlternates(locale, section).languages;
      assert.equal(languages["en"], pagePath("en", section));
      assert.equal(languages["x-default"], pagePath("en", section));
      assert.equal(Object.keys(languages).length, supportedLocales.length + 1);
      assert.ok(!String(metadata.title).includes("section."));
      assert.ok(metadata.description);
      assert.ok(
        metadata.openGraph &&
          "images" in metadata.openGraph &&
          metadata.openGraph.images,
      );
    }
});
test("entity query identity is encoded and retained across languages", () => {
  const query = { author: "a & b", photo: "photo/1" };
  assert.equal(
    pageAlternates("ru", "profile", query).languages.en,
    "/en/profile?author=a+%26+b&photo=photo%2F1",
  );
  assert.equal(
    sitemapUrl("https://site.test/ru/profile?author=a&photo=p"),
    "https://site.test/ru/profile?author=a&amp;photo=p",
  );
});
test("private pages and all demo entities stay out of the search index", () => {
  for (const section of ["admin", "interactions", "suggestions", "profile"]) {
    assert.deepEqual(publicPageMetadata("ru", section, {}, {}).robots, {
      index: false,
      follow: true,
    });
  }
  const data = {
    profile: { username: "demo.mika.tanaka", displayName: "Mika", photos: [] },
  } as unknown as PublicPageData;
  assert.deepEqual(
    publicPageMetadata("ru", "profile", { author: "mika" }, data).robots,
    { index: false, follow: true },
  );
  assert.deepEqual(
    publicPageSchema("ru", "profile", { author: "mika" }, data),
    [],
  );
});
test("public profiles and photos have separate titles, previews and canonical URLs", () => {
  const data = {
    profile: {
      username: "anna",
      displayName: "Anna",
      bio: "Portrait photographer",
      avatarUrl: "/avatar.jpg",
      photos: [{ id: "p", title: "Portrait", displayUrl: "/photo.jpg" }],
    },
  } as unknown as PublicPageData;
  const profile = publicPageMetadata("ru", "profile", { author: "ANNA" }, data);
  const photo = publicPageMetadata(
    "ru",
    "profile",
    { author: "anna", photo: "p" },
    data,
  );
  assert.equal(profile.alternates?.canonical, "/ru/profile?author=anna");
  assert.equal(photo.alternates?.canonical, "/ru/profile?author=anna&photo=p");
  assert.notEqual(profile.title, photo.title);
  assert.deepEqual(photo.robots, { index: true, follow: true });
  assert.deepEqual(
    publicPageMetadata(
      "ru",
      "profile",
      { author: "anna", photo: "private" },
      data,
    ).robots,
    { index: false, follow: true },
  );
  assert.ok(
    JSON.stringify(
      publicPageSchema("ru", "profile", { author: "anna" }, data),
    ).includes('"ProfilePage"'),
  );
});
test("structured data has no fake offers, ratings or demo events and safely escapes user text", () => {
  const hostile = '</script><script>alert("x")</script>\u2028';
  const value = jsonLd({ name: hostile });
  assert.ok(!value.includes("<"));
  assert.deepEqual(JSON.parse(value), { name: hostile });
  const schema = publicPageSchema("ru", "home", {}, {});
  assert.ok(!JSON.stringify(schema).includes("aggregateRating"));
  assert.equal(publicImage("javascript:alert(1)"), undefined);
  assert.equal(
    publicImage("https://secret:password@example.com/p.jpg"),
    undefined,
  );
  assert.equal(publicImage("data:image/png;base64,test"), undefined);
});
test("static image optimization retains exact dimensions and leaves other sources alone", () => {
  assert.deepEqual(imageSource("/images/challenges/city-night.png"), {
    src: "/images/challenges/city-night.webp",
    width: 1672,
    height: 941,
    optimized: true,
  });
  assert.deepEqual(imageSource("blob:test"), {
    src: "blob:test",
    optimized: false,
  });
  assert.deepEqual(imageSource("/images/other.png"), {
    src: "/images/other.png",
    optimized: false,
  });
  assert.equal(
    imageSource("https://images.unsplash.com/p?w=600&h=600").height,
    600,
  );
});
test("production HTML CSP requires a per-request nonce without blocking maps, previews or upload blobs", () => {
  const csp = contentSecurityPolicy({ nonce: "request-nonce" });
  assert.ok(
    csp.includes("script-src 'self' 'nonce-request-nonce' 'strict-dynamic'"),
  );
  assert.ok(!csp.includes("unsafe-eval"));
  assert.ok(
    !csp
      .split(";")
      .find((value) => value.includes("script-src"))!
      .includes("unsafe-inline"),
  );
  assert.ok(csp.includes("img-src 'self' https: http: data: blob:"));
  assert.ok(csp.includes("object-src 'none'"));
  assert.ok(
    contentSecurityPolicy({ nonce: "development", development: true }).includes(
      "unsafe-eval",
    ),
  );
});
