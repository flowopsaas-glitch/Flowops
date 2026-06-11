// test-backend-esm.mjs
import jwt from 'jsonwebtoken';
import Table from 'cli-table3';

// Login config
const LOGIN_URL = 'http://localhost:3000/api/auth/login';
const credentials = { email: 'admin@alpha.com', password: 'password123' };

// Controllers / endpoints
const CONTROLLERS = [
  { prefix: '/api/collections', nestedChecks: ['quotes'] },
  { prefix: '/api/companies/1/collections', nestedChecks: ['quotes'] },
  { prefix: '/api/collections/1', nestedChecks: ['quotes'] },
  { prefix: '/api/quotes', nestedChecks: ['collection'] }
];

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
      colWidths: [40, 10, 40, 10]
    });

    for (const ctrl of CONTROLLERS) {
      const url = `http://localhost:3000${ctrl.prefix}`;
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        });

        const data = await res.json();
        const count = Array.isArray(data) ? data.length : 1;

        // Nested checks
        let nestedIssues = [];
        if (ctrl.nestedChecks?.length) {
          const items = Array.isArray(data) ? data : [data];
          for (const field of ctrl.nestedChecks) {
            items.forEach((item, i) => {
              if (!item[field]) nestedIssues.push(`Item ${i} missing '${field}'`);
            });
          }
        }

        let status;
        if (!res.ok) status = '❌';
        else if (nestedIssues.length > 0) status = '⚠️';
        else status = '✅';

        table.push([ctrl.prefix, count, nestedIssues.join('; ') || '-', status]);
      } catch (err) {
        table.push([ctrl.prefix, '-', err.message, '❌']);
      }
    }

    console.log(table.toString());
    console.log("\n=== Dynamic Backend Test Complete ===");

  } catch (err) {
    console.error("Unexpected error:", err);
  }
})();