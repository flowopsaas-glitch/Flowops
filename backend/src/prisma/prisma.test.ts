// src/prisma/prisma.test.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function test() {
  try {
    const users = await prisma.user.findMany()
    console.log('Users:', users)
    const collections = await prisma.collection.findMany()
    console.log('Collections:', collections)
  } catch (err) {
    console.error(err)
  } finally {
    await prisma.$disconnect()
  }
}

test()
