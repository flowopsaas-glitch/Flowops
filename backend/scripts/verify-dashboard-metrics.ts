import axios from 'axios';

// 🚀 Forwards the call directly to the internal Docker service container name on port 3000
const INTERNAL_DOCKER_URL = 'http://flowops-backend:3000/api/dashboard/metrics';

async function runInternalDockerAuditPass() {
  console.log('📊 Initializing Isolated Mesh Network Data Delivery Verification Sweep...');
  
  try {
    const response = await axios.get(INTERNAL_DOCKER_URL, {
      headers: {
        'Authorization': 'Bearer safe-dev-bypass-handshake-token',
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Success: Safely bypassed host Nginx proxy layers via Docker Mesh!');
    console.log('--------------------------------------------------');
    console.log('📝 Raw API Response Object Structure:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('--------------------------------------------------');

    const metrics = response.data;

    console.log('🔍 Auditing UI State Binding Fields:');
    console.log(`🔹 Cards -> Pending Collections:   ${metrics.collections}`);
    console.log(`🔹 Cards -> Active Fleet Drivers:  ${metrics.activeDrivers}`);
    console.log(`🔹 Cards -> In Transit (N1 Line):  ${metrics.transit}`);
    console.log(`🔹 Cards -> At Regional Warehouses: ${metrics.stock}`);
    console.log(`🔹 Cards -> Exception Incidents:   ${metrics.risks}`);
    console.log(`🔹 Map   -> Registered Vehicle Pins: ${metrics.drivers?.length || 0}`);

  } catch (error: any) {
    console.error('❌ Data Delivery Audit Terminated due to Error:', error.message);
    if (error.response?.data) {
      console.error('Diagnostic Data Payload Context:', JSON.stringify(error.response.data));
    }
    process.exit(1);
  }
}

runInternalDockerAuditPass();

