// test-backend-table.js
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const Table = require('cli-table3'); // npm install cli-table3

const LOGIN_URL = 'http://localhost:3000/api/auth/login';

// Define endpoints with nested checks
const ENDPOINTS = [
  { url: '/api/collections', name: 'All Collections', nestedChecks: ['quotes'] },
  { url: '/api/companies/1/collections', name: 'Company 1 Collections', nestedChecks: ['quotes'] },
  { url: '/api/collections/1', name: 'Collection 1 by ID', nestedChecks: ['quotes'] },
  { url: '/api/quotes', name: 'All Quotes', nestedChecks: ['collection'] }
];

const credentials = { email: 'admin@alpha.com', password: 'password123' };

(async () => {
  try {
    console.log("=== Logging in ===\n");

    const loginRes = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    const loginData = await loginRes.json();
    if (!loginRes.ok || !loginData.accessToken) {
      console.error("Login failed:", loginData);
      return;
    }

    const token = loginData.accessToken;
    const payload = jwt.decode(token);
    console.log("Login successful! JWT payload:", payload, "\n");

    // Create table
    const table = new Table({
      head: ['Endpoint', 'Items', 'Nested Issues', 'Status'],
      colWidths: [35, 10, 40, 10]
    });

    // Test endpoints
    for (const ep of ENDPOINTS) {
      const url = `http://localhost:3000${ep.url}`;
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();

        let count = Array.isArray(data) ? data.length : 1;
        let nestedIssues = [];

        if (res.ok && ep.nestedChecks?.length) {
          const items = Array.isArray(data) ? data : [data];
          for (const field of ep.nestedChecks) {
            items.forEach((item, i) => {
              if (!item[field]) nestedIssues.push(`Item ${i} missing '${field}'`);
            });
          }
        }

        let status;
        if (!res.ok) status = '❌';
        else if (nestedIssues.length > 0) status = '⚠️';
        else status = '✅';

        table.push([ep.name, count, nestedIssues.join('; ') || '-', status]);
      } catch (err) {
        table.push([ep.name, '-', err.message, '❌']);
      }
    }

    console.log(table.toString());
    console.log("\n=== Backend Integrity Table Complete ===");

  } catch (err) {
    console.error("Unexpected error:", err);
  }
})();