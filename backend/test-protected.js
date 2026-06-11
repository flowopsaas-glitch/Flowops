// test-protected.js
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

const LOGIN_URL = 'http://localhost:3000/api/auth/login';

// List of protected endpoints to test
const ENDPOINTS = [
  '/api/collections',           // adjust to your real route
  '/api/companies/1/collections', // example: collections of company 1
  '/api/quotes'                 // adjust as needed
];

const credentials = {
  email: 'admin@alpha.com',
  password: 'password123'
};

(async () => {
  try {
    console.log("Logging in to get JWT token...\n");

    // 1️⃣ Login
    const loginRes = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    const loginData = await loginRes.json();

    if (!loginRes.ok) {
      console.error("Login failed:", loginData);
      return;
    }

    const token = loginData.accessToken;
    if (!token) {
      console.error("No accessToken received.");
      return;
    }

    console.log("Login successful. JWT token received.");
    console.log("Decoded JWT payload:", jwt.decode(token), "\n");

    // 2️⃣ Test protected endpoints
    for (const ep of ENDPOINTS) {
      const url = `http://localhost:3000${ep}`;
      console.log(`Testing endpoint: ${url}`);

      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();

        if (res.ok) {
          console.log(`✅ Success:`);
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(`❌ Error:`, data);
        }
      } catch (err) {
        console.log(`❌ Fetch error for ${url}:`, err.message);
      }

      console.log('---'); // separator
    }

  } catch (err) {
    console.error("Error during protected endpoint test:", err);
  }
})();