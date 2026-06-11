// fetch-active-companies.js
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Fetching all ACTIVE companies with their ACTIVE collections and quotes...\n");

    const companies = await prisma.company.findMany({
      where: { isActive: true },
      include: {
        collections: {
          where: { isActive: true },
          include: { quotes: true }
        }
      }
    });

    if (!companies || companies.length === 0) {
      console.log("No active companies found.");
      return;
    }

    // Print nicely in console
    companies.forEach(company => {
      console.log(`Company: ${company.name} (ID: ${company.id})`);
      if (!company.collections || company.collections.length === 0) {
        console.log("  No active collections found.");
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
      console.log(""); // empty line between companies

      // Write individual JSON file for this company
      const companyFilePath = path.join(__dirname, `active-company-${company.id}.json`);
      fs.writeFileSync(companyFilePath, JSON.stringify(company, null, 2), 'utf-8');
    });

    // Write master JSON file for all active companies
    const masterFilePath = path.join(__dirname, 'all-active-companies.json');
    fs.writeFileSync(masterFilePath, JSON.stringify(companies, null, 2), 'utf-8');

    console.log(`\nAll active data written to:`);
    console.log(`- Master file: ${masterFilePath}`);
    console.log(`- Individual company files: active-company-<ID>.json`);

  } catch (error) {
    console.error("Error fetching data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();