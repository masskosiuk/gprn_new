import { PrismaClient } from "@prisma/client";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);

async function main(): Promise<void> {
  const email = requiredEnvironmentValue("GPRN_ADMIN_EMAIL").toLowerCase();
  const password = requiredEnvironmentValue("GPRN_ADMIN_PASSWORD");
  const displayName =
    process.env.GPRN_ADMIN_NAME?.trim() || "GPRN Administrator";
  const requestedUsername =
    process.env.GPRN_ADMIN_USERNAME?.trim() || email.split("@")[0] || "admin";
  const roleKey =
    process.env.GPRN_ADMIN_ROLE === "ADMIN" ? "ADMIN" : "SUPER_ADMIN";

  if (password.length < 12) {
    throw new Error("GPRN_ADMIN_PASSWORD must contain at least 12 characters.");
  }

  const passwordHash = await hashPassword(password);
  const username = await uniqueUsername(requestedUsername, email);
  const role = await prisma.role.findUnique({ where: { key: roleKey } });

  if (!role) {
    throw new Error("Run `pnpm db:seed` before creating an administrator.");
  }

  const user = await prisma.user.upsert({
    create: {
      email,
      passwordHash,
      profile: {
        create: {
          displayName,
          tier: "PROFESSIONAL",
          username,
        },
      },
      status: "ACTIVE",
    },
    update: {
      passwordHash,
      profile: {
        upsert: {
          create: {
            displayName,
            tier: "PROFESSIONAL",
            username,
          },
          update: {},
        },
      },
      status: "ACTIVE",
    },
    where: { email },
  });

  await prisma.userRole.upsert({
    create: { roleId: role.id, userId: user.id },
    update: {},
    where: { userId_roleId: { roleId: role.id, userId: user.id } },
  });
  await prisma.rating.upsert({
    create: {
      rating: 1500,
      scope: "GLOBAL",
      scopeKey: "global",
      userId: user.id,
    },
    update: {},
    where: {
      userId_scope_scopeKey: {
        scope: "GLOBAL",
        scopeKey: "global",
        userId: user.id,
      },
    },
  });

  console.log(`Administrator ${email} is ready with role ${roleKey}.`);
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;

  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function uniqueUsername(
  requested: string,
  email: string,
): Promise<string> {
  const base =
    requested
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "admin";
  const existing = await prisma.profile.findUnique({
    where: { username: base },
  });

  if (
    !existing ||
    existing.userId === (await prisma.user.findUnique({ where: { email } }))?.id
  ) {
    return base;
  }

  return `${base}-${randomBytes(3).toString("hex")}`;
}

function requiredEnvironmentValue(key: string): string {
  const value = process.env[key]?.trim();

  if (!value) throw new Error(`${key} is required.`);
  return value;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
