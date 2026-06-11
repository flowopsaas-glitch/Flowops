import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@example.com';
  const newPassword = 'admin123';

  // Hash the new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Update existing admin password
  const updatedUser = await prisma.user.update({
    where: { email },
    data: { password: hashedPassword },
  });

  console.log(`✅ Password updated for user: ${updatedUser.email}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());