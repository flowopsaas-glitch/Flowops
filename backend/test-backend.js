// test-backend.js
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

const LOGIN_URL = 'http://localhost:3000/api/auth/login';

// List of endpoints to test
const ENDPOINTS = [
  { url: '/api/collections', name: 'All Collections' },
  { url: '/api/companies/1/collections', name: 'Company 1 Collections' },
  { url: '/api/collections/1', name: 'Collection 1 by ID' },
  { url: '/api/quotes', name: 'All Quotes' }
];

// Seeded user credentials
const credentials = {
  email: 'admin@alpha.com',
  password: 'password123'
};

(async () => {
  try {
    console.log("=== Logging in ===\n");

    // Login
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
    console.log("Login successful! JWT token received.\n");

    const payload = jwt.decode(token);
    console.log("Decoded JWT payload:", payload, "\n");

    console.log("=== Testing Endpoints ===\n");

    for (const ep of ENDPOINTS) {
      const url = `http://localhost:3000${ep.url}`;
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();

        if (res.ok) {
          let count = Array.isArray(data) ? data.length : 1;
          console.log(`✅ [${ep.name}] Success - ${count} item(s) returned`);
        } else {
          console.log(`❌ [${ep.name}] Error:`, data);
        }
      } catch (err) {
        console.log(`❌ [${ep.name}] Fetch error:`, err.message);
      }
    }

    console.log("\n=== Backend Test Complete ===");

  } catch (err) {
    console.error("Unexpected error during backend test:", err);
  }
})();