// fetch-single-company.js
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// <-- Set the company ID you want to fetch here
const COMPANY_ID = 1;

async function main() {
  try {
    console.log(`Fetching company with ID ${COMPANY_ID}...\n`);

    const company = await prisma.company.findUnique({
      where: { id: COMPANY_ID },
      include: {
        collections: {
          include: { quotes: true }
        }
      }
    });

    if (!company) {
      console.log(`Company with ID ${COMPANY_ID} not found.`);
      return;
    }

    // Print nicely in console
    console.log(`Company: ${company.name} (ID: ${company.id})`);
    if (!company.collections || company.collections.length === 0) {
      console.log("  No collections found.");
    } else {
      company.collections.forEach(collection => {
        console.log(`  Collection: ${collection.name} (ID: ${collection.id})`);
        if (!collection.quotes || collection.quotes.length === 0) {
          console.log("    No quotes found.");
        } else {
          collection.quotes.forEach(quote => {
            console.log(`    Quote ID: ${quote.id}, Text: "${quote.text}"`);
          });
        }
      });
    }

    // Save to JSON file
    const filePath = path.join(__dirname, `company-${COMPANY_ID}.json`);
    fs.writeFileSync(filePath, JSON.stringify(company, null, 2), 'utf-8');
    console.log(`\nData written to ${filePath}`);

  } catch (error) {
    console.error("Error fetching data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();