import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@gprn/db";
import { PhotosService } from "./photos.service.js";
import type { CurrentUser } from "./auth.service.js";
import type { LocationsService } from "./locations.service.js";

Object.assign(process.env, {
  NODE_ENV: "test",
  APP_ENV: "local",
  APP_URL: "https://site.invalid",
  API_URL: "https://api.invalid",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  REDIS_URL: "redis://127.0.0.1:1",
  S3_ENDPOINT: "https://storage.invalid",
  S3_REGION: "test",
  S3_ACCESS_KEY: "test",
  S3_SECRET_KEY: "test",
  S3_BUCKET_PUBLIC: "public",
  S3_BUCKET_PRIVATE: "private",
  ENCRYPTION_KEY: "test",
  SESSION_SECRET: "test",
});
const selection = {
  country: "France",
  countryCode: "FR",
  externalId: "2988507",
  name: "Paris",
  latitude: 48.85,
  longitude: 2.35,
};

function fixture(t: { after(fn: () => void): void }) {
  const photo: any = {
    id: "work",
    ownerId: "author",
    title: "A moment",
    deletedAt: null,
    status: "PUBLISHED",
    moderationStatus: "APPROVED",
    visibility: "PUBLIC",
    createdAt: new Date(),
    publishedAt: new Date(),
    categoryId: "documentary",
    category: { slug: "documentary", nameKey: "category.documentary.name" },
    owner: {
      id: "author",
      profile: { displayName: "Author", username: "author" },
    },
    assets: [
      {
        type: "DISPLAY",
        contentType: "image/webp",
        storageKey: "work.webp",
        byteSize: 100n,
      },
    ],
    location: {
      cityId: "kyiv",
      visibility: "APPROXIMATE",
      publicLabel: "Kyiv",
      publicLatitude: 50.45,
      publicLongitude: 30.52,
      precision: "CITY",
      source: "EXIF",
    },
    metadata: { gpsLatitudePrivate: 50.450123, gpsLongitudePrivate: 30.521234 },
    provenance: null,
  };
  const writes: any[] = [],
    audits: any[] = [],
    resolutions: any[] = [];
  const tx = {
    photo: {
      findUnique: async () => photo,
      update: async ({ where, data }: any) => {
        assert.equal(where.deletedAt, null);
        writes.push(data);
        photo.location = {
          ...photo.location,
          ...(photo.location
            ? data.location.upsert.update
            : data.location.upsert.create),
          city: { slug: "paris" },
        };
        return photo;
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        audits.push(data);
      },
    },
  };
  const oldTransaction = prisma.$transaction,
    oldFind = prisma.photo.findUnique;
  (prisma as any).$transaction = async (fn: any) => fn(tx);
  (prisma.photo as any).findUnique = async () => photo;
  t.after(() => {
    prisma.$transaction = oldTransaction;
    prisma.photo.findUnique = oldFind;
  });
  const locations = {
    resolveSelection: async (value: unknown) => {
      resolutions.push(value);
      return {
        cityId: "paris",
        countryId: "france",
        regionId: null,
        label: "Paris, France",
        latitude: 48.85,
        longitude: 2.35,
      };
    },
  };
  const service = new PhotosService(locations as unknown as LocationsService);
  const actor = {
    id: "author",
    roles: ["PHOTOGRAPHER"],
  } as unknown as CurrentUser;
  return { service, actor, photo, tx, locations, writes, audits, resolutions };
}

test("changing a photo's city updates only its location and audit, preserving publication, category, assets and original EXIF", async (t) => {
  const f = fixture(t),
    assets = f.photo.assets,
    metadata = f.photo.metadata;
  const result = await f.service.changeLocation(f.actor, "work", {
    location: selection,
  });
  assert.equal(result.photo.location?.publicLabel, "Paris, France");
  assert.equal(result.photo.location?.publicLatitude, 48.85);
  assert.equal(result.photo.location?.visibility, "CITY");
  assert.deepEqual(Object.keys(f.writes[0]), ["location"]);
  assert.equal(f.writes[0].location.upsert.update.placeId, null);
  assert.equal(f.photo.status, "PUBLISHED");
  assert.equal(f.photo.categoryId, "documentary");
  assert.equal(f.photo.assets, assets);
  assert.equal(f.photo.metadata, metadata);
  assert.equal(f.audits[0].action, "photo.location_changed");
  assert.deepEqual(f.audits[0].previous, { cityId: "kyiv" });
});

test("editing a hidden photo location never reveals its public coordinates", async (t) => {
  const f = fixture(t);
  f.photo.location.visibility = "HIDDEN";
  const result = await f.service.changeLocation(f.actor, "work", {
    location: selection,
    locationVisibility: "EXACT",
  });
  assert.equal(f.photo.location.cityId, "paris");
  assert.equal(result.photo.location?.visibility, "HIDDEN");
  assert.equal(result.photo.location?.publicLatitude, null);
  assert.equal(result.photo.location?.publicLongitude, null);
});

test("only the owner or administrators may change a photo location, before resolving or writing cities", async (t) => {
  const f = fixture(t);
  for (const roles of [["PHOTOGRAPHER"], ["MODERATOR"]]) {
    await assert.rejects(
      f.service.changeLocation(
        { ...f.actor, id: "other", roles } as CurrentUser,
        "work",
        { location: selection },
      ),
    );
  }
  assert.equal(f.resolutions.length, 0);
  assert.equal(f.writes.length, 0);
  for (const role of ["ADMIN", "SUPER_ADMIN"]) {
    await f.service.changeLocation(
      { ...f.actor, id: "administrator", roles: [role] } as CurrentUser,
      "work",
      { location: selection },
    );
  }
  assert.equal(f.writes.length, 2);
});

test("missing, malformed and out-of-range locations cannot change a photo", async (t) => {
  const f = fixture(t);
  for (const body of [
    {},
    { location: null },
    { location: "Paris" },
    { location: { ...selection, latitude: 91 } },
    { location: { ...selection, longitude: NaN } },
    { location: { ...selection, countryCode: "INVALID" } },
  ]) {
    await assert.rejects(f.service.changeLocation(f.actor, "work", body));
  }
  assert.equal(f.resolutions.length, 0);
  assert.equal(f.writes.length, 0);
});

test("location can be added when absent, but deleted works and profile assets remain uneditable", async (t) => {
  const f = fixture(t);
  f.photo.location = null;
  await f.service.changeLocation(f.actor, "work", { location: selection });
  assert.equal(f.photo.location.cityId, "paris");
  f.photo.title = "__profile_avatar__";
  await assert.rejects(
    f.service.changeLocation(f.actor, "work", { location: selection }),
  );
  f.photo.title = "A moment";
  f.photo.deletedAt = new Date();
  await assert.rejects(
    f.service.changeLocation(f.actor, "work", { location: selection }),
  );
  assert.equal(f.writes.length, 1);
});

test("deleting a photo while resolving its new city cannot resurrect or modify it", async (t) => {
  const f = fixture(t);
  f.tx.photo.findUnique = async () => ({ ...f.photo, deletedAt: new Date() });
  await assert.rejects(
    f.service.changeLocation(f.actor, "work", { location: selection }),
  );
  assert.equal(f.writes.length, 0);
});
