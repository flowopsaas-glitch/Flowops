// src/test-auto-routes.ts
import jwt from 'jsonwebtoken';
import Table from 'cli-table3';

// Login credentials
const LOGIN_URL = 'http:/localhost:3000/api/auth/login';
const credentials = { email: 'admin@alpha.com', password: 'password123' };

// List endpoints to test
const ENDPOINTS: { url: string; nested?: string[] }[] = [
  { url: '/api/collections', nested: ['quotes'] },
  { url: '/api/companies/1/collections', nested: ['quotes'] },
  { url: '/api/quotes', nested: ['collection'] },
];

(async () => {
  try {
    console.log('=== Logging in ===\n');

    // Use Node 20+ global fetch
    const loginRes = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    const loginData: unknown = await loginRes.json();

    if (!loginRes.ok || !(loginData as any).accessToken) {
      console.error('Login failed:', loginData);
      return;
    }

    const token: string = (loginData as any).accessToken;
    console.log('Login successful! JWT payload:', jwt.decode(token), '\n');

    const table = new Table({
      head: ['Endpoint', 'Items', 'Nested Issues', 'Status'],
      colWidths: [40, 10, 40, 10],
    });

    for (const ep of ENDPOINTS) {
      const url = `http:/localhost:3000${ep.url}`;
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });

        const data: any = await res.json();
        const items = Array.isArray(data) ? data : [data];
        const count = items.length;

        let nestedIssues: string[] = [];
        if (ep.nested?.length) {
          for (const field of ep.nested) {
            items.forEach((item, i) => {
              if (!item[field]) nestedIssues.push(`Item ${i} missing '${field}'`);
            });
          }
        }

        let status = res.ok ? '✅' : '❌';
        if (nestedIssues.length > 0) status = '⚠️';

        table.push([ep.url, count, nestedIssues.join('; ') || '-', status]);
      } catch (err: unknown) {
        table.push([ep.url, '-', (err as Error).message, '❌']);
      }
    }

    console.log(table.toString());
    console.log('\n=== Backend Auto Routes Test Complete ===');
  } catch (err: unknown) {
    console.error('Unexpected error:', (err as Error).message);
  }
})();