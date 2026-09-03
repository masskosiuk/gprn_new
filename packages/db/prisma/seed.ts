import { PrismaClient } from "@prisma/client";
import { permissions, rolePermissions, roles } from "@gprn/rbac";

const prisma = new PrismaClient();

const locales = ["en", "uk", "ru", "pl", "de", "fr", "it", "es", "pt", "nl", "tr"];

const categories = [
  "portrait",
  "landscape",
  "street",
  "architecture",
  "automotive",
  "fashion",
  "travel",
  "wildlife",
  "documentary",
  "night"
];

const featureFlags = [
  "AI_ENABLED",
  "MARKETPLACE_ENABLED",
  "EXPERT_REVIEWS_ENABLED",
  "PAYMENTS_ENABLED",
  "ADVANCED_PROVENANCE_ENABLED"
];

const places = [
  { city: "kyiv", country: "ukraine", iso2: "UA", iso3: "UKR", latitude: 50.4501, longitude: 30.5234 },
  { city: "paris", country: "france", iso2: "FR", iso3: "FRA", latitude: 48.8566, longitude: 2.3522 },
  { city: "tokyo", country: "japan", iso2: "JP", iso3: "JPN", latitude: 35.6762, longitude: 139.6503 },
  { city: "reykjavik", country: "iceland", iso2: "IS", iso3: "ISL", latitude: 64.1466, longitude: -21.9426 },
  { city: "lisbon", country: "portugal", iso2: "PT", iso3: "PRT", latitude: 38.7223, longitude: -9.1393 },
  { city: "marrakech", country: "morocco", iso2: "MA", iso3: "MAR", latitude: 31.6295, longitude: -7.9811 }
];

async function main(): Promise<void> {
  for (const key of permissions) {
    await prisma.permission.upsert({
      create: { key },
      update: {},
      where: { key }
    });
  }

  for (const key of roles) {
    await prisma.role.upsert({
      create: { key },
      update: {},
      where: { key }
    });
  }

  for (const [roleKey, permissionKeys] of Object.entries(rolePermissions)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });

    for (const permissionKey of permissionKeys) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { key: permissionKey }
      });

      await prisma.rolePermission.upsert({
        create: {
          permissionId: permission.id,
          roleId: role.id
        },
        update: {},
        where: {
          roleId_permissionId: {
            permissionId: permission.id,
            roleId: role.id
          }
        }
      });
    }
  }

  for (const locale of locales) {
    await prisma.translation.upsert({
      create: {
        key: "app.name",
        locale,
        namespace: "common",
        value: "Global Photographer Reputation Network"
      },
      update: {},
      where: {
        locale_namespace_key: {
          key: "app.name",
          locale,
          namespace: "common"
        }
      }
    });
  }

  for (const [sortOrder, slug] of categories.entries()) {
    await prisma.category.upsert({
      create: {
        nameKey: `category.${slug}.name`,
        slug,
        sortOrder
      },
      update: {
        isActive: true,
        sortOrder
      },
      where: { slug }
    });
  }

  for (const place of places) {
    const country = await prisma.country.upsert({
      create: {
        iso2: place.iso2,
        iso3: place.iso3,
        nameKey: `country.${place.country}.name`,
        slug: place.country
      },
      update: {
        iso3: place.iso3,
        nameKey: `country.${place.country}.name`
      },
      where: { iso2: place.iso2 }
    });
    const existingCity = await prisma.city.findFirst({
      where: { countryId: country.id, regionId: null, slug: place.city }
    });

    if (existingCity) {
      await prisma.city.update({
        data: { latitude: place.latitude, longitude: place.longitude, nameKey: `city.${place.city}.name` },
        where: { id: existingCity.id }
      });
    } else {
      await prisma.city.create({
        data: {
          countryId: country.id,
          latitude: place.latitude,
          longitude: place.longitude,
          nameKey: `city.${place.city}.name`,
          slug: place.city
        }
      });
    }
  }

  for (const key of featureFlags) {
    await prisma.featureFlag.upsert({
      create: {
        enabled: false,
        key
      },
      update: {
        enabled: false
      },
      where: {
        key_scope_scopeKey: {
          key,
          scope: "GLOBAL",
          scopeKey: "global"
        }
      }
    });
  }

  const season = await prisma.season.upsert({
    create: {
      descriptionKey: "season.founding.description",
      endsAt: new Date("2027-12-31T23:59:59.000Z"),
      nameKey: "season.founding.name",
      slug: "season-01-founding",
      startsAt: new Date("2026-08-13T00:00:00.000Z"),
      status: "ACTIVE"
    },
    update: {
      descriptionKey: "season.founding.description",
      endsAt: new Date("2027-12-31T23:59:59.000Z"),
      nameKey: "season.founding.name",
      startsAt: new Date("2026-08-13T00:00:00.000Z"),
      status: "ACTIVE"
    },
    where: { slug: "season-01-founding" }
  });

  const challengeSeeds = [
    { category: "street", slug: "street-stories", status: "ACTIVE" as const },
    { category: "portrait", slug: "available-light-portrait", status: "ACTIVE" as const },
    { category: "landscape", slug: "weather-and-land", status: "UPCOMING" as const }
  ];

  for (const challengeSeed of challengeSeeds) {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: challengeSeed.category } });
    await prisma.challenge.upsert({
      create: {
        categoryId: category.id,
        descriptionKey: `challenge.${challengeSeed.slug}.description`,
        endsAt: new Date("2027-12-15T23:59:59.000Z"),
        rules: { maxEntriesPerUser: 1, voting: "community_battles" },
        seasonId: season.id,
        slug: challengeSeed.slug,
        startsAt: new Date("2026-08-13T00:00:00.000Z"),
        status: challengeSeed.status,
        titleKey: `challenge.${challengeSeed.slug}.title`
      },
      update: {
        categoryId: category.id,
        seasonId: season.id,
        status: challengeSeed.status
      },
      where: { slug: challengeSeed.slug }
    });
  }

  for (const key of [
    "first_upload",
    "first_battle",
    "first_win",
    "founding_photographer",
    "first_challenge",
    "city_explorer",
    "season_entrant",
    "photographed_5_countries"
  ]) {
    await prisma.achievement.upsert({
      create: {
        descriptionKey: `achievement.${key}.description`,
        key,
        nameKey: `achievement.${key}.name`
      },
      update: {},
      where: { key }
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
