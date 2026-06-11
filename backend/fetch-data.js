// fetch-data.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Fetching all companies with their collections and quotes...\n");

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

      console.log(""); // empty line between companies
    });

  } catch (error) {
    console.error("Error fetching data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();