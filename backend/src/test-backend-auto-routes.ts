import fetch from "node-fetch"; // npm i node-fetch

const BASE = "http:/localhost:3000";

interface EndpointResult {
  url: string;
  status: number | string;
  count?: number;
  error?: string;
}

(async () => {
  console.log("🔑 Logging in...");

  try {
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@alpha.com", password: "password123" }),
    });

    const loginData: any = await loginRes.json();
    if (!loginData.accessToken) throw new Error("Login failed, no token received");

    const token = loginData.accessToken;
    console.log("✅ Login successful.\n");

    const endpoints = [
      "/api/collections",
      "/api/companies/1/collections",
      "/api/quotes",
    ];

    console.log("📊 Testing endpoints with JWT token...\n");

    const results: EndpointResult[] = [];

    for (const ep of endpoints) {
      try {
        const res = await fetch(BASE + ep, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => null);

        const count = Array.isArray(data) ? data.length : undefined;
        results.push({ url: ep, status: res.status, count });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.push({ url: ep, status: "❌", error: errorMsg });
      }
    }

    // Print results table
    console.log("Endpoint results:\n");
    console.log("URL".padEnd(35) + "| Status | Items/Error");
    console.log("-".repeat(60));
    for (const r of results) {
      const items = r.count !== undefined ? `${r.count} item(s)` : r.error || "-";
      console.log(r.url.padEnd(35) + `| ${r.status}`.padEnd(7) + `| ${items}`);
    }

    console.log("\n✅ Dynamic backend test complete.");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("❌ Test script failed:", msg);
  }
})();