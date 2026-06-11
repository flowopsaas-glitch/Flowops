// test-login.js
// Node 20+ built-in fetch
import jwt from 'jsonwebtoken';

const LOGIN_URL = 'http://localhost:3000/api/auth/login';
const credentials = { email: 'admin@alpha.com', password: 'password123' };

(async () => {
  try {
    console.log("Testing auth login...\n");

    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    const data = await res.json();

    if (!res.ok || !data.accessToken) {
      console.error("Login failed:", data);
      return;
    }

    console.log("Login successful!");
    console.log("Raw response:", data);

    const payload = jwt.decode(data.accessToken);
    console.log("\nDecoded JWT payload:");
    console.log(payload);
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : err);
  }
})();