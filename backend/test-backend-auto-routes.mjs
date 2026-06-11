import jwt from 'jsonwebtoken';
import Table from 'cli-table3';
import fetch from 'node-fetch'; // Only needed if CommonJS build

const LOGIN_URL = 'http://localhost:3000/api/auth/login';
const credentials = { email: 'admin@alpha.com', password: 'password123' };

const ENDPOINTS = [
  { url: '/api/collections', nested: ['quotes'] },
  { url: '/api/companies/1/collections', nested: ['quotes'] },
  { url: '/api/quotes', nested: ['collection'] },
];

(async () => {
  try {
    const loginRes = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    const loginData = await loginRes.json();
    const token = loginData.accessToken;
    const payload = jwt.decode(token);
    console.log("Login JWT payload:", payload);

    const table = new Table({
      head: ['Endpoint', 'Items', 'Nested Issues', 'Status'],
      colWidths: [40, 10, 40, 10]
    });

    for (const ep of ENDPOINTS) {
      const url = `http://localhost:3000${ep.url}`;
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        const count = Array.isArray(data) ? data.length : 1;

        let nestedIssues = [];
        if (ep.nested?.length) {
          const items = Array.isArray(data) ? data : [data];
          for (const field of ep.nested) {
            items.forEach((item, i) => {
              if (!item[field]) nestedIssues.push(`Item ${i} missing '${field}'`);
            });
          }
        }

        let status = res.ok ? '✅' : '❌';
        if (nestedIssues.length > 0) status = '⚠️';

        table.push([ep.url, count, nestedIssues.join('; ') || '-', status]);
      } catch (err) {
        table.push([ep.url, '-', err.message, '❌']);
      }
    }

    console.log(table.toString());
    console.log("\n=== Backend Test Complete ===");
  } catch (err) {
    console.error("Unexpected error:", err);
  }
})();