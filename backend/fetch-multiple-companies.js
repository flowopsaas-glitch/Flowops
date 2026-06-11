// fetch-multiple-companies.js
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// <-- Set the company IDs you want to fetch here
const COMPANY_IDS = [1, 2, 3];

async function main() {
  try {
    console.log(`Fetching companies with IDs: ${COMPANY_IDS.join(', ')}\n`);

    const companies = await prisma.company.findMany({
      where: { id: { in: COMPANY_IDS } },
      include: {
        collections: {
          include: { quotes: true }
        }
      }
    });

    if (!companies || companies.length === 0) {
      console.log("No companies found.");
      return;
    }

    // Print nicely in console
    companies.forEach(company => {
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
      console.log(""); // blank line between companies
    });

    // Save to JSON file
    const filePath = path.join(__dirname, `companies-${COMPANY_IDS.join('-')}.json`);
    fs.writeFileSync(filePath, JSON.stringify(companies, null, 2), 'utf-8');
    console.log(`\nData written to ${filePath}`);

  } catch (error) {
    console.error("Error fetching data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();