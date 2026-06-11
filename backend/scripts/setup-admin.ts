import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@example.com';
  const password = 'admin123';

  // Hash the password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Check if admin exists
  const existingAdmin = await prisma.user.findUnique({ where: { email } });

  if (existingAdmin) {
    // Admin exists → update password only
    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });
    console.log(`✅ Admin exists. Password updated for ${email}`);
  } else {
    // Admin does not exist → create new user
    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: 'SUPER_ADMIN', // match your roles.enum
        companyId: 1,        // adjust if needed
      },
    });
    console.log(`✅ Admin created with email ${email}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());