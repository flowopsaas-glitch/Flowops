// backend/sanity-check.ts
import fetch, { Response } from 'node-fetch';

// Types
interface User { id: string; email: string; role: string }
interface Company { id: string; name: string }
interface Quote { id: string; description: string }

// Safe JSON parser
async function parseJSON<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

async function main() {
  // Detect backend port
  const BACKEND_PORTS = [3000, 3001];
  let API_URL: string | null = null;

  for (const port of BACKEND_PORTS) {
    try {
      const res = await fetch(`http://localhost:${port}/auth/register`, { method: 'OPTIONS' });
      API_URL = `http://localhost:${port}`;
      break;
    } catch {
      // ignore
    }
  }

  if (!API_URL) {
    console.error('❌ Could not detect backend. Make sure NestJS is running on port 3000 or 3001.');
    process.exit(1);
  }

  // -----------------------
  // Sanity check steps
  // -----------------------
  try {
    console.log('--- Step 1: Register user ---');
    const registerPayload = { email: 'test@example.com', password: 'password123', role: 'ADMIN' };
    const registerRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registerPayload),
    });
    const registeredUser = await parseJSON<User>(registerRes);
    console.log('✅ Registered user:', registeredUser);

    console.log('--- Step 2: Login user ---');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: registerPayload.email, password: registerPayload.password }),
    });
    const loginData = await parseJSON<{ access_token: string }>(loginRes);
    const token = loginData.access_token;
    console.log('✅ Login successful, token:', token);

    console.log('--- Step 3: Get users ---');
    const usersRes = await fetch(`${API_URL}/users`, { headers: { Authorization: `Bearer ${token}` } });
    const users = await parseJSON<User[]>(usersRes);
    console.log(`✅ Fetched ${users.length} users`);

    console.log('--- Step 4: Get companies ---');
    const companiesRes = await fetch(`${API_URL}/companies`, { headers: { Authorization: `Bearer ${token}` } });
    const companies = await parseJSON<Company[]>(companiesRes);
    console.log(`✅ Fetched ${companies.length} companies`);

    console.log('--- Step 5: Get quotes ---');
    const quotesRes = await fetch(`${API_URL}/quotes`, { headers: { Authorization: `Bearer ${token}` } });
    const quotes = await parseJSON<Quote[]>(quotesRes);
    console.log(`✅ Fetched ${quotes.length} quotes`);

    console.log('🎉 Sanity check completed successfully!');
  } catch (err: any) {
    console.error('❌ Sanity check failed:', err.message);
  }
}

// Run the main async function
main();
