// fetch.js
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// --- Parse command line arguments ---
const args = process.argv.slice(2);
const COMPANY_IDS = [];
let onlyActive = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--company') {
    while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
      COMPANY_IDS.push(parseInt(args[++i], 10));
    }
  } else if (args[i] === '--active') {
    onlyActive = true;
  }
}

async function main() {
  try {
    console.log("Fetching companies...\n");

    // Build where clause
    const companyWhere = {};
    if (COMPANY_IDS.length > 0) companyWhere.id = { in: COMPANY_IDS };
    if (onlyActive) companyWhere.isActive = true;

    const companies = await prisma.company.findMany({
      where: companyWhere,
      include: {
        collections: {
          where: onlyActive ? { isActive: true } : undefined,
          include: { quotes: true }
        }
      }
    });

    if (!companies || companies.length === 0) {
      console.log("No companies found for the given criteria.");
      return;
    }

    // Console output
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
      console.log(""); // blank line

      // Write per-company JSON
      const companyFilePath = path.join(__dirname, `company-${company.id}.json`);
      fs.writeFileSync(companyFilePath, JSON.stringify(company, null, 2), 'utf-8');
    });

    // Master JSON
    const masterFileName = onlyActive ? 'all-active-companies.json' : 'all-companies.json';
    const masterFilePath = path.join(__dirname, masterFileName);
    fs.writeFileSync(masterFilePath, JSON.stringify(companies, null, 2), 'utf-8');

    console.log(`\nData written to:`);
    console.log(`- Master file: ${masterFilePath}`);
    console.log(`- Individual company files: company-<ID>.json`);

  } catch (error) {
    console.error("Error fetching data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();