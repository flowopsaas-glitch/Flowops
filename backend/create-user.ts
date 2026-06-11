import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('password123', 10);
  const user = await prisma.user.create({
    data: {
      email: 'admin@flowops.com',
      password: password,
      firstName: 'Kadi',
      lastName: 'Admin',
      role: 'ADMIN', // Ensure this matches your Role enum (e.g. 'ADMIN' or 'OWNER')
      company: {
        create: {
          name: 'GoGet Logistics',
          brandPrimaryColor: '#3b82f6'
        }
      }
    }
  });
  console.log('✅ Admin user created: admin@flowops.com / password123');
}

main().catch(console.error).finally(() => prisma.$disconnect());



