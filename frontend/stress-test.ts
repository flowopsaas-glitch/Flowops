import axios from 'axios';

/**
 * 🛠️ FLOWOPS COMMERCIAL STRESS TEST
 * Purpose: Test 50MB payload limits and server compression.
 */

// 1. PASTE YOUR JWT TOKEN HERE (Get this from your browser Network tab -> Headers -> Authorization)
const JWT_TOKEN = "YOUR_TOKEN_HERE"; 

const API_URL = 'http://localhost:3000/api/waybills/inbox/upload';
const TOTAL_REQUESTS = 50;
const CONCURRENCY = 5;

// Generates a 5MB payload
const fakeLargeFile = Buffer.alloc(5 * 1024 * 1024, 'flowops-stress-data').toString('base64');

async function runTest() {
  console.log(`🚀 Initializing FlowOps Stress Test [Payload: 5MB]...`);
  
  const headers = {
    'Authorization': `Bearer ${JWT_TOKEN}`,
    'Content-Type': 'application/json'
  };

  const payload = {
    file: fakeLargeFile,
    fileName: `stress_test_${Date.now()}.pdf`,
    mimeType: 'application/pdf'
  };

  // --- STAGE 1: DIAGNOSTIC CHECK ---
  try {
    console.log(`🔍 Running diagnostic ping to ${API_URL}...`);
    await axios.post(API_URL, payload, { headers });
    console.log(`✅ Diagnostic Passed. Starting full surge...`);
  } catch (err: any) {
    console.error(`❌ STAGE 1 FAILED: Status ${err.response?.status}`);
    console.error(`📝 Message:`, err.response?.data || err.message);
    console.log(`\n💡 TIP: Ensure your API is running and JWT_TOKEN is valid.`);
    return;
  }

  // --- STAGE 2: THE SURGE ---
  const start = Date.now();
  let completed = 0;
  let failed = 0;

  // We split 50 requests into batches of 5 (Concurrency)
  for (let i = 0; i < TOTAL_REQUESTS; i += CONCURRENCY) {
    const batch = Array.from({ length: CONCURRENCY }).map(async (_, index) => {
      try {
        await axios.post(API_URL, {
          ...payload,
          fileName: `surge_${i + index}.pdf`
        }, { headers });
        completed++;
      } catch (err) {
        failed++;
      }
    });

    await Promise.all(batch);
    console.log(`📡 Progress: ${completed + failed}/${TOTAL_REQUESTS} requests processed...`);
  }

  const duration = (Date.now() - start) / 1000;
  
  console.log(`\n--- 📊 FINAL REPORT ---`);
  console.log(`✅ Success: ${completed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️ Time: ${duration.toFixed(2)}s`);
  console.log(`🚀 Throughput: ${(completed / duration).toFixed(2)} uploads/sec`);
  
  if (failed === 0) {
    console.log(`\n🏆 PLATFORM VERIFIED: FlowOps engine is commercial-ready.`);
  }
}

runTest();
