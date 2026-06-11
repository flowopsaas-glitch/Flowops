import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD?.trim();

  if (!email || !password) {
    throw new Error(
      'SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD must be set in your backend .env',
    );
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        role: Role.SUPER_ADMIN,
        companyId: null,
      },
    });

    console.log(`Updated Super Admin: ${email}`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      role: Role.SUPER_ADMIN,
      companyId: null,
    },
  });

  console.log(`Created Super Admin: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });