import fetch from "node-fetch"; // Node 20+ compatible
import Table from "cli-table3";

(async () => {
  const BASE = "http:/localhost:3000";

  // --- LOGIN ---
  console.log("Logging in to get JWT token...");
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@alpha.com", password: "password123" }),
  });

  const loginData: { accessToken?: string } = await loginRes.json();

  if (!loginData.accessToken) {
    console.error("Login failed, no access token returned.");
    process.exit(1);
  }

  const token = loginData.accessToken;
  console.log("✅ Login successful. JWT token received.\n");

  // --- ENDPOINTS TO TEST ---
  const endpoints = [
    "/api/collections",
    "/api/companies/1/collections",
    "/api/quotes",
  ];

  // Prepare table
  const table = new Table({
    head: ["Endpoint", "Status", "Result"],
    colWidths: [35, 10, 60],
    wordWrap: true,
  });

  // --- TEST ENDPOINTS ---
  for (const ep of endpoints) {
    try {
      const res = await fetch(BASE + ep, {
        headers: { Authorization: `Bearer ${token}` },
      });

      let data: any;
      try {
        data = await res.json();
      } catch {
        data = res.statusText;
      }

      const status = res.ok ? "✅" : "❌";
      table.push([ep, status, JSON.stringify(data, null, 2)]);
    } catch (err: any) {
      table.push([ep, "❌", err?.message || "Unknown error"]);
    }
  }

  // --- PRINT RESULTS ---
  console.log(table.toString());
})();