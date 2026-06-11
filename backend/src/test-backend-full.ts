// src/test-backend-full.ts
import fetch from 'node-fetch'; // npm i node-fetch
import Table from 'cli-table3'; // npm i cli-table3

type UserCredentials = { email: string; password: string };
type TestEndpoint = { url: string; method: string; nested?: string[] };

const BASE_URL = 'http:/localhost:3000';
const ADMIN: UserCredentials = { email: 'admin@alpha.com', password: 'password123' };
const COMPANY_USER: UserCredentials = { email: 'user@alpha.com', password: 'password123' };

const GET_ENDPOINTS: TestEndpoint[] = [
  { url: '/api/collections', method: 'GET', nested: ['quotes'] },
  { url: '/api/companies/1/collections', method: 'GET', nested: ['quotes'] },
  { url: '/api/quotes', method: 'GET', nested: ['collection'] },
  { url: '/health', method: 'GET' },
];

const POST_ENDPOINTS: TestEndpoint[] = [
  { url: '/api/collections', method: 'POST' },
  { url: '/api/quotes', method: 'POST' },
];

const PUT_ENDPOINTS: TestEndpoint[] = [
  { url: '/api/collections/1', method: 'PUT' },
  { url: '/api/quotes/1', method: 'PUT' },
];

const DELETE_ENDPOINTS: TestEndpoint[] = [
  { url: '/api/collections/1', method: 'DELETE' },
  { url: '/api/quotes/1', method: 'DELETE' },
];

// Utility to login and get JWT
async function login(credentials: UserCredentials): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  const data: any = await res.json();
  if (!res.ok || !data.accessToken) throw new Error(`Login failed: ${JSON.stringify(data)}`);
  return data.accessToken;
}

// Generic request
async function testEndpoint(ep: TestEndpoint, token?: string) {
  try {
    const headers: any = token ? { Authorization: `Bearer ${token}` } : {};
    if (ep.method === 'POST' || ep.method === 'PUT') headers['Content-Type'] = 'application/json';

    let body: any = undefined;
    if (ep.method === 'POST' && ep.url.includes('collections')) body = JSON.stringify({ name: 'Test Collection', companyId: 1 });
    if (ep.method === 'POST' && ep.url.includes('quotes')) body = JSON.stringify({ text: 'Test Quote', author: 'Tester', collectionId: 1 });
    if (ep.method === 'PUT') body = JSON.stringify({ name: 'Updated Name' });

    const res = await fetch(`${BASE_URL}${ep.url}`, { method: ep.method, headers, body });
    const data = await res.json().catch(() => ({}));

    let nestedIssues: string[] = [];
    if (ep.nested && Array.isArray(data)) {
      for (const field of ep.nested) data.forEach((item, i) => { if (!item[field]) nestedIssues.push(`Item ${i} missing '${field}'`); });
    }

    const status = res.ok ? (nestedIssues.length ? '⚠️' : '✅') : '❌';
    return [ep.url, ep.method, Array.isArray(data) ? data.length : 1, nestedIssues.join('; ') || '-', status];
  } catch (err: unknown) {
    return [ep.url, ep.method, '-', (err as Error).message, '❌'];
  }
}

(async () => {
  console.log('--- Backend Full Test Start ---');

  const adminToken = await login(ADMIN);
  const userToken = await login(COMPANY_USER).catch(() => undefined);

  const table = new Table({ head: ['Endpoint', 'Method', 'Items', 'Nested Issues', 'Status'], colWidths: [40, 10, 10, 40, 10] });

  // GET tests
  for (const ep of GET_ENDPOINTS) table.push(await testEndpoint(ep, adminToken));
  // POST tests
  for (const ep of POST_ENDPOINTS) table.push(await testEndpoint(ep, adminToken));
  // PUT tests
  for (const ep of PUT_ENDPOINTS) table.push(await testEndpoint(ep, adminToken));
  // DELETE tests
  for (const ep of DELETE_ENDPOINTS) table.push(await testEndpoint(ep, adminToken));

  // Role-based test
  if (userToken) {
    table.push(await testEndpoint({ url: '/api/collections', method: 'GET' }));
    table.push(await testEndpoint({ url: '/api/collections', method: 'GET', nested: ['quotes'] }, userToken));
  }

  console.log(table.toString());
  console.log('--- Backend Full Test Complete ---');
})();