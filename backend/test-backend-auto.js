// test-backend-auto.js
(async () => {
  const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

  const BASE = 'http://localhost:3000';

  // --- LOGIN ---
  console.log('🔑 Logging in to get JWT token...');
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@alpha.com', password: 'password123' }),
  });

  const loginData = await loginRes.json();
  if (!loginData.accessToken) {
    console.error('❌ Login failed');
    process.exit(1);
  }

  const token = loginData.accessToken;
  console.log('✅ Login successful. JWT token received.\n');

  // --- ENDPOINTS TO TEST ---
  const endpoints = ['/api/collections', '/api/companies/1/collections', '/api/quotes'];

  console.log('📊 Testing endpoints:\n');

  // --- HEADER ---
  console.log(`| Endpoint                             | Status | Summary`);
  console.log(`|--------------------------------------|--------|--------`);

  // --- TEST EACH ENDPOINT ---
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${BASE}${ep}`, { headers: { Authorization: `Bearer ${token}` } });
      let summary;

      try {
        const data = await res.json();
        if (Array.isArray(data)) summary = `${data.length} item(s)`;
        else summary = JSON.stringify(data).slice(0, 50) + (JSON.stringify(data).length > 50 ? '...' : '');
      } catch {
        summary = res.statusText;
      }

      console.log(`| ${ep.padEnd(36)} | ${res.status.toString().padEnd(6)} | ${summary}`);
    } catch (e) {
      console.log(`| ${ep.padEnd(36)} | ERROR  | ${e?.message || e}`);
    }
  }

  console.log('\n✅ Dynamic backend test complete.');
})();