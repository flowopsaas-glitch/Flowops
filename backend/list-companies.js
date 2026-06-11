// list-companies.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const companies = await prisma.company.findMany();
    console.log(companies);
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
})();