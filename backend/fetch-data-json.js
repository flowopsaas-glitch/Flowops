// fetch-data-json.js
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Fetching all companies with their collections and quotes...");

    const companies = await prisma.company.findMany({
      include: {
        collections: {
          include: {
            quotes: true
          }
        }
      }
    });

    if (companies.length === 0) {
      console.log("No companies found.");
      return;
    }

    const filePath = path.join(__dirname, 'data.json');
    fs.writeFileSync(filePath, JSON.stringify(companies, null, 2), 'utf-8');

    console.log(`\nData successfully written to ${filePath}`);
  } catch (error) {
    console.error("Error fetching data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();