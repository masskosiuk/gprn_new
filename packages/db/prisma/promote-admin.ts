import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = requiredEnvironmentValue("GPRN_ADMIN_EMAIL").toLowerCase();
  const roleKey =
    process.env.GPRN_ADMIN_ROLE === "ADMIN" ? "ADMIN" : "SUPER_ADMIN";

  const [user, role] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.role.findUnique({ where: { key: roleKey } }),
  ]);

  if (!user) {
    throw new Error(`Account ${email} does not exist.`);
  }
  if (!role) {
    throw new Error("Run `pnpm db:seed` before promoting an administrator.");
  }

  await prisma.$transaction([
    prisma.user.update({
      data: { status: "ACTIVE" },
      where: { id: user.id },
    }),
    prisma.userRole.upsert({
      create: { roleId: role.id, userId: user.id },
      update: {},
      where: { userId_roleId: { roleId: role.id, userId: user.id } },
    }),
  ]);

  console.log(`Account ${email} now has role ${roleKey}.`);
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
