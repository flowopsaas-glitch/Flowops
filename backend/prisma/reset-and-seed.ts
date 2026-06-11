import { PrismaClient, UserRole, CollectionStatus } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🧹 Resetting database...')

  await prisma.collection.deleteMany()
  await prisma.user.deleteMany()
  await prisma.company.deleteMany()

  console.log('🏢 Seeding companies...')
  const alpha = await prisma.company.create({
    data: {
      name: 'Alpha Corp',
    },
  })

  console.log('👤 Seeding users...')
  const passwordHash = await bcrypt.hash('Password123!', 10)

  await prisma.user.createMany({
    data: [
      {
        email: 'admin@flowops.com',
        password: passwordHash,
        role: UserRole.ADMIN,
      },
      {
        email: 'manager@alpha.com',
        password: passwordHash,
        role: UserRole.COMPANY_ADMIN,
        companyId: alpha.id,
      },
    ],
  })

  console.log('📦 Seeding collections...')
  await prisma.collection.create({
    data: {
      status: CollectionStatus.PENDING,
      companyId: alpha.id,
    },
  })

  console.log('✅ Database seeded successfully')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
