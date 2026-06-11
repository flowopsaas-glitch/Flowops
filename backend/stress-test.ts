import axios from 'axios';

const API_URL = 'http://localhost:3000/api/waybills/inbox/upload';
const TOTAL_REQUESTS = 50;
const CONCURRENCY = 5;

// Generate a 5MB payload
const fakeLargeFile = Buffer.alloc(5 * 1024 * 1024, 'flowops-engine-test').toString('base64');

async function runTest() {
  console.log(`🚀 SURGE INITIATED: Testing 50MB limits via Bypass Key...`);

  const headers = {
    'x-stress-test': 'flowops-secret-123',
    'Content-Type': 'application/json'
  };

  const payload = {
    file: `data:application/pdf;base64,${fakeLargeFile}`,
    fileName: `stress_test_${Date.now()}.pdf`,
    mimeType: 'application/pdf'
  };

  const start = Date.now();
  let count = 0;

  try {
    for (let i = 0; i < TOTAL_REQUESTS / CONCURRENCY; i++) {
      const batch = Array.from({ length: CONCURRENCY }).map(async () => {
        try {
          const res = await axios.post(API_URL, payload, { headers });
          if (res.status === 201 || res.status === 200) count++;
        } catch (e: any) {
          console.log(`❌ Request Rejected: ${e.response?.status || 'Connection Reset'}`);
        }
      });
      await Promise.all(batch);
      console.log(`⚡ ${count}/${TOTAL_REQUESTS} Uploads Successful...`);
    }

    const duration = (Date.now() - start) / 1000;
    console.log(`\n🏆 TEST COMPLETE`);
    console.log(`📊 Result: 250MB processed in ${duration.toFixed(2)}s`);
    console.log(`🚀 Speed: ${(250 / duration).toFixed(2)} MB/s`);
    
  } catch (err) {
    console.error(`🛑 System Error: API unreachable.`);
  }
}

runTest();
