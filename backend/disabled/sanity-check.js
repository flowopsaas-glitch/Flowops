"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/sanity-check.ts
const node_fetch_1 = __importDefault(require("node-fetch"));
// Safe JSON parser
async function parseJSON(res) {
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return (await res.json());
}
async function main() {
    // Detect backend port
    const BACKEND_PORTS = [3000, 3001];
    let API_URL = null;
    for (const port of BACKEND_PORTS) {
        try {
            const res = await (0, node_fetch_1.default)(`http://localhost:${port}/auth/register`, { method: 'OPTIONS' });
            API_URL = `http://localhost:${port}`;
            break;
        }
        catch {
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
        const registerRes = await (0, node_fetch_1.default)(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(registerPayload),
        });
        const registeredUser = await parseJSON(registerRes);
        console.log('✅ Registered user:', registeredUser);
        console.log('--- Step 2: Login user ---');
        const loginRes = await (0, node_fetch_1.default)(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: registerPayload.email, password: registerPayload.password }),
        });
        const loginData = await parseJSON(loginRes);
        const token = loginData.access_token;
        console.log('✅ Login successful, token:', token);
        console.log('--- Step 3: Get users ---');
        const usersRes = await (0, node_fetch_1.default)(`${API_URL}/users`, { headers: { Authorization: `Bearer ${token}` } });
        const users = await parseJSON(usersRes);
        console.log(`✅ Fetched ${users.length} users`);
        console.log('--- Step 4: Get companies ---');
        const companiesRes = await (0, node_fetch_1.default)(`${API_URL}/companies`, { headers: { Authorization: `Bearer ${token}` } });
        const companies = await parseJSON(companiesRes);
        console.log(`✅ Fetched ${companies.length} companies`);
        console.log('--- Step 5: Get quotes ---');
        const quotesRes = await (0, node_fetch_1.default)(`${API_URL}/quotes`, { headers: { Authorization: `Bearer ${token}` } });
        const quotes = await parseJSON(quotesRes);
        console.log(`✅ Fetched ${quotes.length} quotes`);
        console.log('🎉 Sanity check completed successfully!');
    }
    catch (err) {
        console.error('❌ Sanity check failed:', err.message);
    }
}
// Run the main async function
main();
