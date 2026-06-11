// src/test-backend-auto.ts
import fetch from 'node-fetch';

interface LoginResponse {
  accessToken: string;
}

interface Collection {
  id: number;
  name: string;
  description: string | null;
  companyId: number;
  status: string;
  createdById: number;
  createdAt: string;
  quotes?: Quote[];
}

interface Quote {
  id: number;
  collectionId: number;
  userId: number | null;
  text: string;
  author: string;
  createdAt: string;
}

(async () => {
  const BASE = 'http:/localhost:3000';

  // --- LOGIN ---
  console.log('🔑 Logging in to get JWT token...');
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@alpha.com', password: 'password123' }),
  });

  const loginData: LoginResponse = await loginRes.json() as LoginResponse;

  if (!loginData?.accessToken) {
    console.error('❌ Login failed');
    process.exit(1);
  }

  const token = loginData.accessToken;
  console.log('✅ Login successful. JWT token received.\n');

  // --- ENDPOINTS TO TEST ---
  const endpoints = ['/api/collections', '/api/companies/1/collections', '/api/quotes'];

  console.log('📊 Testing endpoints:\n');
  console.log(`| Endpoint                             | Status | Summary`);
  console.log(`|--------------------------------------|--------|--------`);

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${BASE}${ep}`, { headers: { Authorization: `Bearer ${token}` } });
      let summary: string;

      try {
        const data = await res.json();
        if (Array.isArray(data)) summary = `${data.length} item(s)`;
        else summary = JSON.stringify(data).slice(0, 50) + (JSON.stringify(data).length > 50 ? '...' : '');
      } catch {
        summary = res.statusText;
      }

      console.log(`| ${ep.padEnd(36)} | ${res.status.toString().padEnd(6)} | ${summary}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`| ${ep.padEnd(36)} | ERROR  | ${msg}`);
    }
  }

  console.log('\n✅ Dynamic backend test complete.');
})();