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

  await prisma.season.upsert({
    create: {
      descriptionKey: "season.founding.description",
      endsAt: new Date("2027-12-31T23:59:59.000Z"),
      nameKey: "season.founding.name",
      slug: "season-01-founding",
      startsAt: new Date("2026-08-13T00:00:00.000Z"),
      status: "DRAFT"
    },
    update: {},
    where: { slug: "season-01-founding" }
  });

  for (const key of ["first_upload", "first_battle", "first_win", "founding_photographer"]) {
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

